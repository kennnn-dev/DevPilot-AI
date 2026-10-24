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
      localStorage.setItem(STORAGE_KEY_WEBHOOK_TOKEN, token.trim());
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
      localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, url.trim());
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
