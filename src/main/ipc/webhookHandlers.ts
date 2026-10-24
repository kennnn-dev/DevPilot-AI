import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import type {
  IPCResult,
  WebhookGenerateCommitOptions,
  GeneratedCommitResult,
  ParsedConventionalCommit,
  WebhookCommitPayload,
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

export function validateWebhookOptions(options: unknown): { isValid: boolean; error?: string } {
  if (!options || typeof options !== 'object') {
    return { isValid: false, error: 'Options must be an object.' };
  }
  const { webhookUrl, repoPath } = options as Record<string, unknown>;
  if (typeof webhookUrl !== 'string' || webhookUrl.trim().length === 0) {
    return { isValid: false, error: 'Webhook URL must be a non-empty string.' };
  }
  try {
    const parsed = new URL(webhookUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Webhook URL must use HTTP or HTTPS protocol.' };
    }
  } catch {
    return { isValid: false, error: 'Invalid Webhook URL format.' };
  }
  if (typeof repoPath !== 'string' || repoPath.trim().length === 0) {
    return { isValid: false, error: 'Repository path must be a non-empty string.' };
  }
  return { isValid: true };
}

export async function handleWebhookGenerateCommit(
  options: WebhookGenerateCommitOptions
): Promise<IPCResult<GeneratedCommitResult>> {
  const validation = validateWebhookOptions(options);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const { webhookUrl, repoPath } = options;
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
    branch,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
    };

    const token =
      (options.webhookToken && options.webhookToken.trim()) ||
      process.env.DEVPILOT_WEBHOOK_TOKEN ||
      process.env.DEVPILOT_API_KEY ||
      process.env.X_API_KEY ||
      process.env.N8N_WEBHOOK_TOKEN;

    if (token && token.trim()) {
      const cleanToken = token.trim();
      headers['Authorization'] = cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`;
      headers['X-API-KEY'] = cleanToken;
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
      return { success: false, error: `Webhook returned HTTP ${response.status}: ${errText.slice(0, 150)}` };
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
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as { name?: string })?.name === 'AbortError') {
      return { success: false, error: 'Webhook request timed out after 30 seconds.' };
    }
    return { success: false, error: `Webhook request failed: ${msg}` };
  }
}

export function registerWebhookHandlers(): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT);
  }
  ipcMain.handle(IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT, async (_event, options: WebhookGenerateCommitOptions) => {
    return await handleWebhookGenerateCommit(options);
  });
}
