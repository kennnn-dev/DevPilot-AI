/**
 * AI Configuration and Resolver Service for DevPilot AI.
 * Handles multi-provider credential persistence, hybrid .env precedence resolution,
 * independent provider settings management, and backward compatibility.
 */

import type {
  AIProvider,
  WebhookConfig,
  OllamaConfig,
  OpenAIConfig,
  GeminiConfig,
  ResolvedAIConfig,
  ResolvedWebhookConfig,
  ConfigSource,
} from '../../shared/types';

// ============================================================================
// LocalStorage Key Constants
// ============================================================================

export const STORAGE_KEY_AI_ACTIVE_PROVIDER = 'devpilot_ai_active_provider';
export const STORAGE_KEY_ACTIVE_PROVIDER = STORAGE_KEY_AI_ACTIVE_PROVIDER;

// Webhook Keys (Modern + Legacy)
export const STORAGE_KEY_WEBHOOK_URL = 'devpilot_webhook_url';
export const STORAGE_KEY_WEBHOOK_TOKEN = 'devpilot_webhook_token';
export const STORAGE_KEY_LEGACY_WEBHOOK_URL = 'devpilot_n8n_webhook_url_v1';
export const STORAGE_KEY_LEGACY_WEBHOOK_TOKEN = 'devpilot_n8n_webhook_token_v1';

// Ollama Keys
export const STORAGE_KEY_OLLAMA_BASE_URL = 'devpilot_ollama_base_url';
export const STORAGE_KEY_OLLAMA_MODEL = 'devpilot_ollama_model';

// OpenAI Keys
export const STORAGE_KEY_OPENAI_API_KEY = 'devpilot_openai_api_key';
export const STORAGE_KEY_OPENAI_MODEL = 'devpilot_openai_model';
export const STORAGE_KEY_OPENAI_BASE_URL = 'devpilot_openai_base_url';

// Gemini Keys
export const STORAGE_KEY_GEMINI_API_KEY = 'devpilot_gemini_api_key';
export const STORAGE_KEY_GEMINI_MODEL = 'devpilot_gemini_model';

export const STORAGE_KEYS = {
  ACTIVE_PROVIDER: STORAGE_KEY_AI_ACTIVE_PROVIDER,
  WEBHOOK_URL: STORAGE_KEY_WEBHOOK_URL,
  WEBHOOK_TOKEN: STORAGE_KEY_WEBHOOK_TOKEN,
  LEGACY_WEBHOOK_URL: STORAGE_KEY_LEGACY_WEBHOOK_URL,
  LEGACY_WEBHOOK_TOKEN: STORAGE_KEY_LEGACY_WEBHOOK_TOKEN,
  OLLAMA_BASE_URL: STORAGE_KEY_OLLAMA_BASE_URL,
  OLLAMA_MODEL: STORAGE_KEY_OLLAMA_MODEL,
  OPENAI_API_KEY: STORAGE_KEY_OPENAI_API_KEY,
  OPENAI_MODEL: STORAGE_KEY_OPENAI_MODEL,
  OPENAI_BASE_URL: STORAGE_KEY_OPENAI_BASE_URL,
  GEMINI_API_KEY: STORAGE_KEY_GEMINI_API_KEY,
  GEMINI_MODEL: STORAGE_KEY_GEMINI_MODEL,
} as const;

// ============================================================================
// Default Configuration Constants
// ============================================================================

export const DEFAULT_AI_PROVIDER: AIProvider = 'webhook';

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'llama3.2';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';

export const DEFAULT_OLLAMA_CONFIG: Readonly<OllamaConfig> = {
  baseUrl: DEFAULT_OLLAMA_BASE_URL,
  model: DEFAULT_OLLAMA_MODEL,
};

export const DEFAULT_OPENAI_CONFIG: Readonly<OpenAIConfig> = {
  apiKey: '',
  model: DEFAULT_OPENAI_MODEL,
  baseUrl: 'https://api.openai.com/v1',
};

export const DEFAULT_GEMINI_CONFIG: Readonly<GeminiConfig> = {
  apiKey: '',
  model: DEFAULT_GEMINI_MODEL,
};

export const DEFAULT_WEBHOOK_CONFIG: Readonly<WebhookConfig> = {
  webhookUrl: '',
  webhookToken: '',
};

export const DEFAULT_CONFIGS = {
  activeProvider: DEFAULT_AI_PROVIDER,
  webhook: DEFAULT_WEBHOOK_CONFIG,
  ollama: DEFAULT_OLLAMA_CONFIG,
  openai: DEFAULT_OPENAI_CONFIG,
  gemini: DEFAULT_GEMINI_CONFIG,
} as const;

// ============================================================================
// Safe LocalStorage Wrappers
// ============================================================================

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Graceful handling for sandboxed / SSR environments
  }
  return null;
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Graceful handling
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // Graceful handling
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

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

export function validateOllamaUrl(url: string): { isValid: boolean; error?: string } {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { isValid: true }; // Empty falls back to DEFAULT_OLLAMA_CONFIG.baseUrl
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Ollama Base URL must use HTTP or HTTPS protocol.' };
    }
  } catch {
    return { isValid: false, error: 'Invalid Ollama Base URL format.' };
  }
  return { isValid: true };
}

export function validateApiKey(key: string, providerName: string): { isValid: boolean; error?: string } {
  const trimmed = (key || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${providerName} API key cannot be empty.` };
  }
  return { isValid: true };
}

export function validateAIProviderConfig(
  provider: AIProvider,
  config: Record<string, any>
): { isValid: boolean; error?: string } {
  switch (provider) {
    case 'webhook': {
      const url = config.webhookUrl;
      return validateWebhookUrl(url);
    }
    case 'ollama': {
      const baseUrl = config.baseUrl;
      const model = typeof config.model === 'string' ? config.model.trim() : '';
      if (!model) {
        return { isValid: false, error: 'Ollama model name cannot be empty.' };
      }
      if (baseUrl !== undefined && baseUrl !== '') {
        try {
          const parsed = new URL(baseUrl.trim());
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { isValid: false, error: 'Ollama Base URL must use HTTP or HTTPS protocol.' };
          }
        } catch {
          return { isValid: false, error: 'Invalid Ollama Base URL format.' };
        }
      }
      return { isValid: true };
    }
    case 'openai': {
      const model = typeof config.model === 'string' ? config.model.trim() : '';
      if (!model) {
        return { isValid: false, error: 'OpenAI model name cannot be empty.' };
      }
      return { isValid: true };
    }
    case 'gemini': {
      const model = typeof config.model === 'string' ? config.model.trim() : '';
      if (!model) {
        return { isValid: false, error: 'Gemini model name cannot be empty.' };
      }
      return { isValid: true };
    }
    default:
      return { isValid: true };
  }
}

// ============================================================================
// Active Provider Management
// ============================================================================

export function getActiveProvider(): AIProvider {
  const val = safeGet(STORAGE_KEY_AI_ACTIVE_PROVIDER);
  if (val === 'webhook' || val === 'ollama' || val === 'openai' || val === 'gemini') {
    return val;
  }
  return DEFAULT_AI_PROVIDER;
}

export function setActiveProvider(provider: AIProvider): void {
  if (provider === 'webhook' || provider === 'ollama' || provider === 'openai' || provider === 'gemini') {
    safeSet(STORAGE_KEY_AI_ACTIVE_PROVIDER, provider);
  }
}

export const getStoredActiveProvider = getActiveProvider;
export const setStoredActiveProvider = setActiveProvider;

// ============================================================================
// Webhook Provider Operations (Dual-Key Sync)
// ============================================================================

export function getWebhookUrl(): string {
  const val = safeGet(STORAGE_KEY_WEBHOOK_URL);
  if (val !== null && val.trim().length > 0) return val.trim();
  const legacyVal = safeGet(STORAGE_KEY_LEGACY_WEBHOOK_URL);
  if (legacyVal !== null && legacyVal.trim().length > 0) return legacyVal.trim();
  return '';
}

export function setWebhookUrl(url: string): void {
  const trimmed = (url || '').trim();
  if (trimmed) {
    safeSet(STORAGE_KEY_WEBHOOK_URL, trimmed);
    safeSet(STORAGE_KEY_LEGACY_WEBHOOK_URL, trimmed);
  } else {
    safeRemove(STORAGE_KEY_WEBHOOK_URL);
    safeRemove(STORAGE_KEY_LEGACY_WEBHOOK_URL);
  }
}

export function clearWebhookUrl(): void {
  safeRemove(STORAGE_KEY_WEBHOOK_URL);
  safeRemove(STORAGE_KEY_LEGACY_WEBHOOK_URL);
}

export function getWebhookToken(): string {
  const val = safeGet(STORAGE_KEY_WEBHOOK_TOKEN);
  if (val !== null && val.trim().length > 0) return val.trim();
  const legacyVal = safeGet(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN);
  if (legacyVal !== null && legacyVal.trim().length > 0) return legacyVal.trim();
  return '';
}

export function setWebhookToken(token: string): void {
  const trimmed = (token || '').trim();
  if (trimmed) {
    safeSet(STORAGE_KEY_WEBHOOK_TOKEN, trimmed);
    safeSet(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN, trimmed);
  } else {
    safeRemove(STORAGE_KEY_WEBHOOK_TOKEN);
    safeRemove(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN);
  }
}

export function clearWebhookToken(): void {
  safeRemove(STORAGE_KEY_WEBHOOK_TOKEN);
  safeRemove(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN);
}

export function clearWebhookConfig(): void {
  clearWebhookUrl();
  clearWebhookToken();
}

export const resetWebhookConfig = clearWebhookConfig;

export function getWebhookConfig(): WebhookConfig & { webhookToken: string } {
  return {
    webhookUrl: getWebhookUrl(),
    webhookToken: getWebhookToken(),
  };
}

export function setWebhookConfig(config: Partial<WebhookConfig>): void {
  if (config.webhookUrl !== undefined) {
    setWebhookUrl(config.webhookUrl);
  }
  if (config.webhookToken !== undefined) {
    setWebhookToken(config.webhookToken);
  }
}

// ============================================================================
// Ollama Provider Operations
// ============================================================================

export function getOllamaConfig(): OllamaConfig {
  const baseUrl = (safeGet(STORAGE_KEY_OLLAMA_BASE_URL) || '').trim();
  const model = (safeGet(STORAGE_KEY_OLLAMA_MODEL) || '').trim();
  return {
    baseUrl: baseUrl || DEFAULT_OLLAMA_CONFIG.baseUrl,
    model: model || DEFAULT_OLLAMA_CONFIG.model,
  };
}

export function setOllamaConfig(config: Partial<OllamaConfig>): void {
  if (config.baseUrl !== undefined) {
    // Trim and normalize trailing slash
    const trimmed = config.baseUrl.trim().replace(/\/+$/, '');
    if (trimmed) {
      safeSet(STORAGE_KEY_OLLAMA_BASE_URL, trimmed);
    } else {
      safeRemove(STORAGE_KEY_OLLAMA_BASE_URL);
    }
  }
  if (config.model !== undefined) {
    const trimmed = config.model.trim();
    if (trimmed) {
      safeSet(STORAGE_KEY_OLLAMA_MODEL, trimmed);
    } else {
      safeRemove(STORAGE_KEY_OLLAMA_MODEL);
    }
  }
}

export function resetOllamaConfig(): void {
  safeRemove(STORAGE_KEY_OLLAMA_BASE_URL);
  safeRemove(STORAGE_KEY_OLLAMA_MODEL);
}

export const getStoredOllamaConfig = getOllamaConfig;
export function setStoredOllamaConfig(baseUrl: string, model: string): void {
  setOllamaConfig({ baseUrl, model });
}
export const clearStoredOllamaConfig = resetOllamaConfig;

// ============================================================================
// OpenAI Provider Operations
// ============================================================================

export function getOpenAIConfig(): OpenAIConfig {
  const apiKey = (safeGet(STORAGE_KEY_OPENAI_API_KEY) || '').trim();
  const model = (safeGet(STORAGE_KEY_OPENAI_MODEL) || '').trim();
  const baseUrl = (safeGet(STORAGE_KEY_OPENAI_BASE_URL) || '').trim();
  return {
    apiKey: apiKey || '',
    model: model || DEFAULT_OPENAI_CONFIG.model,
    baseUrl: baseUrl || undefined,
  };
}

export function setOpenAIConfig(config: Partial<OpenAIConfig>): void {
  if (config.apiKey !== undefined) {
    const trimmed = config.apiKey.trim();
    if (trimmed) {
      safeSet(STORAGE_KEY_OPENAI_API_KEY, trimmed);
    } else {
      safeRemove(STORAGE_KEY_OPENAI_API_KEY);
    }
  }
  if (config.model !== undefined) {
    const trimmed = config.model.trim();
    if (trimmed) {
      safeSet(STORAGE_KEY_OPENAI_MODEL, trimmed);
    } else {
      safeRemove(STORAGE_KEY_OPENAI_MODEL);
    }
  }
  if (config.baseUrl !== undefined) {
    const trimmed = config.baseUrl.trim().replace(/\/+$/, '');
    if (trimmed) {
      safeSet(STORAGE_KEY_OPENAI_BASE_URL, trimmed);
    } else {
      safeRemove(STORAGE_KEY_OPENAI_BASE_URL);
    }
  }
}

export function resetOpenAIConfig(): void {
  safeRemove(STORAGE_KEY_OPENAI_API_KEY);
  safeRemove(STORAGE_KEY_OPENAI_MODEL);
  safeRemove(STORAGE_KEY_OPENAI_BASE_URL);
}

export const getStoredOpenAIConfig = getOpenAIConfig;
export function setStoredOpenAIConfig(apiKey: string, model: string): void {
  setOpenAIConfig({ apiKey, model });
}
export const clearStoredOpenAIConfig = resetOpenAIConfig;

// ============================================================================
// Gemini Provider Operations
// ============================================================================

export function getGeminiConfig(): GeminiConfig {
  const apiKey = (safeGet(STORAGE_KEY_GEMINI_API_KEY) || '').trim();
  const model = (safeGet(STORAGE_KEY_GEMINI_MODEL) || '').trim();
  return {
    apiKey: apiKey || '',
    model: model || DEFAULT_GEMINI_CONFIG.model,
  };
}

export function setGeminiConfig(config: Partial<GeminiConfig>): void {
  if (config.apiKey !== undefined) {
    const trimmed = config.apiKey.trim();
    if (trimmed) {
      safeSet(STORAGE_KEY_GEMINI_API_KEY, trimmed);
    } else {
      safeRemove(STORAGE_KEY_GEMINI_API_KEY);
    }
  }
  if (config.model !== undefined) {
    const trimmed = config.model.trim();
    if (trimmed) {
      safeSet(STORAGE_KEY_GEMINI_MODEL, trimmed);
    } else {
      safeRemove(STORAGE_KEY_GEMINI_MODEL);
    }
  }
}

export function resetGeminiConfig(): void {
  safeRemove(STORAGE_KEY_GEMINI_API_KEY);
  safeRemove(STORAGE_KEY_GEMINI_MODEL);
}

export const getStoredGeminiConfig = getGeminiConfig;
export function setStoredGeminiConfig(apiKey: string, model: string): void {
  setGeminiConfig({ apiKey, model });
}
export const clearStoredGeminiConfig = resetGeminiConfig;

// ============================================================================
// Polymorphic Provider Management
// ============================================================================

export function getProviderConfig(provider: 'webhook'): WebhookConfig;
export function getProviderConfig(provider: 'ollama'): OllamaConfig;
export function getProviderConfig(provider: 'openai'): OpenAIConfig;
export function getProviderConfig(provider: 'gemini'): GeminiConfig;
export function getProviderConfig(provider: AIProvider): WebhookConfig | OllamaConfig | OpenAIConfig | GeminiConfig;
export function getProviderConfig(provider: AIProvider): any {
  switch (provider) {
    case 'webhook':
      return getWebhookConfig();
    case 'ollama':
      return getOllamaConfig();
    case 'openai':
      return getOpenAIConfig();
    case 'gemini':
      return getGeminiConfig();
    default:
      throw new Error(`Unsupported AI provider: ${String(provider)}`);
  }
}

export const getStoredProviderConfig = getProviderConfig;

export function setProviderConfig(
  provider: AIProvider,
  config: Partial<WebhookConfig & OllamaConfig & OpenAIConfig & GeminiConfig>
): void {
  switch (provider) {
    case 'webhook':
      setWebhookConfig(config);
      break;
    case 'ollama':
      setOllamaConfig(config);
      break;
    case 'openai':
      setOpenAIConfig(config);
      break;
    case 'gemini':
      setGeminiConfig(config);
      break;
  }
}

export const saveProviderConfig = setProviderConfig;

export function resetProviderConfig(provider: AIProvider): void {
  switch (provider) {
    case 'webhook':
      clearWebhookConfig();
      break;
    case 'ollama':
      resetOllamaConfig();
      break;
    case 'openai':
      resetOpenAIConfig();
      break;
    case 'gemini':
      resetGeminiConfig();
      break;
  }
}

export function resetAllAIConfig(): void {
  clearWebhookConfig();
  resetOllamaConfig();
  resetOpenAIConfig();
  resetGeminiConfig();
  safeRemove(STORAGE_KEY_AI_ACTIVE_PROVIDER);
}

export const resetAllProviderConfigs = resetAllAIConfig;

// ============================================================================
// Resolution Logic (Hybrid Precedence: User > .env > Default / Unconfigured)
// ============================================================================

export function resolveAIConfig(envDefaultsInput?: Partial<ResolvedAIConfig['envDefaults']>): ResolvedAIConfig {
  const envDefaults: ResolvedAIConfig['envDefaults'] = {
    activeProvider: envDefaultsInput?.activeProvider,
    webhookUrl: envDefaultsInput?.webhookUrl || '',
    hasWebhookToken: Boolean(envDefaultsInput?.hasWebhookToken),
    ollamaBaseUrl: envDefaultsInput?.ollamaBaseUrl || '',
    ollamaModel: envDefaultsInput?.ollamaModel || '',
    hasOpenAiKey: Boolean(envDefaultsInput?.hasOpenAiKey),
    openAiModel: envDefaultsInput?.openAiModel || '',
    hasGeminiKey: Boolean(envDefaultsInput?.hasGeminiKey),
    geminiModel: envDefaultsInput?.geminiModel || '',
  };

  // 1. Active Provider Precedence: User Settings > .env > DEFAULT ('webhook')
  const userStoredProvider = safeGet(STORAGE_KEY_AI_ACTIVE_PROVIDER);
  let activeProvider: AIProvider = DEFAULT_AI_PROVIDER;
  if (
    userStoredProvider === 'webhook' ||
    userStoredProvider === 'ollama' ||
    userStoredProvider === 'openai' ||
    userStoredProvider === 'gemini'
  ) {
    activeProvider = userStoredProvider;
  } else if (envDefaults.activeProvider) {
    activeProvider = envDefaults.activeProvider;
  }

  // 2. Webhook Resolution
  const userWebhookUrl = getWebhookUrl();
  const userWebhookToken = getWebhookToken();
  const envWebhookUrl = (envDefaults.webhookUrl || '').trim();
  let webhookSource: ConfigSource = 'none';
  if (userWebhookUrl) {
    webhookSource = 'user';
  } else if (envWebhookUrl) {
    webhookSource = 'env';
  } else {
    webhookSource = 'none';
  }
  const effectiveWebhookConfig: WebhookConfig = {
    webhookUrl: userWebhookUrl || envWebhookUrl || '',
    webhookToken: userWebhookToken || (envDefaults.hasWebhookToken ? '••••••••' : undefined),
  };

  // 3. Ollama Resolution
  const rawUserOllamaUrl = (safeGet(STORAGE_KEY_OLLAMA_BASE_URL) || '').trim();
  const rawUserOllamaModel = (safeGet(STORAGE_KEY_OLLAMA_MODEL) || '').trim();
  const hasUserOllama = Boolean(rawUserOllamaUrl || rawUserOllamaModel);
  const hasEnvOllama = Boolean(
    (envDefaults.ollamaBaseUrl && envDefaults.ollamaBaseUrl !== DEFAULT_OLLAMA_CONFIG.baseUrl) ||
    (envDefaults.ollamaModel && envDefaults.ollamaModel !== DEFAULT_OLLAMA_CONFIG.model)
  );
  let ollamaSource: ConfigSource = 'none';
  if (hasUserOllama) {
    ollamaSource = 'user';
  } else if (hasEnvOllama) {
    ollamaSource = 'env';
  } else {
    ollamaSource = 'none';
  }
  const effectiveOllamaConfig: OllamaConfig = {
    baseUrl: rawUserOllamaUrl || envDefaults.ollamaBaseUrl || DEFAULT_OLLAMA_CONFIG.baseUrl,
    model: rawUserOllamaModel || envDefaults.ollamaModel || DEFAULT_OLLAMA_CONFIG.model,
  };

  // 4. OpenAI Resolution
  const rawUserOpenAiKey = (safeGet(STORAGE_KEY_OPENAI_API_KEY) || '').trim();
  const rawUserOpenAiModel = (safeGet(STORAGE_KEY_OPENAI_MODEL) || '').trim();
  const rawUserOpenAiBaseUrl = (safeGet(STORAGE_KEY_OPENAI_BASE_URL) || '').trim();
  let openAiSource: ConfigSource = 'none';
  if (rawUserOpenAiKey) {
    openAiSource = 'user';
  } else if (envDefaults.hasOpenAiKey) {
    openAiSource = 'env';
  } else {
    openAiSource = 'none';
  }
  const effectiveOpenAiConfig: OpenAIConfig = {
    apiKey: rawUserOpenAiKey || (envDefaults.hasOpenAiKey ? '••••••••' : ''),
    model: rawUserOpenAiModel || envDefaults.openAiModel || DEFAULT_OPENAI_CONFIG.model,
    baseUrl: rawUserOpenAiBaseUrl || undefined,
  };

  // 5. Gemini Resolution
  const rawUserGeminiKey = (safeGet(STORAGE_KEY_GEMINI_API_KEY) || '').trim();
  const rawUserGeminiModel = (safeGet(STORAGE_KEY_GEMINI_MODEL) || '').trim();
  let geminiSource: ConfigSource = 'none';
  if (rawUserGeminiKey) {
    geminiSource = 'user';
  } else if (envDefaults.hasGeminiKey) {
    geminiSource = 'env';
  } else {
    geminiSource = 'none';
  }
  const effectiveGeminiConfig: GeminiConfig = {
    apiKey: rawUserGeminiKey || (envDefaults.hasGeminiKey ? '••••••••' : ''),
    model: rawUserGeminiModel || envDefaults.geminiModel || DEFAULT_GEMINI_CONFIG.model,
  };

  const sources: Record<AIProvider, ConfigSource> = {
    webhook: webhookSource,
    ollama: ollamaSource,
    openai: openAiSource,
    gemini: geminiSource,
  };

  return {
    activeProvider,
    providerConfigs: {
      webhook: effectiveWebhookConfig,
      ollama: effectiveOllamaConfig,
      openai: effectiveOpenAiConfig,
      gemini: effectiveGeminiConfig,
    },
    sources,
    source: sources,
    envDefaults,
  };
}

export async function resolveEffectiveAIConfig(): Promise<ResolvedAIConfig> {
  let envDefaults: Partial<ResolvedAIConfig['envDefaults']> = {};
  let ipcSources: Record<AIProvider, ConfigSource> | undefined = undefined;

  try {
    if (
      typeof window !== 'undefined' &&
      window.devPilot &&
      typeof window.devPilot.getAIConfig === 'function'
    ) {
      const res = await window.devPilot.getAIConfig();
      if (res && res.success && res.data) {
        envDefaults = res.data.envDefaults || {};
        if (res.data.sources) {
          ipcSources = res.data.sources;
        }
      }
    } else if (
      typeof window !== 'undefined' &&
      window.devPilot &&
      typeof window.devPilot.getWebhookConfig === 'function'
    ) {
      const webhookRes = await window.devPilot.getWebhookConfig();
      if (webhookRes && webhookRes.success && webhookRes.data) {
        const webhookUrl = (
          webhookRes.data.envDefaults?.webhookUrl ||
          webhookRes.data.webhookUrl ||
          (webhookRes.data as any).envWebhookUrl ||
          ''
        ).trim();
        const hasWebhookToken = Boolean(
          webhookRes.data.envDefaults?.hasToken ??
          (webhookRes.data as any).hasEnvToken ??
          Boolean(webhookRes.data.webhookToken)
        );
        envDefaults = {
          webhookUrl,
          hasWebhookToken,
        };
      }
    }
  } catch {
    // Graceful fallback for isolated test environments or IPC failure
  }

  const resolved = resolveAIConfig(envDefaults);

  // Inherit IPC sources for providers where user did not store explicit credentials
  if (ipcSources) {
    if (resolved.sources.webhook !== 'user' && ipcSources.webhook) {
      resolved.sources.webhook = ipcSources.webhook;
    }
    if (resolved.sources.ollama !== 'user' && ipcSources.ollama) {
      resolved.sources.ollama = ipcSources.ollama;
    }
    if (resolved.sources.openai !== 'user' && ipcSources.openai) {
      resolved.sources.openai = ipcSources.openai;
    }
    if (resolved.sources.gemini !== 'user' && ipcSources.gemini) {
      resolved.sources.gemini = ipcSources.gemini;
    }
    resolved.source = resolved.sources;
  }

  return resolved;
}

// ============================================================================
// Backward-Compatible Webhook Resolver Forwarders
// ============================================================================

export async function resolveEffectiveWebhookConfig(): Promise<ResolvedWebhookConfig> {
  const userUrl = getWebhookUrl();
  const userToken = getWebhookToken();

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
    // Graceful fallback
  }

  const effectiveUrl = userUrl || envWebhookUrl || '';
  const effectiveToken = userToken || envToken || undefined;

  let source: ConfigSource = 'none';
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

export const getEffectiveWebhookConfig = resolveEffectiveWebhookConfig;
