import type { ResolvedWebhookConfig } from '../../shared/types';

export const STORAGE_KEY_WEBHOOK_URL = 'devpilot_n8n_webhook_url_v1';
export const STORAGE_KEY_WEBHOOK_TOKEN = 'devpilot_n8n_webhook_token_v1';

export function getWebhookToken(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN) || '';
    }
  } catch {
    // ignore
  }
  return '';
}

export function setWebhookToken(token: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_WEBHOOK_TOKEN, (token || '').trim());
    }
  } catch {
    // ignore
  }
}

export function clearWebhookToken(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_WEBHOOK_TOKEN);
    }
  } catch {
    // ignore
  }
}

export function getWebhookUrl(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_WEBHOOK_URL) || '';
    }
  } catch {
    // ignore
  }
  return '';
}

export function setWebhookUrl(url: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, (url || '').trim());
    }
  } catch {
    // ignore
  }
}

export function clearWebhookUrl(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_WEBHOOK_URL);
    }
  } catch {
    // ignore
  }
}

/**
 * Clears both user webhook URL and token from localStorage.
 * Reverts active configuration back to environment defaults.
 */
export function clearWebhookConfig(): void {
  clearWebhookUrl();
  clearWebhookToken();
}

export function validateWebhookUrl(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return { isValid: false, error: 'Webhook URL cannot be empty.' };
  }

  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Webhook URL must use HTTP or HTTPS protocol.' };
    }
  } catch {
    return { isValid: false, error: 'Invalid URL format.' };
  }

  return { isValid: true };
}

/**
 * Resolves the effective webhook configuration by inspecting user settings first,
 * then falling back to environment defaults queried from the main process.
 *
 * Precedence Rules:
 * 1. User Webhook URL (localStorage) > Environment Default URL (.env via main IPC) > Empty string
 * 2. User Token (localStorage) > Environment Token (.env via main IPC) > undefined
 * 3. Source classification:
 *    - 'user': Non-empty URL configured by user
 *    - 'env': User URL is empty/whitespace, but valid URL configured in .env
 *    - 'none': Neither user setting nor .env contains a URL
 */
export async function resolveEffectiveWebhookConfig(): Promise<ResolvedWebhookConfig> {
  const userUrl = getWebhookUrl().trim();
  const userToken = getWebhookToken().trim();

  let envWebhookUrl = '';
  let hasEnvToken = false;
  let envToken: string | undefined = undefined;

  try {
    if (
      typeof window !== 'undefined' &&
      window.devPilot &&
      typeof window.devPilot.getWebhookConfig === 'function'
    ) {
      const res = await window.devPilot.getWebhookConfig();
      if (res && res.success && res.data) {
        envWebhookUrl = (
          res.data.envDefaults?.webhookUrl ||
          res.data.webhookUrl ||
          (res.data as any).envWebhookUrl ||
          ''
        ).trim();
        hasEnvToken = Boolean(
          res.data.envDefaults?.hasToken ??
          (res.data as any).hasEnvToken ??
          Boolean(res.data.webhookToken)
        );
        if (res.data.webhookToken && res.data.webhookToken.trim().length > 0) {
          envToken = res.data.webhookToken.trim();
        }
      }
    }
  } catch {
    // Graceful fallback for isolated test environments or IPC failure
  }

  const effectiveUrl = userUrl || envWebhookUrl || '';
  const effectiveToken = userToken || envToken || undefined;

  let source: 'user' | 'env' | 'none' = 'none';
  if (userUrl) {
    source = 'user';
  } else if (envWebhookUrl) {
    source = 'env';
  } else {
    source = 'none';
  }

  return {
    webhookUrl: effectiveUrl,
    webhookToken: effectiveToken,
    source,
    envDefaults: {
      webhookUrl: envWebhookUrl,
      hasToken: hasEnvToken,
    },
    url: effectiveUrl,
    token: effectiveToken,
  };
}

/**
 * Synchronous resolver for testing or when environment defaults are already known.
 */
export function resolveWebhookConfig(envDefaults?: {
  envWebhookUrl?: string;
  webhookUrl?: string;
  hasEnvToken?: boolean;
  hasToken?: boolean;
}): ResolvedWebhookConfig & {
  urlSource: 'user' | 'env' | 'none';
  tokenSource: 'user' | 'env' | 'none';
  envWebhookUrl: string;
  hasEnvToken: boolean;
} {
  const userUrl = getWebhookUrl().trim();
  const userToken = getWebhookToken().trim();

  const envUrl = (envDefaults?.webhookUrl || envDefaults?.envWebhookUrl || '').trim();
  const hasEnvToken = Boolean(envDefaults?.hasToken ?? envDefaults?.hasEnvToken);

  const effectiveUrl = userUrl || envUrl || '';
  const effectiveToken = userToken || undefined;

  let urlSource: 'user' | 'env' | 'none' = 'none';
  let tokenSource: 'user' | 'env' | 'none' = 'none';

  if (userUrl) {
    urlSource = 'user';
  } else if (envUrl) {
    urlSource = 'env';
  }

  if (userToken) {
    tokenSource = 'user';
  } else if (hasEnvToken) {
    tokenSource = 'env';
  }

  const source = urlSource === 'user' ? 'user' : urlSource === 'env' ? 'env' : 'none';

  return {
    webhookUrl: effectiveUrl,
    webhookToken: effectiveToken,
    source,
    envDefaults: {
      webhookUrl: envUrl,
      hasToken: hasEnvToken,
    },
    urlSource,
    tokenSource,
    envWebhookUrl: envUrl,
    hasEnvToken,
    url: effectiveUrl,
    token: effectiveToken,
  };
}

/** Alias for resolveEffectiveWebhookConfig */
export const getEffectiveWebhookConfig = resolveEffectiveWebhookConfig;
