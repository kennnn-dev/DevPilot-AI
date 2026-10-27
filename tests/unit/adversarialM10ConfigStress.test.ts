/**
 * Adversarial Stress Test Suite: AI Configuration Resolver & Storage Corruption
 * Target: src/renderer/services/aiConfig.ts
 * Milestone: M10 Precedence & Storage Corruption Challenger
 *
 * Dimension Coverage:
 * 1. Storage corruption resilience: invalid non-string values or corrupted JSON in localStorage keys.
 * 2. LocalStorage quota exhaustion / throwing exceptions on setItem/getItem/removeItem.
 * 3. Precedence edge cases: empty strings, whitespace-only values in localStorage vs .env fallback.
 * 4. Provider-scoped reset: stress test concurrent mutations across all 4 providers followed by scoped resets.
 * 5. Trailing slash handling, case sensitivity of provider strings, URL validation corner cases.
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
  getProviderConfig,
  setProviderConfig,
  resetProviderConfig,
  resetAllAIConfig,
  resolveAIConfig,
  resolveEffectiveAIConfig,
  validateWebhookUrl,
  validateOllamaUrl,
  validateApiKey,
  validateAIProviderConfig,
  STORAGE_KEYS,
  STORAGE_KEY_WEBHOOK_URL,
  STORAGE_KEY_LEGACY_WEBHOOK_URL,
  STORAGE_KEY_WEBHOOK_TOKEN,
  STORAGE_KEY_LEGACY_WEBHOOK_TOKEN,
  STORAGE_KEY_OLLAMA_BASE_URL,
  STORAGE_KEY_OLLAMA_MODEL,
  STORAGE_KEY_OPENAI_API_KEY,
  STORAGE_KEY_OPENAI_MODEL,
  STORAGE_KEY_OPENAI_BASE_URL,
  STORAGE_KEY_GEMINI_API_KEY,
  STORAGE_KEY_GEMINI_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../../src/renderer/services/aiConfig';
import type { AIProvider, DevPilotAPI } from '../../src/shared/types';

describe('Adversarial M10 Stress Test: AI Configuration Resolver & Storage Layer', () => {
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWindow) {
      global.window = originalWindow;
    }
    if (originalLocalStorage) {
      global.localStorage = originalLocalStorage;
    }
  });

  // =========================================================================
  // Challenge 1: Storage Corruption Resilience
  // =========================================================================
  describe('Challenge 1: Storage Corruption Resilience', () => {
    it('handles corrupted JSON payloads in ACTIVE_PROVIDER key gracefully without crashing', () => {
      const corruptedPayloads = [
        '{ "activeProvider": "openai"',
        '{"corrupted": true, 123: bad}',
        '[ "ollama", "openai" ]',
        'null',
        'undefined',
        'NaN',
        'true',
        'false',
        '0',
        '{}',
        'Object [object Object]',
      ];

      for (const payload of corruptedPayloads) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER, payload);
        // Must never throw, must return default provider
        expect(getActiveProvider()).toBe('webhook');
      }
    });

    it('handles non-string / coerced values in localStorage without throwing', () => {
      // In JS, setting objects/numbers to localStorage gets coerced to string, e.g. "[object Object]" or "123"
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_URL, '[object Object]');
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_TOKEN, '12345');
      localStorage.setItem(STORAGE_KEYS.OLLAMA_BASE_URL, 'null');
      localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, 'undefined');
      localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, '{"key": "test"}');

      expect(() => getWebhookConfig()).not.toThrow();
      expect(() => getOllamaConfig()).not.toThrow();
      expect(() => getOpenAIConfig()).not.toThrow();
      expect(() => getGeminiConfig()).not.toThrow();

      // Corrupted Webhook URL is detected by URL validator
      const validation = validateWebhookUrl(getWebhookConfig().webhookUrl);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe('Invalid URL format.');
    });

    it('resists prototype pollution and unexpected keys in localStorage', () => {
      localStorage.setItem('__proto__', 'polluted');
      localStorage.setItem('constructor', 'polluted');
      localStorage.setItem('valueOf', 'polluted');
      localStorage.setItem('devpilot_unknown_future_key', 'some-value');

      expect(getActiveProvider()).toBe('webhook');
      expect(getWebhookConfig().webhookUrl).toBe('');
      expect(getOllamaConfig().baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);

      // Verify that resetting all configs does not throw when foreign keys exist
      expect(() => resetAllAIConfig()).not.toThrow();
      expect(localStorage.getItem('devpilot_unknown_future_key')).toBe('some-value');
    });

    it('preserves clean defaults when localStorage contains binary or non-printable ASCII characters', () => {
      const corruptedChars = '\x00\x01\x02\x03\x1f\x7f';
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER, corruptedChars);
      expect(getActiveProvider()).toBe('webhook');

      localStorage.setItem(STORAGE_KEYS.WEBHOOK_URL, corruptedChars);
      const res = validateWebhookUrl(getWebhookConfig().webhookUrl);
      expect(res.isValid).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 2: LocalStorage Quota Exhaustion & Exception Resilience
  // =========================================================================
  describe('Challenge 2: LocalStorage Quota Exhaustion & Exception Resilience', () => {
    it('gracefully survives QuotaExceededError during write operations across all providers', () => {
      const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError;
      });

      // Writes must not throw unhandled exceptions
      expect(() => setActiveProvider('openai')).not.toThrow();
      expect(() => setWebhookConfig({ webhookUrl: 'https://test.com', webhookToken: 'tok' })).not.toThrow();
      expect(() => setOllamaConfig({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })).not.toThrow();
      expect(() => setOpenAIConfig({ apiKey: 'sk-12345', model: 'gpt-4o' })).not.toThrow();
      expect(() => setGeminiConfig({ apiKey: 'AIza-123', model: 'gemini-1.5-pro' })).not.toThrow();
      expect(() => setProviderConfig('ollama', { model: 'mistral' })).not.toThrow();
    });

    it('gracefully survives SecurityError / blocked storage during read operations', () => {
      const securityError = new DOMException('The operation is insecure.', 'SecurityError');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw securityError;
      });

      // Reads must not crash, should return default constants
      expect(getActiveProvider()).toBe('webhook');
      expect(getWebhookConfig()).toEqual({ webhookUrl: '', webhookToken: '' });
      expect(getOllamaConfig()).toEqual({
        baseUrl: DEFAULT_OLLAMA_BASE_URL,
        model: DEFAULT_OLLAMA_MODEL,
      });
      expect(getOpenAIConfig()).toEqual({
        apiKey: '',
        model: DEFAULT_OPENAI_MODEL,
        baseUrl: undefined,
      });
      expect(getGeminiConfig()).toEqual({
        apiKey: '',
        model: DEFAULT_GEMINI_MODEL,
      });

      // Configuration resolver survives SecurityError gracefully
      const resolved = resolveAIConfig({
        activeProvider: 'gemini',
        geminiModel: 'gemini-1.5-pro',
      });
      expect(resolved.activeProvider).toBe('gemini');
      expect(resolved.sources.gemini).toBe('none');
    });

    it('gracefully survives exceptions during removal operations (resetProviderConfig & resetAllAIConfig)', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Write permission denied in storage sandbox');
      });

      expect(() => resetProviderConfig('webhook')).not.toThrow();
      expect(() => resetProviderConfig('ollama')).not.toThrow();
      expect(() => resetProviderConfig('openai')).not.toThrow();
      expect(() => resetProviderConfig('gemini')).not.toThrow();
      expect(() => resetAllAIConfig()).not.toThrow();
    });

    it('gracefully survives environments where localStorage is undefined (SSR / headless worker context)', () => {
      // Temporarily simulate undefined localStorage
      // @ts-ignore
      delete global.localStorage;

      expect(getActiveProvider()).toBe('webhook');
      expect(getWebhookConfig().webhookUrl).toBe('');
      expect(getOllamaConfig().baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);

      expect(() => setActiveProvider('ollama')).not.toThrow();
      expect(() => setWebhookConfig({ webhookUrl: 'https://example.com' })).not.toThrow();
      expect(() => resetProviderConfig('openai')).not.toThrow();
      expect(() => resetAllAIConfig()).not.toThrow();

      // Restore localStorage for subsequent tests
      global.localStorage = originalLocalStorage;
    });
  });

  // =========================================================================
  // Challenge 3: Precedence Edge Cases (.env vs LocalStorage vs Defaults)
  // =========================================================================
  describe('Challenge 3: Precedence Edge Cases (Empty & Whitespace-only Fallbacks)', () => {
    const mockEnvDefaults = {
      activeProvider: 'gemini' as const,
      webhookUrl: 'https://env.domain.com/webhook',
      hasWebhookToken: true,
      ollamaBaseUrl: 'http://env-ollama:11434',
      ollamaModel: 'env-llama',
      hasOpenAiKey: true,
      openAiModel: 'gpt-4o-env',
      hasGeminiKey: true,
      geminiModel: 'gemini-1.5-pro-env',
    };

    it('falls back to .env when localStorage keys contain whitespace-only strings', () => {
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_URL, '   \t  \n  ');
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_TOKEN, '   ');
      localStorage.setItem(STORAGE_KEYS.OLLAMA_BASE_URL, '   ');
      localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, '   ');
      localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, '   ');
      localStorage.setItem(STORAGE_KEYS.OPENAI_MODEL, '   ');
      localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, '   ');
      localStorage.setItem(STORAGE_KEYS.GEMINI_MODEL, '   ');

      const resolved = resolveAIConfig(mockEnvDefaults);

      // Webhook fallback
      expect(resolved.sources.webhook).toBe('env');
      expect(resolved.providerConfigs.webhook.webhookUrl).toBe('https://env.domain.com/webhook');
      expect(resolved.providerConfigs.webhook.webhookToken).toBe('••••••••');

      // Ollama fallback
      expect(resolved.sources.ollama).toBe('env');
      expect(resolved.providerConfigs.ollama.baseUrl).toBe('http://env-ollama:11434');
      expect(resolved.providerConfigs.ollama.model).toBe('env-llama');

      // OpenAI fallback
      expect(resolved.sources.openai).toBe('env');
      expect(resolved.providerConfigs.openai.apiKey).toBe('••••••••');
      expect(resolved.providerConfigs.openai.model).toBe('gpt-4o-env');

      // Gemini fallback
      expect(resolved.sources.gemini).toBe('env');
      expect(resolved.providerConfigs.gemini.apiKey).toBe('••••••••');
      expect(resolved.providerConfigs.gemini.model).toBe('gemini-1.5-pro-env');
    });

    it('falls back to .env when localStorage keys contain empty strings', () => {
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_URL, '');
      localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, '');
      localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, '');

      const resolved = resolveAIConfig(mockEnvDefaults);
      expect(resolved.sources.webhook).toBe('env');
      expect(resolved.sources.openai).toBe('env');
      expect(resolved.sources.gemini).toBe('env');
    });

    it('treats whitespace-only setter input as deletion/removal in localStorage', () => {
      // 1. Webhook
      setWebhookConfig({ webhookUrl: 'https://valid.com', webhookToken: 'valid-tok' });
      expect(localStorage.getItem(STORAGE_KEYS.WEBHOOK_URL)).toBe('https://valid.com');
      // Set to whitespace
      setWebhookConfig({ webhookUrl: '   ', webhookToken: '   ' });
      expect(localStorage.getItem(STORAGE_KEYS.WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.WEBHOOK_TOKEN)).toBeNull();

      // 2. Ollama
      setOllamaConfig({ baseUrl: 'http://custom:11434', model: 'codellama' });
      setOllamaConfig({ baseUrl: '   ', model: '   ' });
      expect(localStorage.getItem(STORAGE_KEYS.OLLAMA_BASE_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL)).toBeNull();

      // 3. OpenAI
      setOpenAIConfig({ apiKey: 'sk-123', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' });
      setOpenAIConfig({ apiKey: '   ', model: '   ', baseUrl: '   ' });
      expect(localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.OPENAI_MODEL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.OPENAI_BASE_URL)).toBeNull();

      // 4. Gemini
      setGeminiConfig({ apiKey: 'AIza-123', model: 'gemini-1.5-pro' });
      setGeminiConfig({ apiKey: '   ', model: '   ' });
      expect(localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.GEMINI_MODEL)).toBeNull();
    });

    it('resolves source: "none" when both localStorage and .env are empty or whitespace-only', () => {
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_URL, '   ');
      localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, '   ');
      localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, '   ');

      const emptyEnv = {
        webhookUrl: '   ',
        hasWebhookToken: false,
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama3.2',
        hasOpenAiKey: false,
        openAiModel: '',
        hasGeminiKey: false,
        geminiModel: '',
      };

      const resolved = resolveAIConfig(emptyEnv);
      expect(resolved.sources.webhook).toBe('none');
      expect(resolved.sources.ollama).toBe('none');
      expect(resolved.sources.openai).toBe('none');
      expect(resolved.sources.gemini).toBe('none');
    });

    it('user settings with valid content take strict precedence over .env values', () => {
      setWebhookConfig({ webhookUrl: 'https://user.cloud/webhook', webhookToken: 'user-token' });
      setOllamaConfig({ baseUrl: 'http://user-ollama:11434', model: 'user-model' });
      setOpenAIConfig({ apiKey: 'sk-user-key', model: 'gpt-user' });
      setGeminiConfig({ apiKey: 'AIza-user-key', model: 'gemini-user' });
      setActiveProvider('ollama');

      const resolved = resolveAIConfig(mockEnvDefaults);

      expect(resolved.activeProvider).toBe('ollama');
      expect(resolved.sources.webhook).toBe('user');
      expect(resolved.providerConfigs.webhook.webhookUrl).toBe('https://user.cloud/webhook');
      expect(resolved.sources.ollama).toBe('user');
      expect(resolved.providerConfigs.ollama.baseUrl).toBe('http://user-ollama:11434');
      expect(resolved.sources.openai).toBe('user');
      expect(resolved.providerConfigs.openai.apiKey).toBe('sk-user-key');
      expect(resolved.sources.gemini).toBe('user');
      expect(resolved.providerConfigs.gemini.apiKey).toBe('AIza-user-key');
    });

    it('activeProvider precedence strictly adheres to User > .env > Default ("webhook")', () => {
      // 1. Neither user nor env: defaults to 'webhook'
      expect(resolveAIConfig({}).activeProvider).toBe('webhook');

      // 2. Env activeProvider 'openai', user unconfigured: env wins
      expect(resolveAIConfig({ activeProvider: 'openai' }).activeProvider).toBe('openai');

      // 3. User set 'gemini', env set 'openai': user wins
      setActiveProvider('gemini');
      expect(resolveAIConfig({ activeProvider: 'openai' }).activeProvider).toBe('gemini');

      // 4. User stored provider is invalid string: falls back to env or default
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER, 'invalid-provider');
      expect(resolveAIConfig({ activeProvider: 'ollama' }).activeProvider).toBe('ollama');
      expect(resolveAIConfig({}).activeProvider).toBe('webhook');
    });
  });

  // =========================================================================
  // Challenge 4: Provider-Scoped Reset & Concurrent Mutations Stress Test
  // =========================================================================
  describe('Challenge 4: Provider-Scoped Reset & Concurrent Mutations Stress Test', () => {
    it('survives 100 interleaved mutations across all 4 providers maintaining data integrity', () => {
      const providers: AIProvider[] = ['webhook', 'ollama', 'openai', 'gemini'];

      for (let i = 0; i < 100; i++) {
        const provider = providers[i % providers.length];

        switch (provider) {
          case 'webhook':
            setWebhookConfig({
              webhookUrl: `https://webhook-iter-${i}.org/hook`,
              webhookToken: `token-${i}`,
            });
            break;
          case 'ollama':
            setOllamaConfig({
              baseUrl: `http://ollama-box-${i}:11434`,
              model: `model-v${i}`,
            });
            break;
          case 'openai':
            setOpenAIConfig({
              apiKey: `sk-iter-${i}-key`,
              model: `gpt-iter-${i}`,
              baseUrl: `https://api-${i}.openai.com/v1`,
            });
            break;
          case 'gemini':
            setGeminiConfig({
              apiKey: `AIza-iter-${i}-key`,
              model: `gemini-iter-${i}`,
            });
            break;
        }

        setActiveProvider(provider);
        expect(getActiveProvider()).toBe(provider);
      }

      // Verify the final values for all providers exist concurrently and intact
      expect(getWebhookConfig().webhookUrl).toBe('https://webhook-iter-96.org/hook');
      expect(getWebhookConfig().webhookToken).toBe('token-96');

      expect(getOllamaConfig().baseUrl).toBe('http://ollama-box-97:11434');
      expect(getOllamaConfig().model).toBe('model-v97');

      expect(getOpenAIConfig().apiKey).toBe('sk-iter-98-key');
      expect(getOpenAIConfig().model).toBe('gpt-iter-98');
      expect(getOpenAIConfig().baseUrl).toBe('https://api-98.openai.com/v1');

      expect(getGeminiConfig().apiKey).toBe('AIza-iter-99-key');
      expect(getGeminiConfig().model).toBe('gemini-iter-99');
    });

    it('scoped reset clears ONLY target provider in step-by-step sequential elimination', () => {
      // 1. Populate all 4 providers
      setWebhookConfig({ webhookUrl: 'https://webhook.org/hook', webhookToken: 'webhook-tok' });
      setOllamaConfig({ baseUrl: 'http://ollama:11434', model: 'codellama' });
      setOpenAIConfig({ apiKey: 'sk-test-key', model: 'gpt-4o', baseUrl: 'https://openai.org/v1' });
      setGeminiConfig({ apiKey: 'AIza-test-key', model: 'gemini-1.5-pro' });

      // Step A: Reset Webhook
      resetProviderConfig('webhook');
      expect(getWebhookConfig().webhookUrl).toBe('');
      expect(getWebhookConfig().webhookToken).toBe('');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_URL)).toBeNull();
      // Others must remain intact
      expect(getOllamaConfig().baseUrl).toBe('http://ollama:11434');
      expect(getOpenAIConfig().apiKey).toBe('sk-test-key');
      expect(getGeminiConfig().apiKey).toBe('AIza-test-key');

      // Step B: Reset Ollama
      resetProviderConfig('ollama');
      expect(getOllamaConfig().baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
      expect(getOllamaConfig().model).toBe(DEFAULT_OLLAMA_MODEL);
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL)).toBeNull();
      // Others must remain intact
      expect(getOpenAIConfig().apiKey).toBe('sk-test-key');
      expect(getGeminiConfig().apiKey).toBe('AIza-test-key');

      // Step C: Reset OpenAI
      resetProviderConfig('openai');
      expect(getOpenAIConfig().apiKey).toBe('');
      expect(getOpenAIConfig().model).toBe(DEFAULT_OPENAI_MODEL);
      expect(getOpenAIConfig().baseUrl).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_MODEL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_BASE_URL)).toBeNull();
      // Gemini must remain intact
      expect(getGeminiConfig().apiKey).toBe('AIza-test-key');

      // Step D: Reset Gemini
      resetProviderConfig('gemini');
      expect(getGeminiConfig().apiKey).toBe('');
      expect(getGeminiConfig().model).toBe(DEFAULT_GEMINI_MODEL);
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_MODEL)).toBeNull();
    });

    it('resetAllAIConfig completely resets all provider credentials and active provider', () => {
      setWebhookConfig({ webhookUrl: 'https://hook.org' });
      setOllamaConfig({ baseUrl: 'http://ollama:11434', model: 'custom' });
      setOpenAIConfig({ apiKey: 'sk-secret' });
      setGeminiConfig({ apiKey: 'AIza-secret' });
      setActiveProvider('gemini');

      resetAllAIConfig();

      expect(getActiveProvider()).toBe('webhook');
      expect(getWebhookConfig().webhookUrl).toBe('');
      expect(getOllamaConfig().baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
      expect(getOllamaConfig().model).toBe(DEFAULT_OLLAMA_MODEL);
      expect(getOpenAIConfig().apiKey).toBe('');
      expect(getOpenAIConfig().model).toBe(DEFAULT_OPENAI_MODEL);
      expect(getGeminiConfig().apiKey).toBe('');
      expect(getGeminiConfig().model).toBe(DEFAULT_GEMINI_MODEL);
    });

    it('polymorphic getProviderConfig and setProviderConfig work identically to direct helpers', () => {
      setProviderConfig('webhook', { webhookUrl: 'https://poly-webhook.io' });
      expect(getProviderConfig('webhook').webhookUrl).toBe('https://poly-webhook.io');

      setProviderConfig('ollama', { baseUrl: 'http://poly-ollama:11434', model: 'qwen' });
      expect(getProviderConfig('ollama').baseUrl).toBe('http://poly-ollama:11434');

      setProviderConfig('openai', { apiKey: 'sk-poly', model: 'gpt-4o' });
      expect(getProviderConfig('openai').apiKey).toBe('sk-poly');

      setProviderConfig('gemini', { apiKey: 'AIza-poly', model: 'gemini-1.5-pro' });
      expect(getProviderConfig('gemini').apiKey).toBe('AIza-poly');
    });
  });

  // =========================================================================
  // Challenge 5: Trailing Slash, Case Sensitivity & URL Validation Corner Cases
  // =========================================================================
  describe('Challenge 5: Trailing Slash, Case Sensitivity & URL Validation Corner Cases', () => {
    describe('Trailing Slash Normalization', () => {
      it('normalizes single and multiple trailing slashes for Ollama baseUrl', () => {
        setOllamaConfig({ baseUrl: 'http://localhost:11434/' });
        expect(getOllamaConfig().baseUrl).toBe('http://localhost:11434');

        setOllamaConfig({ baseUrl: 'http://localhost:11434/////' });
        expect(getOllamaConfig().baseUrl).toBe('http://localhost:11434');

        setOllamaConfig({ baseUrl: 'http://192.168.1.50:11434/api/v1/' });
        expect(getOllamaConfig().baseUrl).toBe('http://192.168.1.50:11434/api/v1');
      });

      it('normalizes trailing slashes for OpenAI baseUrl', () => {
        setOpenAIConfig({ baseUrl: 'https://api.openai.com/v1/' });
        expect(getOpenAIConfig().baseUrl).toBe('https://api.openai.com/v1');

        setOpenAIConfig({ baseUrl: 'https://custom-gateway.io/v1////' });
        expect(getOpenAIConfig().baseUrl).toBe('https://custom-gateway.io/v1');
      });

      it('Webhook preserves URL path trailing slashes while trimming whitespace', () => {
        // Many webhook endpoints require the trailing slash in the path (e.g. /webhook/)
        setWebhookConfig({ webhookUrl: '   https://n8n.cloud/webhook/deploy/   ' });
        expect(getWebhookConfig().webhookUrl).toBe('https://n8n.cloud/webhook/deploy/');
      });
    });

    describe('Case Sensitivity & Unsupported Provider Resilience', () => {
      it('ignores uppercase and mixed case strings in setActiveProvider', () => {
        setActiveProvider('webhook');

        // None of these should update activeProvider
        setActiveProvider('OPENAI' as any);
        expect(getActiveProvider()).toBe('webhook');

        setActiveProvider('Ollama' as any);
        expect(getActiveProvider()).toBe('webhook');

        setActiveProvider('Gemini' as any);
        expect(getActiveProvider()).toBe('webhook');

        setActiveProvider('WEBHOOK' as any);
        expect(getActiveProvider()).toBe('webhook');
      });

      it('getActiveProvider falls back to "webhook" if localStorage was manipulated with non-canonical casing', () => {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER, 'OPENAI');
        expect(getActiveProvider()).toBe('webhook');

        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER, 'Ollama');
        expect(getActiveProvider()).toBe('webhook');
      });

      it('getProviderConfig throws descriptive error for unsupported or malformed provider names', () => {
        expect(() => getProviderConfig('claude' as any)).toThrowError(/Unsupported AI provider: claude/);
        expect(() => getProviderConfig('OPENAI' as any)).toThrowError(/Unsupported AI provider: OPENAI/);
        expect(() => getProviderConfig('' as any)).toThrowError(/Unsupported AI provider:/);
        expect(() => getProviderConfig(undefined as any)).toThrowError(/Unsupported AI provider: undefined/);
      });

      it('setProviderConfig and resetProviderConfig safely no-op for unsupported provider names', () => {
        expect(() => setProviderConfig('unknown' as any, {})).not.toThrow();
        expect(() => resetProviderConfig('unknown' as any)).not.toThrow();
      });
    });

    describe('URL Validation Corner Cases & SSRF Prevention', () => {
      describe('validateWebhookUrl', () => {
        it('accepts valid HTTP, HTTPS, localhost, IPv4, IPv6 and port-specified URLs', () => {
          const validUrls = [
            'http://localhost:5678/webhook',
            'https://localhost:5678/webhook',
            'http://127.0.0.1:5678/webhook',
            'http://[::1]:5678/webhook',
            'https://n8n.cloud/webhook/test-uuid-1234',
            'https://sub.domain.co.uk:8443/api/v1/webhook?source=git#staged',
            'https://user:pass@secret.internal.net/hook',
            'http://internal-docker-service:5678/hook',
          ];

          for (const url of validUrls) {
            const result = validateWebhookUrl(url);
            expect(result.isValid, `Expected "${url}" to be valid`).toBe(true);
            expect(result.error).toBeUndefined();
          }
        });

        it('rejects empty, whitespace-only, and non-string inputs with actionable error', () => {
          expect(validateWebhookUrl('').isValid).toBe(false);
          expect(validateWebhookUrl('   ').isValid).toBe(false);
          expect(validateWebhookUrl(null as any).isValid).toBe(false);
          expect(validateWebhookUrl(undefined as any).isValid).toBe(false);
          expect(validateWebhookUrl('').error).toBe('Webhook URL cannot be empty.');
        });

        it('rejects non-HTTP/HTTPS protocols (SSRF / scheme injection defenses)', () => {
          const dangerousUrls = [
            'javascript:alert(document.cookie)',
            'data:text/html,<script>alert(1)</script>',
            'file:///etc/passwd',
            'file:///C:/Windows/win.ini',
            'ftp://ftp.example.com/file',
            'ws://socket.example.com/live',
            'wss://socket.example.com/live',
            'ssh://git@github.com:22/repo.git',
            'gopher://gopher.example.com',
            'mailto:admin@example.com',
          ];

          for (const url of dangerousUrls) {
            const result = validateWebhookUrl(url);
            expect(result.isValid, `Expected "${url}" to be rejected`).toBe(false);
            expect(result.error).toMatch(/HTTP or HTTPS protocol|Invalid URL format/);
          }
        });

        it('rejects malformed and non-resolvable URL structures', () => {
          const malformed = [
            'http://',
            'https://',
            'not-a-valid-url',
            '//no-protocol',
            'httpp://typo.com',
            'http://:8080',
          ];

          for (const url of malformed) {
            const result = validateWebhookUrl(url);
            expect(result.isValid, `Expected "${url}" to be rejected`).toBe(false);
            expect(result.error).toBeDefined();
          }
        });
      });

      describe('validateOllamaUrl', () => {
        it('allows empty or whitespace-only strings (which fall back to localhost default)', () => {
          expect(validateOllamaUrl('').isValid).toBe(true);
          expect(validateOllamaUrl('   ').isValid).toBe(true);
        });

        it('accepts valid HTTP/HTTPS Ollama endpoints', () => {
          expect(validateOllamaUrl('http://localhost:11434').isValid).toBe(true);
          expect(validateOllamaUrl('http://127.0.0.1:11434').isValid).toBe(true);
          expect(validateOllamaUrl('http://192.168.1.100:11434').isValid).toBe(true);
          expect(validateOllamaUrl('https://ollama.mycompany.org').isValid).toBe(true);
          expect(validateOllamaUrl('http://[::1]:11434').isValid).toBe(true);
        });

        it('rejects non-HTTP protocols and malformed URLs for Ollama', () => {
          expect(validateOllamaUrl('ftp://localhost:11434').isValid).toBe(false);
          expect(validateOllamaUrl('ftp://localhost:11434').error).toBe('Ollama Base URL must use HTTP or HTTPS protocol.');

          expect(validateOllamaUrl('file:///home/ollama').isValid).toBe(false);
          expect(validateOllamaUrl('bad-ollama-url').isValid).toBe(false);
          expect(validateOllamaUrl('bad-ollama-url').error).toBe('Invalid Ollama Base URL format.');
        });
      });

      describe('validateApiKey', () => {
        it('accepts non-empty API keys with whitespace trimming', () => {
          expect(validateApiKey('sk-1234567890abcdef', 'OpenAI').isValid).toBe(true);
          expect(validateApiKey('  AIzaSyD-abc1234567890  ', 'Gemini').isValid).toBe(true);
        });

        it('rejects empty and whitespace-only API keys with provider-scoped error message', () => {
          const res1 = validateApiKey('', 'OpenAI');
          expect(res1.isValid).toBe(false);
          expect(res1.error).toBe('OpenAI API key cannot be empty.');

          const res2 = validateApiKey('   ', 'Gemini');
          expect(res2.isValid).toBe(false);
          expect(res2.error).toBe('Gemini API key cannot be empty.');
        });
      });

      describe('validateAIProviderConfig polymorphic checks', () => {
        it('validates Webhook configuration', () => {
          expect(validateAIProviderConfig('webhook', { webhookUrl: 'https://valid.com' }).isValid).toBe(true);
          expect(validateAIProviderConfig('webhook', { webhookUrl: 'invalid' }).isValid).toBe(false);
        });

        it('validates Ollama configuration (model required, valid baseUrl)', () => {
          expect(validateAIProviderConfig('ollama', { baseUrl: 'http://localhost:11434', model: 'llama3.2' }).isValid).toBe(true);
          expect(validateAIProviderConfig('ollama', { baseUrl: 'http://localhost:11434', model: '' }).isValid).toBe(false);
          expect(validateAIProviderConfig('ollama', { baseUrl: 'http://localhost:11434', model: '   ' }).isValid).toBe(false);
          expect(validateAIProviderConfig('ollama', { baseUrl: 'bad-url', model: 'llama3.2' }).isValid).toBe(false);
        });

        it('validates OpenAI configuration (model required)', () => {
          expect(validateAIProviderConfig('openai', { model: 'gpt-4o' }).isValid).toBe(true);
          expect(validateAIProviderConfig('openai', { model: '' }).isValid).toBe(false);
          expect(validateAIProviderConfig('openai', { model: '   ' }).isValid).toBe(false);
        });

        it('validates Gemini configuration (model required)', () => {
          expect(validateAIProviderConfig('gemini', { model: 'gemini-1.5-flash' }).isValid).toBe(true);
          expect(validateAIProviderConfig('gemini', { model: '' }).isValid).toBe(false);
          expect(validateAIProviderConfig('gemini', { model: '   ' }).isValid).toBe(false);
        });
      });
    });
  });

  // =========================================================================
  // Challenge 6: Legacy Webhook Key Backward Compatibility & Dual Sync
  // =========================================================================
  describe('Challenge 6: Legacy Webhook Key Backward Compatibility & Dual Sync', () => {
    it('seamlessly reads from legacy keys when modern keys are absent', () => {
      localStorage.setItem(STORAGE_KEY_LEGACY_WEBHOOK_URL, 'https://legacy-n8n.cloud/webhook/test');
      localStorage.setItem(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN, 'legacy-bearer-token');

      const config = getWebhookConfig();
      expect(config.webhookUrl).toBe('https://legacy-n8n.cloud/webhook/test');
      expect(config.webhookToken).toBe('legacy-bearer-token');

      // Hybrid resolution recognizes legacy key as source: "user"
      const resolved = resolveAIConfig({});
      expect(resolved.sources.webhook).toBe('user');
      expect(resolved.providerConfigs.webhook.webhookUrl).toBe('https://legacy-n8n.cloud/webhook/test');
    });

    it('dual-writes to both modern and legacy keys on setWebhookConfig', () => {
      setWebhookConfig({
        webhookUrl: 'https://dual-write.cloud/webhook',
        webhookToken: 'dual-token-abc',
      });

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://dual-write.cloud/webhook');
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_URL)).toBe('https://dual-write.cloud/webhook');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBe('dual-token-abc');
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN)).toBe('dual-token-abc');
    });

    it('clears both modern and legacy keys on resetProviderConfig("webhook")', () => {
      localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, 'https://modern.com');
      localStorage.setItem(STORAGE_KEY_LEGACY_WEBHOOK_URL, 'https://legacy.com');
      localStorage.setItem(STORAGE_KEY_WEBHOOK_TOKEN, 'modern-tok');
      localStorage.setItem(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN, 'legacy-tok');

      resetProviderConfig('webhook');

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN)).toBeNull();
    });

    it('prefers modern key over legacy key when both exist with conflicting values', () => {
      localStorage.setItem(STORAGE_KEY_LEGACY_WEBHOOK_URL, 'https://legacy-conflict.com');
      localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, 'https://modern-winner.com');

      expect(getWebhookConfig().webhookUrl).toBe('https://modern-winner.com');
    });
  });

  // =========================================================================
  // Challenge 7: Asynchronous Effective Config Resolution (IPC Failure & Fallback)
  // =========================================================================
  describe('Challenge 7: Asynchronous Effective Config Resolution (IPC Resilience)', () => {
    it('gracefully handles IPC rejection when window.devPilot.getAIConfig rejects', async () => {
      setOpenAIConfig({ apiKey: 'sk-survivor-key' });

      window.devPilot = {
        getAIConfig: vi.fn().mockRejectedValue(new Error('IPC channel timeout')),
      } as unknown as DevPilotAPI;

      const resolved = await resolveEffectiveAIConfig();
      expect(resolved).toBeDefined();
      expect(resolved.activeProvider).toBe('webhook');
      expect(resolved.sources.openai).toBe('user');
      expect(resolved.providerConfigs.openai.apiKey).toBe('sk-survivor-key');
    });

    it('gracefully handles IPC returning success: false with an error message', async () => {
      window.devPilot = {
        getAIConfig: vi.fn().mockResolvedValue({
          success: false,
          error: 'Process not permitted to query environment secrets',
        }),
      } as unknown as DevPilotAPI;

      const resolved = await resolveEffectiveAIConfig();
      expect(resolved).toBeDefined();
      expect(resolved.sources.webhook).toBe('none');
      expect(resolved.providerConfigs.ollama.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
    });

    it('gracefully handles IPC returning malformed or null data payloads', async () => {
      window.devPilot = {
        getAIConfig: vi.fn().mockResolvedValue({
          success: true,
          data: null,
        }),
      } as unknown as DevPilotAPI;

      const resolved = await resolveEffectiveAIConfig();
      expect(resolved).toBeDefined();
      expect(resolved.activeProvider).toBe('webhook');
    });

    it('seamlessly falls back to getWebhookConfig when getAIConfig is not implemented', async () => {
      window.devPilot = {
        getWebhookConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            webhookUrl: 'https://legacy-ipc-env.com/hook',
            source: 'env',
            envDefaults: { webhookUrl: 'https://legacy-ipc-env.com/hook', hasToken: true },
          },
        }),
      } as unknown as DevPilotAPI;

      const resolved = await resolveEffectiveAIConfig();
      expect(resolved.providerConfigs.webhook.webhookUrl).toBe('https://legacy-ipc-env.com/hook');
      expect(resolved.sources.webhook).toBe('env');
    });
  });

  // =========================================================================
  // Challenge 8: URL Validation Extreme Boundaries
  // =========================================================================
  describe('Challenge 8: URL Validation Extreme Boundaries', () => {
    it('handles massive URLs up to 4096 characters without hanging or regex catastrophic backtracking', () => {
      const longPath = 'a'.repeat(3000);
      const longUrl = `https://example.com/${longPath}`;

      const t0 = performance.now();
      const res = validateWebhookUrl(longUrl);
      const duration = performance.now() - t0;

      expect(res.isValid).toBe(true);
      expect(duration).toBeLessThan(50); // Must parse in under 50ms
    });

    it('validates internationalized domain names (IDN / punycode)', () => {
      expect(validateWebhookUrl('https://xn--bcher-kva.example/webhook').isValid).toBe(true);
      expect(validateWebhookUrl('https://bücher.example/webhook').isValid).toBe(true);
    });

    it('validates URLs with boundary port numbers and query parameters', () => {
      expect(validateWebhookUrl('http://localhost:80').isValid).toBe(true);
      expect(validateWebhookUrl('https://domain.com:443/hook').isValid).toBe(true);
      expect(validateWebhookUrl('https://domain.com:65535/hook').isValid).toBe(true);

      // Out of range port (> 65535) is rejected by WHATWG URL standard
      expect(validateWebhookUrl('https://domain.com:70000/hook').isValid).toBe(false);
    });

    it('handles excessive surrounding whitespace and newlines cleanly', () => {
      const paddedUrl = '\r\n\t  https://api.my-domain.com/webhook/receive  \t\r\n';
      const res = validateWebhookUrl(paddedUrl);
      expect(res.isValid).toBe(true);
    });
  });
});
