/**
 * useCommitGenerator Hook for DevPilot AI.
 * Handles multi-provider dynamic routing, active provider configuration resolution,
 * actionable error categorization, retry state preservation, and conventional commit parsing.
 *
 * Conforms to Milestone M11: Features F50, F51, F52, F53.
 */

import { useState, useCallback, useEffect } from 'react';
import type {
  AIProvider,
  GenerateCommitOptions,
  ParsedConventionalCommit,
  ResolvedAIConfig,
} from '../../shared/types';
import { parseConventionalCommit } from '../services/conventionalCommitParser';
import {
  getActiveProvider,
  resolveEffectiveAIConfig,
  resolveAIConfig,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_GEMINI_CONFIG,
} from '../services/aiConfig';

// ============================================================================
// Type Definitions
// ============================================================================

export type AIErrorCategory = 'offline' | 'auth' | 'quota' | 'timeout' | 'generic';

export interface CategorizedError {
  category: AIErrorCategory;
  suggestion: string;
  isSettingsRelated: boolean;
  canRetry: boolean;
}

export interface RepoCommitState {
  isGenerating: boolean;
  generatedCommit: string | null;
  parsedCommit: ParsedConventionalCommit | null;
  error: string | null;
  errorCategory: AIErrorCategory | null;
  actionableSuggestion: string | null;
  customPrompt: string;
  lastFailedOptions: GenerateCommitOptions | null;
}

export interface UseCommitGeneratorReturn {
  // Commit state (per-repo)
  isGenerating: boolean;
  generatedCommit: string | null;
  parsedCommit: ParsedConventionalCommit | null;
  error: string | null;
  errorCategory: AIErrorCategory | null;
  actionableSuggestion: string | null;
  customPrompt: string;
  lastFailedOptions: GenerateCommitOptions | null;

  // Active provider state (global across application)
  activeProvider: AIProvider;
  activeModel: string;
  isConfigured: boolean;
  unconfiguredReason: string | null;
  resolvedConfig: ResolvedAIConfig | null;

  // Provider display helpers
  providerDisplayName: string;
  providerBadgeLabel: string;

  // Action methods
  setCustomPrompt: (prompt: string) => void;
  setGeneratedCommit: (msg: string) => void;
  generateCommit: (
    repoPath?: string,
    overrideOptionsOrWebhookUrl?: string | Partial<GenerateCommitOptions>,
    prompt?: string
  ) => Promise<boolean>;
  retry: (repo?: string) => Promise<boolean>;
  clearCommit: (repo?: string) => void;
  resetError: (repo?: string) => void;
  refreshConfig: () => Promise<ResolvedAIConfig>;

  // Multi-repository states dictionary
  repoStates: Record<string, RepoCommitState>;
}

// ============================================================================
// Default Constants
// ============================================================================

const defaultRepoState: RepoCommitState = {
  isGenerating: false,
  generatedCommit: null,
  parsedCommit: null,
  error: null,
  errorCategory: null,
  actionableSuggestion: null,
  customPrompt: '',
  lastFailedOptions: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns human-readable display name for an AI provider.
 */
export function getProviderDisplayName(provider: AIProvider): string {
  switch (provider) {
    case 'ollama':
      return 'Local Ollama';
    case 'openai':
      return 'OpenAI';
    case 'gemini':
      return 'Google Gemini';
    case 'webhook':
      return 'Custom Webhook';
    default:
      return provider;
  }
}

/**
 * Formats provider and model into standard badge label (e.g., 'Ollama (llama3.2)', 'Custom Webhook').
 */
export function getProviderBadgeLabel(provider: AIProvider, model?: string): string {
  const trimmedModel = (model || '').trim();
  switch (provider) {
    case 'ollama':
      return `Ollama (${trimmedModel || DEFAULT_OLLAMA_CONFIG.model})`;
    case 'openai':
      return `OpenAI (${trimmedModel || DEFAULT_OPENAI_CONFIG.model})`;
    case 'gemini':
      return `Gemini (${trimmedModel || DEFAULT_GEMINI_CONFIG.model})`;
    case 'webhook':
    default:
      return 'Custom Webhook';
  }
}

/**
 * Checks whether an AI provider has valid required credentials/configuration.
 */
export function isProviderConfigured(
  provider: AIProvider,
  config: ResolvedAIConfig
): { isConfigured: boolean; reason?: string } {
  switch (provider) {
    case 'webhook': {
      const url = (config.providerConfigs.webhook.webhookUrl || '').trim();
      const isValid = Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
      return {
        isConfigured: isValid,
        reason: isValid ? undefined : 'Webhook endpoint not configured. Configure URL in Settings or .env.',
      };
    }
    case 'ollama': {
      const baseUrl = (config.providerConfigs.ollama.baseUrl || '').trim();
      const model = (config.providerConfigs.ollama.model || '').trim();
      const isValid = Boolean(baseUrl && model);
      return {
        isConfigured: isValid,
        reason: isValid ? undefined : 'Ollama base URL and model name are required.',
      };
    }
    case 'openai': {
      const userKey = (config.providerConfigs.openai.apiKey || '').trim();
      const hasEnvKey = Boolean(config.envDefaults?.hasOpenAiKey);
      const isClean = Boolean(cleanCredential(userKey));
      const isValid = isClean || hasEnvKey || (userKey.includes('••••') && config.sources?.openai === 'env');
      return {
        isConfigured: isValid,
        reason: isValid ? undefined : 'OpenAI API key is not configured. Configure API key in Settings or .env.',
      };
    }
    case 'gemini': {
      const userKey = (config.providerConfigs.gemini.apiKey || '').trim();
      const hasEnvKey = Boolean(config.envDefaults?.hasGeminiKey);
      const isClean = Boolean(cleanCredential(userKey));
      const isValid = isClean || hasEnvKey || (userKey.includes('••••') && config.sources?.gemini === 'env');
      return {
        isConfigured: isValid,
        reason: isValid ? undefined : 'Google Gemini API key is not configured. Configure API key in Settings or .env.',
      };
    }
    default:
      return { isConfigured: false, reason: `Unknown AI provider: ${String(provider)}` };
  }
}

/**
 * Categorizes an error message into actionable categories and provides recovery guidance.
 */
export function categorizeAIError(errorMessage: string | null | undefined): CategorizedError {
  if (!errorMessage) {
    return {
      category: 'generic',
      suggestion: '',
      isSettingsRelated: false,
      canRetry: false,
    };
  }

  const lower = errorMessage.toLowerCase();

  // 1. Offline / Network / Connection Refused / DNS
  if (
    lower.includes('offline') ||
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('enotfound') ||
    lower.includes('host not found') ||
    lower.includes('ollama serve') ||
    lower.includes('unreachable')
  ) {
    return {
      category: 'offline',
      suggestion: lower.includes('ollama')
        ? "Ensure the Ollama daemon is running ('ollama serve') and accessible."
        : 'Verify the server is running and accessible at the configured URL.',
      isSettingsRelated: false,
      canRetry: true,
    };
  }

  // 2. Timeout
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborted')
  ) {
    return {
      category: 'timeout',
      suggestion: 'The request timed out after 30 seconds. Check network connectivity and retry.',
      isSettingsRelated: false,
      canRetry: true,
    };
  }

  // 3. Auth / Unauthorized / Forbidden / Missing API Key
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('api key') ||
    lower.includes('token') ||
    lower.includes('not configured') ||
    lower.includes('access denied') ||
    lower.includes('invalid key')
  ) {
    return {
      category: 'auth',
      suggestion: 'Verify your API key, endpoint URL, or authentication token in Settings.',
      isSettingsRelated: true,
      canRetry: true,
    };
  }

  // 4. Quota / Rate limit
  if (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('exceeded') ||
    lower.includes('billing')
  ) {
    return {
      category: 'quota',
      suggestion: 'Rate limit or quota exceeded. Please wait a moment or review your account billing limits.',
      isSettingsRelated: false,
      canRetry: true,
    };
  }

  // 5. Generic / Other (Model not found, empty diff, etc.)
  let suggestion = 'Check repository status and staged changes, then try again.';
  let isSettings = false;

  if (lower.includes('model') && (lower.includes('not found') || lower.includes('pull'))) {
    suggestion = lower.includes('ollama')
      ? "Run 'ollama pull <model>' in your terminal to download the requested model."
      : 'Verify that the specified model exists and your account has access in Settings.';
    isSettings = !lower.includes('ollama');
  } else if (lower.includes('staged') || lower.includes('no staged changes')) {
    suggestion = 'Stage changes before generating a commit message.';
  } else if (lower.includes('setting')) {
    isSettings = true;
    suggestion = 'Please check your provider configuration in Settings.';
  }

  return {
    category: 'generic',
    suggestion,
    isSettingsRelated: isSettings,
    canRetry: true,
  };
}

/**
 * Strips environment masked placeholder tokens ('••••••••') to allow main process .env fallback.
 */
function cleanCredential(val?: string): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes('••••')) return undefined;
  return trimmed;
}

// ============================================================================
// Main Hook Implementation
// ============================================================================

export function useCommitGenerator(activeRepoPath: string | null): UseCommitGeneratorReturn {
  const [repoStates, setRepoStates] = useState<Record<string, RepoCommitState>>({});

  // Active provider tracking
  const [activeProvider, setActiveProvider] = useState<AIProvider>(() => getActiveProvider());
  const [activeModel, setActiveModel] = useState<string>(() => {
    const provider = getActiveProvider();
    if (provider === 'ollama') return DEFAULT_OLLAMA_CONFIG.model;
    if (provider === 'openai') return DEFAULT_OPENAI_CONFIG.model;
    if (provider === 'gemini') return DEFAULT_GEMINI_CONFIG.model;
    return '';
  });
  const [isConfigured, setIsConfigured] = useState<boolean>(true);
  const [unconfiguredReason, setUnconfiguredReason] = useState<string | null>(null);
  const [resolvedConfig, setResolvedConfig] = useState<ResolvedAIConfig | null>(null);

  const currentState = (activeRepoPath && repoStates[activeRepoPath]) || defaultRepoState;

  const updateState = useCallback(
    (
      repo: string,
      updater: Partial<RepoCommitState> | ((prev: RepoCommitState) => Partial<RepoCommitState>)
    ) => {
      setRepoStates((prev) => {
        const existing = prev[repo] || defaultRepoState;
        const updates = typeof updater === 'function' ? updater(existing) : updater;
        return {
          ...prev,
          [repo]: { ...existing, ...updates },
        };
      });
    },
    []
  );

  /**
   * Refreshes AI configuration and updates provider state, models, and configuration checks.
   */
  const refreshConfig = useCallback(async (): Promise<ResolvedAIConfig> => {
    try {
      const config = await resolveEffectiveAIConfig();
      setResolvedConfig(config);
      setActiveProvider(config.activeProvider);

      let model = '';
      if (config.activeProvider === 'ollama') {
        model = config.providerConfigs.ollama.model;
      } else if (config.activeProvider === 'openai') {
        model = config.providerConfigs.openai.model;
      } else if (config.activeProvider === 'gemini') {
        model = config.providerConfigs.gemini.model;
      }
      setActiveModel(model);

      const check = isProviderConfigured(config.activeProvider, config);
      setIsConfigured(check.isConfigured);
      setUnconfiguredReason(check.reason || null);

      return config;
    } catch {
      const provider = getActiveProvider();
      setActiveProvider(provider);
      const localResolved = resolveAIConfig();
      setResolvedConfig(localResolved);

      let model = '';
      if (provider === 'ollama') model = DEFAULT_OLLAMA_CONFIG.model;
      if (provider === 'openai') model = DEFAULT_OPENAI_CONFIG.model;
      if (provider === 'gemini') model = DEFAULT_GEMINI_CONFIG.model;
      setActiveModel(model);

      const check = isProviderConfigured(provider, localResolved);
      setIsConfigured(check.isConfigured);
      setUnconfiguredReason(check.reason || null);

      return localResolved;
    }
  }, []);

  // Listen to window focus and storage updates to re-sync configuration dynamically
  useEffect(() => {
    let isMounted = true;
    refreshConfig().catch(() => {});

    const onWindowFocus = () => {
      if (isMounted) {
        refreshConfig().catch(() => {});
      }
    };

    const onStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('devpilot_') && isMounted) {
        refreshConfig().catch(() => {});
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onWindowFocus);
      window.addEventListener('storage', onStorageChange);
    }

    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWindowFocus);
        window.removeEventListener('storage', onStorageChange);
      }
    };
  }, [refreshConfig]);

  const setCustomPrompt = useCallback(
    (prompt: string) => {
      if (!activeRepoPath) return;
      updateState(activeRepoPath, { customPrompt: prompt });
    },
    [activeRepoPath, updateState]
  );

  const setGeneratedCommit = useCallback(
    (msg: string) => {
      if (!activeRepoPath) return;
      const parsed = parseConventionalCommit(msg);
      updateState(activeRepoPath, { generatedCommit: msg, parsedCommit: parsed });
    },
    [activeRepoPath, updateState]
  );

  const clearCommit = useCallback(
    (repo?: string) => {
      const target = repo || activeRepoPath;
      if (!target) return;
      updateState(target, {
        generatedCommit: null,
        parsedCommit: null,
        error: null,
        errorCategory: null,
        actionableSuggestion: null,
        lastFailedOptions: null,
      });
    },
    [activeRepoPath, updateState]
  );

  const resetError = useCallback(
    (repo?: string) => {
      const target = repo || activeRepoPath;
      if (!target) return;
      updateState(target, {
        error: null,
        errorCategory: null,
        actionableSuggestion: null,
      });
    },
    [activeRepoPath, updateState]
  );

  /**
   * Generates Conventional Commit message with dynamic multi-provider routing.
   * Supports both modern GenerateCommitOptions and legacy (repoPath, webhookUrl, prompt) signature.
   */
  const generateCommit = useCallback(
    async (
      repoPathInput?: string,
      overrideOptionsOrWebhookUrl?: string | Partial<GenerateCommitOptions>,
      promptInput?: string
    ): Promise<boolean> => {
      const targetRepo = (repoPathInput || activeRepoPath || '').trim();
      if (!targetRepo) return false;

      const targetPrompt =
        promptInput !== undefined
          ? promptInput
          : typeof overrideOptionsOrWebhookUrl === 'object' && overrideOptionsOrWebhookUrl?.customPrompt !== undefined
          ? overrideOptionsOrWebhookUrl.customPrompt
          : currentState.customPrompt;

      updateState(targetRepo, {
        isGenerating: true,
        error: null,
        errorCategory: null,
        actionableSuggestion: null,
      });

      if (
        typeof window === 'undefined' ||
        !window.devPilot ||
        typeof window.devPilot.generateCommitMessage !== 'function'
      ) {
        const errorMsg = 'DevPilot API generateCommitMessage bridge is not available.';
        const errorMeta = categorizeAIError(errorMsg);
        updateState(targetRepo, {
          isGenerating: false,
          error: errorMsg,
          errorCategory: errorMeta.category,
          actionableSuggestion: errorMeta.suggestion,
        });
        return false;
      }

      try {
        // Handle legacy M8 adapter if 2nd argument is explicitly a string webhook URL
        if (typeof overrideOptionsOrWebhookUrl === 'string') {
          const legacyUrl = overrideOptionsOrWebhookUrl.trim();
          const legacyPayload: GenerateCommitOptions = {
            repoPath: targetRepo,
          };
          if (legacyUrl) {
            legacyPayload.webhookUrl = legacyUrl;
          }
          const trimmedPrompt = (targetPrompt !== undefined ? targetPrompt : currentState.customPrompt)?.trim();
          if (trimmedPrompt) {
            legacyPayload.customPrompt = trimmedPrompt;
          }

          const res = await window.devPilot.generateCommitMessage(legacyPayload);
          if (res.success && res.data) {
            updateState(targetRepo, {
              isGenerating: false,
              generatedCommit: res.data.commitMessage,
              parsedCommit: res.data.parsed,
              error: null,
              errorCategory: null,
              actionableSuggestion: null,
              lastFailedOptions: null,
            });
            return true;
          } else {
            const rawError = res.error || 'Failed to generate commit message.';
            const errorMeta = categorizeAIError(rawError);
            updateState(targetRepo, {
              isGenerating: false,
              error: rawError,
              errorCategory: errorMeta.category,
              actionableSuggestion: errorMeta.suggestion,
              lastFailedOptions: legacyPayload,
            });
            return false;
          }
        }

        // 1. Resolve current effective AI configuration
        const effectiveConfig = await resolveEffectiveAIConfig().catch(() => resolveAIConfig());
        setResolvedConfig(effectiveConfig);

        const currentActiveProvider =
          typeof overrideOptionsOrWebhookUrl === 'object' && overrideOptionsOrWebhookUrl?.provider
            ? overrideOptionsOrWebhookUrl.provider
            : effectiveConfig.activeProvider;

        setActiveProvider(currentActiveProvider);

        // Update active model
        let currentModel = '';
        if (currentActiveProvider === 'ollama') {
          currentModel = effectiveConfig.providerConfigs.ollama.model;
        } else if (currentActiveProvider === 'openai') {
          currentModel = effectiveConfig.providerConfigs.openai.model;
        } else if (currentActiveProvider === 'gemini') {
          currentModel = effectiveConfig.providerConfigs.gemini.model;
        }
        setActiveModel(currentModel);

        // Check if provider is configured
        const check = isProviderConfigured(currentActiveProvider, effectiveConfig);
        setIsConfigured(check.isConfigured);
        setUnconfiguredReason(check.reason || null);

        // 2. Build unified GenerateCommitOptions matching specification
        const payload: GenerateCommitOptions = {
          repoPath: targetRepo,
          provider: currentActiveProvider,
          customPrompt: targetPrompt?.trim() || undefined,
          // Provider-specific credentials from resolved configuration:
          webhookUrl: effectiveConfig.providerConfigs.webhook.webhookUrl || undefined,
          webhookToken: cleanCredential(effectiveConfig.providerConfigs.webhook.webhookToken),
          ollamaBaseUrl: effectiveConfig.providerConfigs.ollama.baseUrl || undefined,
          ollamaModel: effectiveConfig.providerConfigs.ollama.model || undefined,
          openaiApiKey: cleanCredential(effectiveConfig.providerConfigs.openai.apiKey),
          openaiModel: effectiveConfig.providerConfigs.openai.model || undefined,
          geminiApiKey: cleanCredential(effectiveConfig.providerConfigs.gemini.apiKey),
          geminiModel: effectiveConfig.providerConfigs.gemini.model || undefined,
        };

        // Merge any explicit option overrides passed by caller
        if (typeof overrideOptionsOrWebhookUrl === 'object' && overrideOptionsOrWebhookUrl !== null) {
          Object.assign(payload, overrideOptionsOrWebhookUrl);
        }

        if (!payload.customPrompt) {
          delete payload.customPrompt;
        }

        // 3. Dispatch to main process via window.devPilot.generateCommitMessage
        const res = await window.devPilot.generateCommitMessage(payload);

        if (res.success && res.data) {
          updateState(targetRepo, {
            isGenerating: false,
            generatedCommit: res.data.commitMessage,
            parsedCommit: res.data.parsed,
            error: null,
            errorCategory: null,
            actionableSuggestion: null,
            lastFailedOptions: null,
          });
          return true;
        } else {
          const rawError = res.error || 'Failed to generate commit message.';
          const errorMeta = categorizeAIError(rawError);
          updateState(targetRepo, {
            isGenerating: false,
            error: rawError,
            errorCategory: errorMeta.category,
            actionableSuggestion: errorMeta.suggestion,
            lastFailedOptions: payload,
          });
          return false;
        }
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        const errorMeta = categorizeAIError(rawMsg);
        updateState(targetRepo, {
          isGenerating: false,
          error: rawMsg,
          errorCategory: errorMeta.category,
          actionableSuggestion: errorMeta.suggestion,
          lastFailedOptions: {
            repoPath: targetRepo,
            customPrompt: targetPrompt,
          },
        });
        return false;
      }
    },
    [activeRepoPath, currentState.customPrompt, updateState]
  );

  /**
   * Immediately re-dispatches the last failed commit generation without requiring user re-entry.
   * Re-resolves settings to pick up updated credentials from SettingsModal if changed.
   */
  const retry = useCallback(
    async (targetRepo?: string): Promise<boolean> => {
      const repo = targetRepo || activeRepoPath;
      if (!repo) return false;
      const state = repoStates[repo] || defaultRepoState;

      if (state.lastFailedOptions) {
        return generateCommit(repo, state.lastFailedOptions, state.lastFailedOptions.customPrompt);
      }
      return generateCommit(repo, undefined, state.customPrompt);
    },
    [activeRepoPath, repoStates, generateCommit]
  );

  return {
    isGenerating: currentState.isGenerating,
    generatedCommit: currentState.generatedCommit,
    parsedCommit: currentState.parsedCommit,
    error: currentState.error,
    errorCategory: currentState.errorCategory,
    actionableSuggestion: currentState.actionableSuggestion,
    customPrompt: currentState.customPrompt,
    lastFailedOptions: currentState.lastFailedOptions,

    activeProvider,
    activeModel,
    isConfigured,
    unconfiguredReason,
    resolvedConfig,

    providerDisplayName: getProviderDisplayName(activeProvider),
    providerBadgeLabel: getProviderBadgeLabel(activeProvider, activeModel),

    setCustomPrompt,
    setGeneratedCommit,
    generateCommit,
    retry,
    clearCommit,
    resetError,
    refreshConfig,

    repoStates,
  };
}

export default useCommitGenerator;
