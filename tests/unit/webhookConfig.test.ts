import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWebhookUrl,
  setWebhookUrl,
  clearWebhookUrl,
  validateWebhookUrl,
  STORAGE_KEY_WEBHOOK_URL,
} from '../../src/renderer/services/webhookConfig';

describe('Webhook Configuration (src/renderer/services/webhookConfig.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('gets empty string when no URL stored', () => {
    expect(getWebhookUrl()).toBe('');
  });

  it('persists and retrieves webhook URL in localStorage', () => {
    setWebhookUrl('https://my-n8n.instance/webhook/git-commit');
    expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://my-n8n.instance/webhook/git-commit');
    expect(getWebhookUrl()).toBe('https://my-n8n.instance/webhook/git-commit');
  });

  it('clears stored webhook URL', () => {
    setWebhookUrl('https://example.com/webhook');
    expect(getWebhookUrl()).toBe('https://example.com/webhook');
    clearWebhookUrl();
    expect(getWebhookUrl()).toBe('');
    expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
  });

  it('validates URL correctly', () => {
    expect(validateWebhookUrl('').isValid).toBe(false);
    expect(validateWebhookUrl('   ').isValid).toBe(false);
    expect(validateWebhookUrl('ftp://not-http.com').isValid).toBe(false);
    expect(validateWebhookUrl('not a url').isValid).toBe(false);
    expect(validateWebhookUrl('http://localhost:5678/webhook/test').isValid).toBe(true);
    expect(validateWebhookUrl('https://n8n.cloud/webhook/test').isValid).toBe(true);
  });
});
