import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import type {
  IPCResult,
  WebhookGenerateCommitOptions,
  GeneratedCommitResult,
  ParsedConventionalCommit,
  WebhookCommitPayload,
  ResolvedWebhookConfig,
  WebhookConfigDefaults,
} from '../../shared/types';
import { gitService } from '../git/gitService';

export function cleanRawResponse(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  const match = cleaned.match(/^\`\`\`(?:commit|git|markdown|text|json)?\r?\n([\s\S]*?)\r?\n\`\`\`$/m);
  if (match) cleaned = match[1].trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  const prefixRegex = /^(?:Here\s+(?:is|are)\s+(?:the|a)\s+commit\s+message(?:\s+for\s+your\s+changes)?:?|Suggested\s+commit\s+message:?|Proposed\s+commit\s+message:?|Commit\s+message:?|Here's\s+(?:a|the|your)\s+commit\s+message:?)\s*/i;
  cleaned = cleaned.replace(prefixRegex, '').trim();
  return cleaned;
}

export function extractCommitText(raw: unknown): string {
  if (typeof raw === 'string') return cleanRawResponse(raw);
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['message', 'commitMessage', 'commit', 'text', 'output', 'response']) {
      if (typeof obj[key] === 'string') return cleanRawResponse(obj[key] as string);
    }
    if (obj.data) return extractCommitText(obj.data);
    if (Array.isArray(obj.choices) && obj.choices[0]?.message?.content) {
      return cleanRawResponse(obj.choices[0].message.content);
    }
  }
  return cleanRawResponse(String(raw ?? ''));
}

export function parseConventionalCommit(commitText: string): ParsedConventionalCommit {
  const raw = commitText.trim();
  if (!raw) return { raw: '', type: 'chore', subject: '', isBreaking: false, isValid: false };

  const lines = raw.split(/\r?\n/);
  const header = lines[0].trim();
  const body = lines.slice(1).join('\n').trim() || undefined;

  const regex = /^([a-zA-Z0-9_-]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
  const match = header.match(regex);
  const isBreaking = Boolean(match?.[3]) || /BREAKING[ -]CHANGE:/i.test(raw);

  if (match) {
    return {
      raw,
      type: match[1].toLowerCase(),
      scope: match[2]?.trim() || undefined,
      isBreaking,
      subject: match[4].trim(),
      body,
      isValid: true,
    };
  }

  return {
    raw,
    type: 'chore',
    subject: header,
    body,
    isBreaking,
    isValid: false,
  };
}

/**
 * Resolves the webhook URL from environment variables across known aliases.
 */
export function getEnvWebhookUrl(): string {
  const url =
    process.env.DEVPILOT_WEBHOOK_URL ||
    process.env.N8N_WEBHOOK_URL ||
    process.env.WEBHOOK_URL ||
    '';
  return url.trim();
}

/**
 * Resolves the webhook token from environment variables across known aliases.
 */
export function getEnvWebhookToken(): string {
  const token =
    process.env.DEVPILOT_WEBHOOK_TOKEN ||
    process.env.DEVPILOT_API_KEY ||
    process.env.X_API_KEY ||
    process.env.N8N_WEBHOOK_TOKEN ||
    '';
  return token.trim();
}

/**
 * IPC handler for 'settings:get-webhook-config'.
 * Returns resolved environment defaults without leaking secret tokens.
 */
export function handleGetWebhookConfig(): IPCResult<ResolvedWebhookConfig & WebhookConfigDefaults> {
  const envWebhookUrl = getEnvWebhookUrl();
  const envToken = getEnvWebhookToken();
  const hasEnvToken = Boolean(envToken);

  return {
    success: true,
    data: {
      webhookUrl: envWebhookUrl,
      source: envWebhookUrl ? 'env' : 'none',
      envDefaults: {
        webhookUrl: envWebhookUrl,
        hasToken: hasEnvToken,
      },
      url: envWebhookUrl,
      envWebhookUrl,
      hasEnvToken,
      activeSource: envWebhookUrl ? 'env' : 'none',
    },
  };
}

export interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
  resolvedUrl?: string;
}

/**
 * Validates webhook options with hybrid environment URL fallback.
 */
export function validateWebhookOptions(options: unknown): WebhookValidationResult {
  if (!options || typeof options !== 'object') {
    return { isValid: false, error: 'Options must be an object.' };
  }
  const opts = options as Record<string, unknown>;
  const rawUrl = typeof opts.webhookUrl === 'string' ? opts.webhookUrl.trim() : '';
  const resolvedUrl = rawUrl || getEnvWebhookUrl();

  if (!resolvedUrl) {
    return {
      isValid: false,
      error: 'Webhook URL is not configured. Please set the endpoint in Settings or define DEVPILOT_WEBHOOK_URL in .env.',
    };
  }

  try {
    const parsed = new URL(resolvedUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Webhook URL must use HTTP or HTTPS protocol.' };
    }
  } catch {
    return { isValid: false, error: 'Invalid Webhook URL format.' };
  }

  if (typeof opts.repoPath !== 'string' || opts.repoPath.trim().length === 0) {
    return { isValid: false, error: 'Repository path must be a non-empty string.' };
  }

  return { isValid: true, resolvedUrl };
}

export async function handleWebhookGenerateCommit(
  options: WebhookGenerateCommitOptions
): Promise<IPCResult<GeneratedCommitResult>> {
  const validation = validateWebhookOptions(options);
  if (!validation.isValid || !validation.resolvedUrl) {
    return { success: false, error: validation.error };
  }

  const webhookUrl = validation.resolvedUrl;
  const repoPath = (options.repoPath || '').trim();

  const diffResult = await gitService.getAllStagedDiff(repoPath);
  if (!diffResult.success || !diffResult.data) {
    return { success: false, error: diffResult.error || 'Failed to query staged diff.' };
  }

  const diffData = diffResult.data;
  if (diffData.isEmpty && diffData.stagedFiles.length === 0) {
    return { success: false, error: 'No staged changes found in repository.' };
  }

  const statusResult = await gitService.getStatus(repoPath);
  const branch = statusResult.data?.branch || 'main';
  const isDetached = statusResult.data?.isDetached || false;

  const payload: WebhookCommitPayload = {
    repository: { repoPath, branch, isDetached },
    repoPath,
    branch,
    isDetached,
    stagedFiles: diffData.stagedFiles.map((f) => ({
      path: f.path,
      oldPath: f.oldPath,
      changeType: f.changeType,
      statusCode: f.statusCode,
    })),
    diffSummary: diffData.summary,
    diff: diffData.rawDiff,
    stagedDiff: diffData.rawDiff,
  };

  if (options.customPrompt && typeof options.customPrompt === 'string' && options.customPrompt.trim().length > 0) {
    payload.customPrompt = options.customPrompt.trim();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
    };

    const token =
      (options.webhookToken && options.webhookToken.trim()) ||
      getEnvWebhookToken();

    if (token) {
      const cleanToken = token.trim();
      const rawSecret = cleanToken.replace(/^Bearer\s+/i, '').trim();
      headers['Authorization'] = cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`;
      headers['X-API-KEY'] = rawSecret || cleanToken;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 401) {
        return {
          success: false,
          error: 'Webhook returned HTTP 401: Unauthorized. Please check your API/bearer token in Settings.',
        };
      }
      if (response.status === 403) {
        return {
          success: false,
          error: 'Webhook returned HTTP 403: Forbidden. Please verify endpoint permissions in Settings.',
        };
      }
      const preview = errText.trim() ? `: ${errText.trim().slice(0, 150)}` : '';
      return { success: false, error: `Webhook returned HTTP ${response.status}${preview}` };
    }

    const resText = await response.text();
    let resJson: unknown;
    try {
      resJson = JSON.parse(resText);
    } catch {
      resJson = resText;
    }

    const commitMessage = extractCommitText(resJson);
    const parsed = parseConventionalCommit(commitMessage);

    return {
      success: true,
      data: {
        commitMessage,
        parsed,
        rawResponse: resJson,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if ((err as { name?: string })?.name === 'AbortError') {
      return { success: false, error: 'Webhook request timed out after 30 seconds.' };
    }

    const errorObj = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const errorCode = errorObj?.code || errorObj?.cause?.code;
    const baseMsg = errorObj?.message || String(err);

    if (errorCode === 'ECONNREFUSED' || baseMsg.includes('ECONNREFUSED') || baseMsg.toLowerCase().includes('connection refused')) {
      return { success: false, error: 'Webhook request failed: Connection refused. Check if your webhook server is running.' };
    }
    if (errorCode === 'ENOTFOUND' || baseMsg.includes('ENOTFOUND') || baseMsg.toLowerCase().includes('getaddrinfo') || baseMsg.toLowerCase().includes('dns resolution')) {
      return { success: false, error: 'Webhook request failed: Host not found (DNS resolution error). Check your webhook URL.' };
    }
    if (errorCode === 'ETIMEDOUT' || baseMsg.includes('ETIMEDOUT')) {
      return { success: false, error: 'Webhook request timed out connecting to server.' };
    }

    return { success: false, error: `Webhook request failed: ${baseMsg}` };
  }
}

export function registerWebhookHandlers(): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT);
    ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_GET_WEBHOOK_CONFIG);
  }

  ipcMain.handle(
    IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT,
    async (_event, options: WebhookGenerateCommitOptions) => {
      return await handleWebhookGenerateCommit(options);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_WEBHOOK_CONFIG,
    async () => {
      return handleGetWebhookConfig();
    }
  );
}
