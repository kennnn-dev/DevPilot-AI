/**
 * Automated Unit Test Suite for Multi-Provider AI Configuration Resolver
 * Target: src/renderer/services/aiConfig.ts
 * Covers: Features F45, F46, F47, F48
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActiveProvider,
  setActiveProvider,
  getWebhookConfig,
  setWebhookConfig,
  getOllamaConfig,
  setOllamaConfig,
  getOpenAIConfig,
  setOpenAIConfig,
  getGeminiConfig,
  setGeminiConfig,
  resetProviderConfig,
  resetAllAIConfig,
  resolveEffectiveAIConfig,
  resolveAIConfig,
  validateAIProviderConfig,
  STORAGE_KEYS,
  DEFAULT_CONFIGS,
} from '../../src/renderer/services/aiConfig';
import {
  STORAGE_KEY_WEBHOOK_URL,
  STORAGE_KEY_WEBHOOK_TOKEN,
  getWebhookUrl,
  getWebhookToken,
} from '../../src/renderer/services/webhookConfig';
import type { DevPilotAPI } from '../../src/shared/types';

describe('AI Config Resolver Service (src/renderer/services/aiConfig.ts)', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWindow) {
      global.window = originalWindow;
    }
  });

  // =========================================================================
  // 1. Default Values & Uninitialized State
  // =========================================================================
  describe('Default Values & Uninitialized State', () => {
    it('defaults activeProvider to "webhook" when localStorage is empty', () => {
      expect(getActiveProvider()).toBe('webhook');
    });

    it('falls back to "webhook" when localStorage contains an invalid provider string', () => {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER, 'invalid-provider-xyz');
      expect(getActiveProvider()).toBe('webhook');
    });

    it('returns default Ollama config (baseUrl: http://localhost:11434, model: llama3.2)', () => {
      const config = getOllamaConfig();
      expect(config.baseUrl).toBe('http://localhost:11434');
      expect(config.model).toBe('llama3.2');
    });

    it('returns default OpenAI config (apiKey: "", model: gpt-4o-mini)', () => {
      const config = getOpenAIConfig();
      expect(config.apiKey).toBe('');
      expect(config.model).toBe('gpt-4o-mini');
    });

    it('returns default Gemini config (apiKey: "", model: gemini-1.5-flash)', () => {
      const config = getGeminiConfig();
      expect(config.apiKey).toBe('');
      expect(config.model).toBe('gemini-1.5-flash');
    });

    it('returns default Webhook config (webhookUrl: "", webhookToken: "")', () => {
      const config = getWebhookConfig();
      expect(config.webhookUrl).toBe('');
      expect(config.webhookToken).toBe('');
    });

    it('exports DEFAULT_CONFIGS matching default values', () => {
      expect(DEFAULT_CONFIGS.activeProvider).toBe('webhook');
      expect(DEFAULT_CONFIGS.ollama.baseUrl).toBe('http://localhost:11434');
      expect(DEFAULT_CONFIGS.openai.model).toBe('gpt-4o-mini');
      expect(DEFAULT_CONFIGS.gemini.model).toBe('gemini-1.5-flash');
    });
  });

  // =========================================================================
  // 2. LocalStorage Read & Write (All Providers)
  // =========================================================================
  describe('LocalStorage Read & Write Operations', () => {
    it('persists and retrieves activeProvider updates', () => {
      setActiveProvider('ollama');
      expect(getActiveProvider()).toBe('ollama');
      expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_PROVIDER)).toBe('ollama');

      setActiveProvider('openai');
      expect(getActiveProvider()).toBe('openai');

      setActiveProvider('gemini');
      expect(getActiveProvider()).toBe('gemini');
    });

    it('persists and retrieves Webhook credentials, trimming whitespace', () => {
      setWebhookConfig({
        webhookUrl: '  https://custom.n8n.cloud/webhook/deploy  ',
        webhookToken: '  bearer-secret-token  ',
      });

      const config = getWebhookConfig();
      expect(config.webhookUrl).toBe('https://custom.n8n.cloud/webhook/deploy');
      expect(config.webhookToken).toBe('bearer-secret-token');
      expect(localStorage.getItem(STORAGE_KEYS.WEBHOOK_URL)).toBe('https://custom.n8n.cloud/webhook/deploy');
    });

    it('persists and retrieves Ollama credentials, trimming whitespace', () => {
      setOllamaConfig({
        baseUrl: '  http://192.168.1.100:11434/  ',
        model: '  codellama:7b  ',
      });

      const config = getOllamaConfig();
      expect(config.baseUrl).toBe('http://192.168.1.100:11434');
      expect(config.model).toBe('codellama:7b');
    });

    it('persists and retrieves OpenAI credentials, trimming whitespace', () => {
      setOpenAIConfig({
        apiKey: '  sk-proj-1234567890abcdef  ',
        model: '  gpt-4o  ',
      });

      const config = getOpenAIConfig();
      expect(config.apiKey).toBe('sk-proj-1234567890abcdef');
      expect(config.model).toBe('gpt-4o');
    });

    it('persists and retrieves Gemini credentials, trimming whitespace', () => {
      setGeminiConfig({
        apiKey: '  AIzaSyD-abc1234567890  ',
        model: '  gemini-1.5-pro  ',
      });

      const config = getGeminiConfig();
      expect(config.apiKey).toBe('AIzaSyD-abc1234567890');
      expect(config.model).toBe('gemini-1.5-pro');
    });
  });

  // =========================================================================
  // 3. Independent Persistence (Isolation Guarantee)
  // =========================================================================
  describe('Independent Persistence Isolation', () => {
    it('persists settings for all 4 providers concurrently without mutual interference', () => {
      // 1. Configure Webhook
      setWebhookConfig({ webhookUrl: 'https://n8n.corp/hook', webhookToken: 'tok-w' });
      // 2. Configure Ollama
      setOllamaConfig({ baseUrl: 'http://ollama-box:11434', model: 'llama3.2' });
      // 3. Configure OpenAI
      setOpenAIConfig({ apiKey: 'sk-openai-key', model: 'gpt-4o' });
      // 4. Configure Gemini
      setGeminiConfig({ apiKey: 'AIza-gemini-key', model: 'gemini-1.5-pro' });

      // Verify all 4 provider configs remain intact
      expect(getWebhookConfig().webhookUrl).toBe('https://n8n.corp/hook');
      expect(getOllamaConfig().baseUrl).toBe('http://ollama-box:11434');
      expect(getOpenAIConfig().apiKey).toBe('sk-openai-key');
      expect(getGeminiConfig().apiKey).toBe('AIza-gemini-key');

      // Update OpenAI model only
      setOpenAIConfig({ model: 'gpt-4o-mini' });
      expect(getOpenAIConfig().model).toBe('gpt-4o-mini');
      expect(getOpenAIConfig().apiKey).toBe('sk-openai-key'); // API key retained
      expect(getOllamaConfig().baseUrl).toBe('http://ollama-box:11434'); // Ollama untouched
      expect(getWebhookConfig().webhookUrl).toBe('https://n8n.corp/hook'); // Webhook untouched
    });

    it('switching activeProvider does not clear or alter any stored credentials', () => {
      setWebhookConfig({ webhookUrl: 'https://my-webhook.org' });
      setOpenAIConfig({ apiKey: 'sk-secret' });

      setActiveProvider('ollama');
      expect(getWebhookConfig().webhookUrl).toBe('https://my-webhook.org');
      expect(getOpenAIConfig().apiKey).toBe('sk-secret');

      setActiveProvider('gemini');
      expect(getWebhookConfig().webhookUrl).toBe('https://my-webhook.org');
      expect(getOpenAIConfig().apiKey).toBe('sk-secret');
    });
  });

  // =========================================================================
  // 4. resetProviderConfig & resetAllAIConfig
  // =========================================================================
  describe('resetProviderConfig & Reset Scoping', () => {
    it('resetProviderConfig("openai") clears only OpenAI credentials', () => {
      setWebhookConfig({ webhookUrl: 'https://keep-webhook.com' });
      setOllamaConfig({ baseUrl: 'http://keep-ollama.com:11434' });
      setOpenAIConfig({ apiKey: 'sk-delete-me', model: 'gpt-4o' });

      resetProviderConfig('openai');

      expect(getOpenAIConfig().apiKey).toBe('');
      expect(getOpenAIConfig().model).toBe('gpt-4o-mini'); // reverts to default
      expect(getWebhookConfig().webhookUrl).toBe('https://keep-webhook.com');
      expect(getOllamaConfig().baseUrl).toBe('http://keep-ollama.com:11434');
    });

    it('resetProviderConfig("webhook") clears Webhook credentials and legacy keys', () => {
      setWebhookConfig({ webhookUrl: 'https://delete-webhook.com', webhookToken: 'tok' });
      setGeminiConfig({ apiKey: 'AIza-keep-me' });

      resetProviderConfig('webhook');

      expect(getWebhookConfig().webhookUrl).toBe('');
      expect(getWebhookConfig().webhookToken).toBe('');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBeNull();
      expect(getGeminiConfig().apiKey).toBe('AIza-keep-me');
    });

    it('resetProviderConfig("ollama") reverts Ollama to default localhost URL and llama3.2 model', () => {
      setOllamaConfig({ baseUrl: 'http://custom:11434', model: 'qwen2.5-coder' });
      resetProviderConfig('ollama');

      const config = getOllamaConfig();
      expect(config.baseUrl).toBe('http://localhost:11434');
      expect(config.model).toBe('llama3.2');
    });

    it('resetAllAIConfig clears all provider settings and resets activeProvider to webhook', () => {
      setActiveProvider('openai');
      setWebhookConfig({ webhookUrl: 'https://hook.com' });
      setOpenAIConfig({ apiKey: 'sk-123' });
      setOllamaConfig({ model: 'custom' });
      setGeminiConfig({ apiKey: 'gem-123' });

      resetAllAIConfig();

      expect(getActiveProvider()).toBe('webhook');
      expect(getWebhookConfig().webhookUrl).toBe('');
      expect(getOpenAIConfig().apiKey).toBe('');
      expect(getOllamaConfig().model).toBe('llama3.2');
      expect(getGeminiConfig().apiKey).toBe('');
    });
  });

  // =========================================================================
  // 5. Legacy Storage Key Compatibility (devpilot_n8n_webhook_url_v1)
  // =========================================================================
  describe('Legacy Storage Key Compatibility', () => {
    it('reads from legacy keys when modern keys are absent', () => {
      localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, 'https://legacy-endpoint.io/webhook');
      localStorage.setItem(STORAGE_KEY_WEBHOOK_TOKEN, 'legacy-secret-token');

      const config = getWebhookConfig();
      expect(config.webhookUrl).toBe('https://legacy-endpoint.io/webhook');
      expect(config.webhookToken).toBe('legacy-secret-token');
      expect(getWebhookUrl()).toBe('https://legacy-endpoint.io/webhook');
      expect(getWebhookToken()).toBe('legacy-secret-token');
    });

    it('modern key takes precedence over legacy key when both exist', () => {
      localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, 'https://legacy-endpoint.io/webhook');
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_URL, 'https://modern-endpoint.io/webhook');

      expect(getWebhookConfig().webhookUrl).toBe('https://modern-endpoint.io/webhook');
    });

    it('setWebhookConfig writes to both modern and legacy keys for maximum compatibility', () => {
      setWebhookConfig({ webhookUrl: 'https://sync-endpoint.com/webhook', webhookToken: 'tok-sync' });

      expect(localStorage.getItem(STORAGE_KEYS.WEBHOOK_URL)).toBe('https://sync-endpoint.com/webhook');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://sync-endpoint.com/webhook');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBe('tok-sync');
    });
  });

  // =========================================================================
  // 6. Precedence Resolution (resolveEffectiveAIConfig & resolveAIConfig)
  // =========================================================================
  describe('Precedence Resolution Hierarchy (User Settings > .env Fallback > Defaults)', () => {
    const mockEnvDefaults = {
      activeProvider: 'openai' as const,
      webhookUrl: 'https://env.company.com/webhook',
      hasWebhookToken: true,
      ollamaBaseUrl: 'http://ollama-cluster:11434',
      ollamaModel: 'deepseek-coder',
      hasOpenAiKey: true,
      openAiModel: 'gpt-4o',
      hasGeminiKey: true,
      geminiModel: 'gemini-1.5-pro',
    };

    it('resolves source: "user" when user explicitly configures settings in localStorage', () => {
      setOpenAIConfig({ apiKey: 'sk-user-key', model: 'gpt-4o-mini' });

      const resolved = resolveAIConfig(mockEnvDefaults);
      expect(resolved.providerConfigs.openai.apiKey).toBe('sk-user-key');
      expect(resolved.sources.openai).toBe('user');
    });

    it('falls back to source: "env" when user setting is empty string or unconfigured', () => {
      // User settings are empty
      const resolved = resolveAIConfig(mockEnvDefaults);

      expect(resolved.sources.webhook).toBe('env');
      expect(resolved.providerConfigs.webhook.webhookUrl).toBe('https://env.company.com/webhook');

      expect(resolved.sources.openai).toBe('env');
      expect(resolved.providerConfigs.openai.model).toBe('gpt-4o');

      expect(resolved.sources.gemini).toBe('env');
      expect(resolved.providerConfigs.gemini.model).toBe('gemini-1.5-pro');

      expect(resolved.sources.ollama).toBe('env');
      expect(resolved.providerConfigs.ollama.baseUrl).toBe('http://ollama-cluster:11434');
    });

    it('resolves source: "none" when neither user settings nor .env credentials exist', () => {
      const emptyEnv = {
        webhookUrl: '',
        hasWebhookToken: false,
        hasOpenAiKey: false,
        hasGeminiKey: false,
      };

      const resolved = resolveAIConfig(emptyEnv);
      expect(resolved.sources.webhook).toBe('none');
      expect(resolved.sources.openai).toBe('none');
      expect(resolved.sources.gemini).toBe('none');
    });

    it('resolves activeProvider precedence: User settings > .env > "webhook"', () => {
      // 1. Neither user nor env -> webhook
      expect(resolveAIConfig({}).activeProvider).toBe('webhook');

      // 2. Env set, user not set -> env activeProvider
      expect(resolveAIConfig({ activeProvider: 'gemini' }).activeProvider).toBe('gemini');

      // 3. Both set -> user setting wins
      setActiveProvider('ollama');
      expect(resolveAIConfig({ activeProvider: 'gemini' }).activeProvider).toBe('ollama');
    });

    it('asynchronously queries window.devPilot.getAIConfig and resolves effective config', async () => {
      setGeminiConfig({ apiKey: 'AIza-user-override' });

      window.devPilot = {
        getAIConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            activeProvider: 'webhook',
            providerConfigs: {
              webhook: { webhookUrl: 'https://env.n8n.org/hook' },
              ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
              openai: { apiKey: '', model: 'gpt-4o-mini' },
              gemini: { apiKey: '••••••••', model: 'gemini-1.5-pro' },
            },
            sources: { webhook: 'env', ollama: 'none', openai: 'none', gemini: 'env' },
            envDefaults: mockEnvDefaults,
          },
        }),
      } as unknown as DevPilotAPI;

      const resolved = await resolveEffectiveAIConfig();
      expect(resolved.sources.gemini).toBe('user');
      expect(resolved.providerConfigs.gemini.apiKey).toBe('AIza-user-override');
      expect(resolved.sources.webhook).toBe('env');
      expect(resolved.providerConfigs.webhook.webhookUrl).toBe('https://env.company.com/webhook');
    });

    it('falls back to window.devPilot.getWebhookConfig when getAIConfig is undefined (legacy runner)', async () => {
      window.devPilot = {
        getWebhookConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            webhookUrl: 'https://legacy-env.hook.com',
            source: 'env',
            envDefaults: { webhookUrl: 'https://legacy-env.hook.com', hasToken: true },
          },
        }),
      } as unknown as DevPilotAPI;

      const resolved = await resolveEffectiveAIConfig();
      expect(resolved.providerConfigs.webhook.webhookUrl).toBe('https://legacy-env.hook.com');
      expect(resolved.sources.webhook).toBe('env');
      expect(resolved.sources.openai).toBe('none');
    });

    it('gracefully handles missing window.devPilot or IPC rejection', async () => {
      // @ts-ignore
      delete window.devPilot;

      const resolved = await resolveEffectiveAIConfig();
      expect(resolved.activeProvider).toBe('webhook');
      expect(resolved.sources.webhook).toBe('none');
      expect(resolved.providerConfigs.ollama.baseUrl).toBe('http://localhost:11434');
    });
  });

  // =========================================================================
  // 7. Validation Helpers
  // =========================================================================
  describe('validateAIProviderConfig', () => {
    it('validates Webhook configs (valid url protocol, non-empty)', () => {
      expect(validateAIProviderConfig('webhook', { webhookUrl: '' }).isValid).toBe(false);
      expect(validateAIProviderConfig('webhook', { webhookUrl: 'not-a-url' }).isValid).toBe(false);
      expect(validateAIProviderConfig('webhook', { webhookUrl: 'ftp://bad.com' }).isValid).toBe(false);
      expect(validateAIProviderConfig('webhook', { webhookUrl: 'https://good.com/hook' }).isValid).toBe(true);
      expect(validateAIProviderConfig('webhook', { webhookUrl: 'http://localhost:5678' }).isValid).toBe(true);
    });

    it('validates Ollama configs (valid baseUrl protocol, non-empty model)', () => {
      expect(validateAIProviderConfig('ollama', { baseUrl: 'bad-url', model: 'llama3.2' }).isValid).toBe(false);
      expect(validateAIProviderConfig('ollama', { baseUrl: 'http://localhost:11434', model: '' }).isValid).toBe(false);
      expect(validateAIProviderConfig('ollama', { baseUrl: 'http://localhost:11434', model: 'llama3.2' }).isValid).toBe(true);
    });

    it('validates OpenAI configs (non-empty model)', () => {
      expect(validateAIProviderConfig('openai', { model: '' }).isValid).toBe(false);
      expect(validateAIProviderConfig('openai', { model: 'gpt-4o-mini' }).isValid).toBe(true);
    });

    it('validates Gemini configs (non-empty model)', () => {
      expect(validateAIProviderConfig('gemini', { model: '' }).isValid).toBe(false);
      expect(validateAIProviderConfig('gemini', { model: 'gemini-1.5-flash' }).isValid).toBe(true);
    });
  });
});
