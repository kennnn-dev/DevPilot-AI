import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  resolveEffectiveWebhookConfig,
  resolveWebhookConfig,
  getWebhookUrl,
  setWebhookUrl,
  clearWebhookUrl,
  getWebhookToken,
  setWebhookToken,
  clearWebhookToken,
  clearWebhookConfig,
  validateWebhookUrl,
  STORAGE_KEY_WEBHOOK_URL,
  STORAGE_KEY_WEBHOOK_TOKEN,
} from '../../src/renderer/services/webhookConfig';

describe('Webhook Config Resolver Service (src/renderer/services/webhookConfig.ts)', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore window
    if (originalWindow) {
      global.window = originalWindow;
    }
  });

  describe('resolveWebhookConfig (Synchronous Helper)', () => {
    it('resolves source "user" when user setting is explicitly configured in localStorage', () => {
      setWebhookUrl('https://user.cloud/webhook');
      setWebhookToken('user-token-123');

      const config = resolveWebhookConfig({
        envWebhookUrl: 'https://env.cloud/webhook',
        hasEnvToken: true,
      });

      expect(config.webhookUrl).toBe('https://user.cloud/webhook');
      expect(config.webhookToken).toBe('user-token-123');
      expect(config.url).toBe('https://user.cloud/webhook');
      expect(config.token).toBe('user-token-123');
      expect(config.source).toBe('user');
      expect(config.urlSource).toBe('user');
      expect(config.tokenSource).toBe('user');
    });

    it('falls back to source "env" when user setting is empty string', () => {
      clearWebhookUrl();
      const config = resolveWebhookConfig({
        envWebhookUrl: 'https://env.cloud/webhook',
        hasEnvToken: true,
      });

      expect(config.webhookUrl).toBe('https://env.cloud/webhook');
      expect(config.source).toBe('env');
      expect(config.urlSource).toBe('env');
      expect(config.tokenSource).toBe('env');
      expect(config.envDefaults.webhookUrl).toBe('https://env.cloud/webhook');
      expect(config.envDefaults.hasToken).toBe(true);
    });

    it('resolves source "none" when neither user setting nor .env URL exists', () => {
      clearWebhookUrl();
      clearWebhookToken();

      const config = resolveWebhookConfig({
        envWebhookUrl: '',
        hasEnvToken: false,
      });

      expect(config.webhookUrl).toBe('');
      expect(config.source).toBe('none');
      expect(config.urlSource).toBe('none');
      expect(config.tokenSource).toBe('none');
    });

    it('allows user token override while falling back to .env URL', () => {
      clearWebhookUrl();
      setWebhookToken('custom-user-token');

      const config = resolveWebhookConfig({
        envWebhookUrl: 'https://env.cloud/webhook',
        hasEnvToken: false,
      });

      expect(config.webhookUrl).toBe('https://env.cloud/webhook');
      expect(config.urlSource).toBe('env');
      expect(config.webhookToken).toBe('custom-user-token');
      expect(config.tokenSource).toBe('user');
      expect(config.source).toBe('env');
    });

    it('handles undefined envDefaults gracefully', () => {
      clearWebhookUrl();
      clearWebhookToken();

      const config = resolveWebhookConfig(undefined);
      expect(config.webhookUrl).toBe('');
      expect(config.webhookToken).toBeUndefined();
      expect(config.source).toBe('none');
      expect(config.envDefaults.webhookUrl).toBe('');
      expect(config.envDefaults.hasToken).toBe(false);
    });
  });

  describe('resolveEffectiveWebhookConfig (Asynchronous with Electron IPC)', () => {
    it('queries window.devPilot.getWebhookConfig and resolves user settings when populated', async () => {
      setWebhookUrl('https://custom-user-n8n.com/webhook');
      setWebhookToken('my-secret-token');

      window.devPilot = {
        getWebhookConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            webhookUrl: 'https://fallback-env.com/webhook',
            source: 'env',
            envDefaults: {
              webhookUrl: 'https://fallback-env.com/webhook',
              hasToken: true,
            },
          },
        }),
      } as any;

      const resolved = await resolveEffectiveWebhookConfig();
      expect(resolved.webhookUrl).toBe('https://custom-user-n8n.com/webhook');
      expect(resolved.webhookToken).toBe('my-secret-token');
      expect(resolved.source).toBe('user');
      expect(resolved.envDefaults.webhookUrl).toBe('https://fallback-env.com/webhook');
      expect(resolved.envDefaults.hasToken).toBe(true);
    });

    it('falls back to window.devPilot.getWebhookConfig env defaults when user settings are empty', async () => {
      clearWebhookConfig();

      window.devPilot = {
        getWebhookConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            webhookUrl: 'https://env-endpoint.org/webhook',
            source: 'env',
            envDefaults: {
              webhookUrl: 'https://env-endpoint.org/webhook',
              hasToken: false,
            },
          },
        }),
      } as any;

      const resolved = await resolveEffectiveWebhookConfig();
      expect(resolved.webhookUrl).toBe('https://env-endpoint.org/webhook');
      expect(resolved.source).toBe('env');
      expect(resolved.envDefaults.webhookUrl).toBe('https://env-endpoint.org/webhook');
      expect(resolved.envDefaults.hasToken).toBe(false);
    });

    it('treats whitespace-only user settings as unconfigured and falls back to env defaults', async () => {
      localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, '   ');
      localStorage.setItem(STORAGE_KEY_WEBHOOK_TOKEN, '   ');

      window.devPilot = {
        getWebhookConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            webhookUrl: 'https://env.company.com/webhook',
            source: 'env',
            envDefaults: {
              webhookUrl: 'https://env.company.com/webhook',
              hasToken: true,
            },
          },
        }),
      } as any;

      const resolved = await resolveEffectiveWebhookConfig();
      expect(resolved.webhookUrl).toBe('https://env.company.com/webhook');
      expect(resolved.source).toBe('env');
    });

    it('handles isolated environments where window.devPilot is undefined without error', async () => {
      clearWebhookConfig();
      const tempDevPilot = window.devPilot;
      // @ts-ignore
      delete window.devPilot;

      const resolved = await resolveEffectiveWebhookConfig();
      expect(resolved.webhookUrl).toBe('');
      expect(resolved.webhookToken).toBeUndefined();
      expect(resolved.source).toBe('none');
      expect(resolved.envDefaults.webhookUrl).toBe('');
      expect(resolved.envDefaults.hasToken).toBe(false);

      window.devPilot = tempDevPilot;
    });

    it('handles IPC failure or rejection gracefully', async () => {
      clearWebhookConfig();
      window.devPilot = {
        getWebhookConfig: vi.fn().mockRejectedValue(new Error('IPC Channel disconnected')),
      } as any;

      const resolved = await resolveEffectiveWebhookConfig();
      expect(resolved.webhookUrl).toBe('');
      expect(resolved.source).toBe('none');
    });

    it('inherits environment token when provided in IPC response and user token is empty', async () => {
      clearWebhookConfig();
      window.devPilot = {
        getWebhookConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            webhookUrl: 'https://env-endpoint.org/webhook',
            webhookToken: 'env-bearer-token',
            source: 'env',
            envDefaults: {
              webhookUrl: 'https://env-endpoint.org/webhook',
              hasToken: true,
            },
          },
        }),
      } as any;

      const resolved = await resolveEffectiveWebhookConfig();
      expect(resolved.webhookToken).toBe('env-bearer-token');
      expect(resolved.envDefaults.hasToken).toBe(true);
    });
  });

  describe('clearWebhookConfig and reset lifecycle', () => {
    it('clears both URL and token from localStorage', () => {
      setWebhookUrl('https://example.com/webhook');
      setWebhookToken('my-token');

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://example.com/webhook');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBe('my-token');

      clearWebhookConfig();

      expect(getWebhookUrl()).toBe('');
      expect(getWebhookToken()).toBe('');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBeNull();
    });

    it('clearing config causes subsequent resolution to revert to env source', async () => {
      setWebhookUrl('https://user-override.com');
      setWebhookToken('user-token');

      window.devPilot = {
        getWebhookConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            webhookUrl: 'https://env-default.com',
            source: 'env',
            envDefaults: {
              webhookUrl: 'https://env-default.com',
              hasToken: false,
            },
          },
        }),
      } as any;

      let config = await resolveEffectiveWebhookConfig();
      expect(config.webhookUrl).toBe('https://user-override.com');
      expect(config.source).toBe('user');

      clearWebhookConfig();

      config = await resolveEffectiveWebhookConfig();
      expect(config.webhookUrl).toBe('https://env-default.com');
      expect(config.source).toBe('env');
    });
  });

  describe('Storage trimming & URL validation', () => {
    it('trims leading and trailing whitespace when saving settings', () => {
      setWebhookUrl('  https://whitespace-url.com/hook  ');
      setWebhookToken('  whitespace-token  ');

      expect(getWebhookUrl()).toBe('https://whitespace-url.com/hook');
      expect(getWebhookToken()).toBe('whitespace-token');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://whitespace-url.com/hook');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBe('whitespace-token');
    });

    it('validates URLs correctly across edge cases', () => {
      expect(validateWebhookUrl('').isValid).toBe(false);
      expect(validateWebhookUrl('   ').isValid).toBe(false);
      expect(validateWebhookUrl('not-a-url').isValid).toBe(false);
      expect(validateWebhookUrl('ftp://example.com').isValid).toBe(false);
      expect(validateWebhookUrl('javascript:alert(1)').isValid).toBe(false);
      expect(validateWebhookUrl('http://localhost:5678/webhook/test').isValid).toBe(true);
      expect(validateWebhookUrl('https://primary.n8n.cloud/webhook/test').isValid).toBe(true);
    });
  });
});
