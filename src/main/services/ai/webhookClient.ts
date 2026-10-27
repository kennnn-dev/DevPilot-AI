/**
 * Custom Webhook Client.
 * Preserves 100% backward compatibility with n8n and generic HTTP POST webhook endpoints.
 */

import { extractCommitText, parseConventionalCommit } from './promptBuilder';
import { executeFetchWithTimeout, sanitizeErrorMessage } from './aiUtils';
import type {
  GenerateCommitOptions,
  GeneratedCommitResult,
  GitAllStagedDiffResult,
  IPCResult,
  WebhookCommitPayload,
  WebhookRepositoryContext,
} from '../../../shared/types';

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
 * Validates webhook URL format and protocol.
 */
export function validateWebhookUrl(url: string): { isValid: boolean; error?: string } {
  if (!url) {
    return {
      isValid: false,
      error: 'Webhook URL is not configured. Please set the endpoint in Settings or define DEVPILOT_WEBHOOK_URL in .env.',
    };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Webhook URL must use HTTP or HTTPS protocol.' };
    }
    return { isValid: true };
  } catch {
    return { isValid: false, error: 'Invalid Webhook URL format.' };
  }
}

/**
 * Dispatches structured staged diff payload to custom HTTP POST webhook.
 */
export async function generateWebhookCommit(
  options: Partial<GenerateCommitOptions>,
  repoContext: WebhookRepositoryContext,
  diffData: GitAllStagedDiffResult
): Promise<IPCResult<GeneratedCommitResult>> {
  const rawUrl = (options.webhookUrl && options.webhookUrl.trim()) || getEnvWebhookUrl();
  const validation = validateWebhookUrl(rawUrl);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }
  const webhookUrl = rawUrl;

  const payload: WebhookCommitPayload = {
    repository: repoContext,
    repoPath: repoContext.repoPath,
    branch: repoContext.branch,
    isDetached: repoContext.isDetached,
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

  const token = (options.webhookToken && options.webhookToken.trim()) || getEnvWebhookToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
  };

  if (token) {
    const cleanToken = token.trim();
    const rawSecret = cleanToken.replace(/^Bearer\s+/i, '').trim();
    headers['Authorization'] = cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`;
    headers['X-API-KEY'] = rawSecret || cleanToken;
  }

  try {
    const response = await executeFetchWithTimeout(
      webhookUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      'Webhook',
      30000
    );

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
      const rawSecret = token.replace(/^Bearer\s+/i, '').trim();
      return {
        success: false,
        error: sanitizeErrorMessage(`Webhook returned HTTP ${response.status}${preview}`, token, rawSecret),
      };
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
    const errorObj = err as { code?: string; message?: string; name?: string; cause?: { code?: string } };
    const code = errorObj?.code || errorObj?.cause?.code;
    const msg = errorObj?.message || String(err);

    if (errorObj?.name === 'AbortError' || msg.includes('timed out after 30 seconds')) {
      return { success: false, error: 'Webhook request timed out after 30 seconds.' };
    }
    if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED') || msg.toLowerCase().includes('connection refused')) {
      return { success: false, error: 'Webhook request failed: Connection refused. Check if your webhook server is running.' };
    }
    if (
      code === 'ENOTFOUND' ||
      msg.includes('ENOTFOUND') ||
      msg.toLowerCase().includes('getaddrinfo') ||
      msg.toLowerCase().includes('dns resolution')
    ) {
      return { success: false, error: 'Webhook request failed: Host not found (DNS resolution error). Check your webhook URL.' };
    }
    if (code === 'ETIMEDOUT' || msg.includes('ETIMEDOUT')) {
      return { success: false, error: 'Webhook request timed out connecting to server.' };
    }

    const rawSecret = token.replace(/^Bearer\s+/i, '').trim();
    return { success: false, error: sanitizeErrorMessage(msg, token, rawSecret) };
  }
}
