import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  X,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Server,
  Key,
  Cpu,
  Bot,
} from 'lucide-react';
import {
  getActiveProvider,
  setActiveProvider,
  getWebhookUrl,
  getWebhookToken,
  setWebhookUrl,
  setWebhookToken,
  clearWebhookConfig,
  validateWebhookUrl,
  resolveEffectiveWebhookConfig,
  getOllamaConfig,
  setOllamaConfig,
  resetOllamaConfig,
  getOpenAIConfig,
  setOpenAIConfig,
  resetOpenAIConfig,
  getGeminiConfig,
  setGeminiConfig,
  resetGeminiConfig,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
  STORAGE_KEY_ACTIVE_PROVIDER,
  STORAGE_KEY_OLLAMA_BASE_URL,
  STORAGE_KEY_OLLAMA_MODEL,
  STORAGE_KEY_OPENAI_API_KEY,
  STORAGE_KEY_OPENAI_MODEL,
  STORAGE_KEY_GEMINI_API_KEY,
  STORAGE_KEY_GEMINI_MODEL,
} from '../../services/aiConfig';
import type { AIProvider, ConfigSource, ResolvedAIConfig } from '../../../shared/types';

// Re-export storage keys and default constants for consumers and tests
export {
  STORAGE_KEY_ACTIVE_PROVIDER,
  STORAGE_KEY_OLLAMA_BASE_URL,
  STORAGE_KEY_OLLAMA_MODEL,
  STORAGE_KEY_OPENAI_API_KEY,
  STORAGE_KEY_OPENAI_MODEL,
  STORAGE_KEY_GEMINI_API_KEY,
  STORAGE_KEY_GEMINI_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
};

// Storage helper getters and setters
export const getStoredActiveProvider = getActiveProvider;
export const setStoredActiveProvider = setActiveProvider;

export const getStoredOllamaConfig = getOllamaConfig;
export function setStoredOllamaConfig(baseUrl: string, model: string): void {
  setOllamaConfig({ baseUrl, model });
}
export const clearStoredOllamaConfig = resetOllamaConfig;

export const getStoredOpenAIConfig = getOpenAIConfig;
export function setStoredOpenAIConfig(apiKey: string, model: string): void {
  setOpenAIConfig({ apiKey, model });
}
export const clearStoredOpenAIConfig = resetOpenAIConfig;

export const getStoredGeminiConfig = getGeminiConfig;
export function setStoredGeminiConfig(apiKey: string, model: string): void {
  setGeminiConfig({ apiKey, model });
}
export const clearStoredGeminiConfig = resetGeminiConfig;

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional initial env defaults for testing or preloaded context */
  initialEnvDefaults?: {
    webhookUrl?: string;
    hasToken?: boolean;
    activeProvider?: AIProvider;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
    hasOpenAiKey?: boolean;
    openAiModel?: string;
    hasGeminiKey?: boolean;
    geminiModel?: string;
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialEnvDefaults,
}) => {
  // Active provider selector state (defaults to 'webhook' for clean backward compatibility)
  const [activeProvider, setActiveProviderState] = useState<AIProvider>('webhook');

  // Webhook fields
  const [webhookUrl, setWebhookUrlState] = useState('');
  const [webhookToken, setWebhookTokenState] = useState('');
  const [showWebhookToken, setShowWebhookToken] = useState(false);

  // Ollama fields
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL);
  const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);

  // OpenAI fields
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(DEFAULT_OPENAI_MODEL);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);

  // Gemini fields
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // Sources tracking per provider
  const [sources, setSources] = useState<Record<AIProvider, ConfigSource>>({
    webhook: 'none',
    ollama: 'none',
    openai: 'none',
    gemini: 'none',
  });

  // Environment defaults tracking
  const [envDefaults, setEnvDefaults] = useState<{
    webhookUrl: string;
    hasWebhookToken: boolean;
    ollamaBaseUrl: string;
    ollamaModel: string;
    hasOpenAiKey: boolean;
    openAiModel: string;
    hasGeminiKey: boolean;
    geminiModel: string;
  }>({
    webhookUrl: '',
    hasWebhookToken: false,
    ollamaBaseUrl: '',
    ollamaModel: '',
    hasOpenAiKey: false,
    openAiModel: '',
    hasGeminiKey: false,
    geminiModel: '',
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Initialize and populate values whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Initial synchronous read from localStorage to avoid input flicker
    const storedProvider = getActiveProvider();
    const effectiveInitialProvider = initialEnvDefaults?.activeProvider || storedProvider;
    setActiveProviderState(effectiveInitialProvider);

    const initialWebhookUrl = getWebhookUrl();
    const initialWebhookToken = getWebhookToken();
    setWebhookUrlState(initialWebhookUrl);
    setWebhookTokenState(initialWebhookToken);

    const initialOllama = getOllamaConfig();
    setOllamaBaseUrl(initialOllama.baseUrl);
    setOllamaModel(initialOllama.model);

    const initialOpenAI = getOpenAIConfig();
    setOpenaiApiKey(initialOpenAI.apiKey);
    setOpenaiModel(initialOpenAI.model);

    const initialGemini = getGeminiConfig();
    setGeminiApiKey(initialGemini.apiKey);
    setGeminiModel(initialGemini.model);

    // Initial source heuristics
    setSources({
      webhook: initialWebhookUrl ? 'user' : 'none',
      ollama:
        localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL) ||
        localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL)
          ? 'user'
          : 'none',
      openai: initialOpenAI.apiKey ? 'user' : 'none',
      gemini: initialGemini.apiKey ? 'user' : 'none',
    });

    if (initialEnvDefaults) {
      setEnvDefaults({
        webhookUrl: initialEnvDefaults.webhookUrl || '',
        hasWebhookToken: Boolean(initialEnvDefaults.hasToken),
        ollamaBaseUrl: initialEnvDefaults.ollamaBaseUrl || '',
        ollamaModel: initialEnvDefaults.ollamaModel || '',
        hasOpenAiKey: Boolean(initialEnvDefaults.hasOpenAiKey),
        openAiModel: initialEnvDefaults.openAiModel || '',
        hasGeminiKey: Boolean(initialEnvDefaults.hasGeminiKey),
        geminiModel: initialEnvDefaults.geminiModel || '',
      });

      setSources((prev) => ({
        ...prev,
        webhook: !initialWebhookUrl && initialEnvDefaults.webhookUrl ? 'env' : prev.webhook,
        openai: !initialOpenAI.apiKey && initialEnvDefaults.hasOpenAiKey ? 'env' : prev.openai,
        gemini: !initialGemini.apiKey && initialEnvDefaults.hasGeminiKey ? 'env' : prev.gemini,
      }));
    }

    // Query main process for resolved AI config (with graceful fallback to legacy getWebhookConfig)
    const resolveConfigs = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          window.devPilot &&
          typeof window.devPilot.getAIConfig === 'function'
        ) {
          const aiRes = await window.devPilot.getAIConfig();
          if (isMounted && aiRes && aiRes.success && aiRes.data) {
            const data: ResolvedAIConfig = aiRes.data;
            setEnvDefaults({
              webhookUrl: data.envDefaults?.webhookUrl || '',
              hasWebhookToken: Boolean(data.envDefaults?.hasWebhookToken),
              ollamaBaseUrl: data.envDefaults?.ollamaBaseUrl || '',
              ollamaModel: data.envDefaults?.ollamaModel || '',
              hasOpenAiKey: Boolean(data.envDefaults?.hasOpenAiKey),
              openAiModel: data.envDefaults?.openAiModel || '',
              hasGeminiKey: Boolean(data.envDefaults?.hasGeminiKey),
              geminiModel: data.envDefaults?.geminiModel || '',
            });

            setSources({
              webhook: getWebhookUrl() ? 'user' : data.sources?.webhook || 'none',
              ollama:
                localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL) ||
                localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL)
                  ? 'user'
                  : data.sources?.ollama || 'none',
              openai: getOpenAIConfig().apiKey ? 'user' : data.sources?.openai || 'none',
              gemini: getGeminiConfig().apiKey ? 'user' : data.sources?.gemini || 'none',
            });
            return;
          }
        }
      } catch {
        // Fallback to legacy getWebhookConfig
      }

      // Fallback: resolve webhook config
      try {
        const resolved = await resolveEffectiveWebhookConfig();
        if (isMounted) {
          setEnvDefaults((prev) => ({
            ...prev,
            webhookUrl: resolved.envDefaults.webhookUrl,
            hasWebhookToken: resolved.envDefaults.hasToken,
          }));
          setSources((prev) => ({
            ...prev,
            webhook: getWebhookUrl() ? 'user' : resolved.source,
          }));
        }
      } catch (err) {
        console.warn('Failed to resolve settings config:', err);
      }
    };

    resolveConfigs();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialEnvDefaults]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // AutoFocus on primary input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (activeProvider === 'webhook') {
          urlInputRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeProvider]);

  // Focus trap inside modal
  const handleKeyDownTrap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;

    const container = modalContainerRef.current;
    if (!container) return;

    const focusable = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleProviderChange = (newProvider: AIProvider) => {
    setActiveProviderState(newProvider);
    setActiveProvider(newProvider);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Save active provider selection
    setActiveProvider(activeProvider);

    if (activeProvider === 'webhook') {
      const trimmedUrl = webhookUrl.trim();
      const trimmedToken = webhookToken.trim();

      const validation = validateWebhookUrl(trimmedUrl);
      if (!validation.isValid) {
        setErrorMessage(validation.error || 'Please enter a valid HTTP or HTTPS webhook URL.');
        return;
      }

      try {
        setWebhookUrl(trimmedUrl);
        setWebhookToken(trimmedToken);
        setSources((prev) => ({ ...prev, webhook: 'user' }));
        setSuccessMessage('Settings saved successfully.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
        setErrorMessage(msg);
      }
    } else if (activeProvider === 'ollama') {
      const trimmedUrl = ollamaBaseUrl.trim() || DEFAULT_OLLAMA_BASE_URL;
      const trimmedModel = ollamaModel.trim() || DEFAULT_OLLAMA_MODEL;

      if (trimmedUrl) {
        try {
          const parsed = new URL(trimmedUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            setErrorMessage('Ollama Base URL must use HTTP or HTTPS protocol.');
            return;
          }
        } catch {
          setErrorMessage('Invalid URL format for Ollama Base URL.');
          return;
        }
      }

      try {
        setOllamaConfig({ baseUrl: trimmedUrl, model: trimmedModel });
        setOllamaBaseUrl(trimmedUrl);
        setOllamaModel(trimmedModel);
        setSources((prev) => ({ ...prev, ollama: 'user' }));
        setSuccessMessage('Settings saved successfully.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
        setErrorMessage(msg);
      }
    } else if (activeProvider === 'openai') {
      const trimmedKey = openaiApiKey.trim();
      const trimmedModel = openaiModel.trim() || DEFAULT_OPENAI_MODEL;

      if (!trimmedKey && !envDefaults.hasOpenAiKey) {
        setErrorMessage('OpenAI API key is required.');
        return;
      }

      try {
        setOpenAIConfig({ apiKey: trimmedKey, model: trimmedModel });
        setOpenaiApiKey(trimmedKey);
        setOpenaiModel(trimmedModel);
        setSources((prev) => ({
          ...prev,
          openai: trimmedKey ? 'user' : envDefaults.hasOpenAiKey ? 'env' : 'none',
        }));
        setSuccessMessage('Settings saved successfully.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
        setErrorMessage(msg);
      }
    } else if (activeProvider === 'gemini') {
      const trimmedKey = geminiApiKey.trim();
      const trimmedModel = geminiModel.trim() || DEFAULT_GEMINI_MODEL;

      if (!trimmedKey && !envDefaults.hasGeminiKey) {
        setErrorMessage('Gemini API key is required.');
        return;
      }

      try {
        setGeminiConfig({ apiKey: trimmedKey, model: trimmedModel });
        setGeminiApiKey(trimmedKey);
        setGeminiModel(trimmedModel);
        setSources((prev) => ({
          ...prev,
          gemini: trimmedKey ? 'user' : envDefaults.hasGeminiKey ? 'env' : 'none',
        }));
        setSuccessMessage('Settings saved successfully.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
        setErrorMessage(msg);
      }
    }
  };

  const handleReset = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (activeProvider === 'webhook') {
        clearWebhookConfig();
        setWebhookUrlState('');
        setWebhookTokenState('');
        const resolved = await resolveEffectiveWebhookConfig();
        setSources((prev) => ({ ...prev, webhook: resolved.source }));
        setEnvDefaults((prev) => ({
          ...prev,
          webhookUrl: resolved.envDefaults.webhookUrl,
          hasWebhookToken: resolved.envDefaults.hasToken,
        }));

        if (resolved.source === 'env') {
          setSuccessMessage('Settings reset to .env fallback defaults.');
        } else {
          setSuccessMessage('Configuration cleared.');
        }
      } else if (activeProvider === 'ollama') {
        resetOllamaConfig();
        setOllamaBaseUrl(envDefaults.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL);
        setOllamaModel(envDefaults.ollamaModel || DEFAULT_OLLAMA_MODEL);
        setSources((prev) => ({
          ...prev,
          ollama:
            (envDefaults.ollamaBaseUrl && envDefaults.ollamaBaseUrl !== DEFAULT_OLLAMA_BASE_URL) ||
            (envDefaults.ollamaModel && envDefaults.ollamaModel !== DEFAULT_OLLAMA_MODEL)
              ? 'env'
              : 'none',
        }));
        setSuccessMessage('Settings reset to defaults.');
      } else if (activeProvider === 'openai') {
        resetOpenAIConfig();
        setOpenaiApiKey('');
        setOpenaiModel(envDefaults.openAiModel || DEFAULT_OPENAI_MODEL);
        setSources((prev) => ({
          ...prev,
          openai: envDefaults.hasOpenAiKey ? 'env' : 'none',
        }));
        setSuccessMessage('Settings reset to defaults.');
      } else if (activeProvider === 'gemini') {
        resetGeminiConfig();
        setGeminiApiKey('');
        setGeminiModel(envDefaults.geminiModel || DEFAULT_GEMINI_MODEL);
        setSources((prev) => ({
          ...prev,
          gemini: envDefaults.hasGeminiKey ? 'env' : 'none',
        }));
        setSuccessMessage('Settings reset to defaults.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset configuration.';
      setErrorMessage(msg);
    }
  };

  if (!isOpen) {
    return null;
  }

  // Derive dynamic source classification for active provider
  const getCurrentSource = (): ConfigSource => {
    switch (activeProvider) {
      case 'webhook': {
        const url = getWebhookUrl();
        if (url) return 'user';
        if (envDefaults.webhookUrl) return 'env';
        return sources.webhook;
      }
      case 'ollama': {
        const hasStored =
          Boolean(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)) ||
          Boolean(localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL));
        if (hasStored) return 'user';
        const hasEnv = Boolean(
          (envDefaults.ollamaBaseUrl && envDefaults.ollamaBaseUrl !== DEFAULT_OLLAMA_BASE_URL) ||
          (envDefaults.ollamaModel && envDefaults.ollamaModel !== DEFAULT_OLLAMA_MODEL)
        );
        if (hasEnv || sources.ollama === 'env') return 'env';
        return sources.ollama || 'none';
      }
      case 'openai': {
        const storedKey = getOpenAIConfig().apiKey;
        if (storedKey) return 'user';
        if (envDefaults.hasOpenAiKey || sources.openai === 'env') return 'env';
        return 'none';
      }
      case 'gemini': {
        const storedKey = getGeminiConfig().apiKey;
        if (storedKey) return 'user';
        if (envDefaults.hasGeminiKey || sources.gemini === 'env') return 'env';
        return 'none';
      }
      default:
        return 'none';
    }
  };

  const currentSource = getCurrentSource();

  const getSourceBadgeText = (src: ConfigSource) => {
    switch (src) {
      case 'user':
        return 'User Settings';
      case 'env':
        return '.env Fallback';
      case 'none':
      default:
        return 'Unconfigured';
    }
  };

  return (
    <div
      className="settings-modal-backdrop"
      data-testid="settings-modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDownTrap}
    >
      <div
        className="settings-modal-dialog"
        data-testid="settings-modal"
        ref={modalContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="settings-modal-header">
          <div className="settings-header-left">
            <div className="settings-header-icon">
              <Settings size={18} />
            </div>
            <div className="settings-title-group">
              <h2 id="settings-modal-title" className="settings-modal-title">
                AI Provider Settings
              </h2>
              <span className="settings-modal-subtitle">
                Configure commit generation models and credentials
              </span>
            </div>
          </div>
          <button
            type="button"
            className="settings-header-close-btn"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        {/* Modal Body */}
        <form className="settings-modal-body" onSubmit={handleSave}>
          {/* Provider Selector Dropdown */}
          <div className="settings-form-group settings-provider-group">
            <label htmlFor="settings-provider-select" className="settings-field-label">
              <span>AI Provider</span>
              <span className="settings-field-required">Active Backend</span>
            </label>
            <div className="settings-input-wrapper">
              <Bot size={14} className="settings-input-icon" />
              <select
                id="settings-provider-select"
                className="settings-input settings-select with-icon"
                data-testid="settings-provider-select"
                value={activeProvider}
                onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
              >
                <option value="webhook">Custom Webhook</option>
                <option value="ollama">Local Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <span className="settings-field-hint">
              Select AI model backend for generating Conventional Commits.
            </span>
          </div>

          {/* Configuration Source Indicator */}
          <div className="settings-source-container">
            <span className="settings-source-label">Active Source</span>
            <span
              className={`settings-source-badge source-${currentSource}`}
              data-testid="settings-source-badge"
            >
              {getSourceBadgeText(currentSource)}
            </span>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div
              className="settings-alert settings-alert-error"
              data-testid="settings-error-alert"
              role="alert"
            >
              <AlertCircle size={15} className="settings-alert-icon" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              className="settings-alert settings-alert-success"
              data-testid="settings-success-alert"
              role="status"
            >
              <CheckCircle2 size={15} className="settings-alert-icon" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* 1. Webhook Fieldset */}
          {activeProvider === 'webhook' && (
            <>
              <div className="settings-form-group">
                <label htmlFor="settings-webhook-url-input" className="settings-field-label">
                  <span>AI Webhook URL</span>
                  <span className="settings-field-required">* Required</span>
                </label>
                <div className="settings-input-wrapper">
                  <Server size={14} className="settings-input-icon" />
                  <input
                    id="settings-webhook-url-input"
                    ref={urlInputRef}
                    type="url"
                    className="settings-input with-icon"
                    data-testid="settings-webhook-url-input"
                    placeholder={envDefaults.webhookUrl || 'https://api.example.com/webhook/...'}
                    value={webhookUrl}
                    onChange={(e) => {
                      setWebhookUrlState(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                </div>
                {envDefaults.webhookUrl && (
                  <span className="settings-field-hint" data-testid="settings-env-fallback-preview">
                    .env fallback: <code>{envDefaults.webhookUrl}</code>
                  </span>
                )}
              </div>

              <div className="settings-form-group">
                <label htmlFor="settings-webhook-token-input" className="settings-field-label">
                  <span>API / Bearer Token</span>
                  <span className="settings-field-optional">Optional</span>
                </label>
                <div className="settings-input-wrapper">
                  <Key size={14} className="settings-input-icon" />
                  <input
                    id="settings-webhook-token-input"
                    type={showWebhookToken ? 'text' : 'password'}
                    className="settings-input with-icon settings-input-password"
                    data-testid="settings-webhook-token-input"
                    placeholder="Bearer token or API key"
                    value={webhookToken}
                    onChange={(e) => {
                      setWebhookTokenState(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                  <button
                    type="button"
                    className="settings-password-toggle"
                    data-testid="settings-webhook-token-toggle"
                    onClick={() => setShowWebhookToken(!showWebhookToken)}
                    title={showWebhookToken ? 'Hide token' : 'Show token'}
                  >
                    {showWebhookToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="settings-field-hint">
                  Used for <code>Authorization: Bearer &lt;token&gt;</code> or{' '}
                  <code>X-API-KEY</code> header dispatch.
                </span>
              </div>
            </>
          )}

          {/* 2. Ollama Fieldset */}
          {activeProvider === 'ollama' && (
            <>
              <div className="settings-form-group">
                <label htmlFor="settings-ollama-url-input" className="settings-field-label">
                  <span>Ollama Base URL</span>
                  <span className="settings-field-optional">Default: {DEFAULT_OLLAMA_BASE_URL}</span>
                </label>
                <div className="settings-input-wrapper">
                  <Server size={14} className="settings-input-icon" />
                  <input
                    id="settings-ollama-url-input"
                    type="url"
                    className="settings-input with-icon"
                    data-testid="settings-ollama-url-input"
                    placeholder={envDefaults.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL}
                    value={ollamaBaseUrl}
                    onChange={(e) => {
                      setOllamaBaseUrl(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                </div>
                <span className="settings-field-hint">
                  Local offline REST API endpoint for the Ollama daemon.
                </span>
              </div>

              <div className="settings-form-group">
                <label htmlFor="settings-ollama-model-input" className="settings-field-label">
                  <span>Model Name</span>
                  <span className="settings-field-optional">Default: {DEFAULT_OLLAMA_MODEL}</span>
                </label>
                <div className="settings-input-wrapper">
                  <Cpu size={14} className="settings-input-icon" />
                  <input
                    id="settings-ollama-model-input"
                    type="text"
                    className="settings-input with-icon"
                    data-testid="settings-ollama-model-input"
                    placeholder={envDefaults.ollamaModel || DEFAULT_OLLAMA_MODEL}
                    value={ollamaModel}
                    onChange={(e) => {
                      setOllamaModel(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                </div>
                <div className="settings-model-presets">
                  <span className="settings-preset-label">Presets:</span>
                  {['llama3.2', 'codellama', 'mistral', 'qwen2.5-coder'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`settings-preset-chip ${ollamaModel === m ? 'active' : ''}`}
                      onClick={() => setOllamaModel(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 3. OpenAI Fieldset */}
          {activeProvider === 'openai' && (
            <>
              <div className="settings-form-group">
                <label htmlFor="settings-openai-key-input" className="settings-field-label">
                  <span>OpenAI API Key</span>
                  <span className="settings-field-required">* Required</span>
                </label>
                <div className="settings-input-wrapper">
                  <Key size={14} className="settings-input-icon" />
                  <input
                    id="settings-openai-key-input"
                    type={showOpenAiKey ? 'text' : 'password'}
                    className="settings-input with-icon settings-input-password"
                    data-testid="settings-openai-key-input"
                    placeholder={envDefaults.hasOpenAiKey ? '•••••••••••••••• (from .env)' : 'sk-...'}
                    value={openaiApiKey}
                    onChange={(e) => {
                      setOpenaiApiKey(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                  <button
                    type="button"
                    className="settings-password-toggle"
                    data-testid="settings-openai-key-toggle"
                    onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                    title={showOpenAiKey ? 'Hide key' : 'Show key'}
                  >
                    {showOpenAiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="settings-field-hint">
                  Dispatched securely from Electron Main process with Bearer auth.
                </span>
              </div>

              <div className="settings-form-group">
                <label htmlFor="settings-openai-model-input" className="settings-field-label">
                  <span>Model Name</span>
                  <span className="settings-field-optional">Default: {DEFAULT_OPENAI_MODEL}</span>
                </label>
                <div className="settings-input-wrapper">
                  <Cpu size={14} className="settings-input-icon" />
                  <input
                    id="settings-openai-model-input"
                    type="text"
                    className="settings-input with-icon"
                    data-testid="settings-openai-model-input"
                    placeholder={envDefaults.openAiModel || DEFAULT_OPENAI_MODEL}
                    value={openaiModel}
                    onChange={(e) => {
                      setOpenaiModel(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                </div>
                <div className="settings-model-presets">
                  <span className="settings-preset-label">Presets:</span>
                  {['gpt-4o-mini', 'gpt-4o', 'o1-mini'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`settings-preset-chip ${openaiModel === m ? 'active' : ''}`}
                      onClick={() => setOpenaiModel(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 4. Google Gemini Fieldset */}
          {activeProvider === 'gemini' && (
            <>
              <div className="settings-form-group">
                <label htmlFor="settings-gemini-key-input" className="settings-field-label">
                  <span>Gemini API Key</span>
                  <span className="settings-field-required">* Required</span>
                </label>
                <div className="settings-input-wrapper">
                  <Key size={14} className="settings-input-icon" />
                  <input
                    id="settings-gemini-key-input"
                    type={showGeminiKey ? 'text' : 'password'}
                    className="settings-input with-icon settings-input-password"
                    data-testid="settings-gemini-key-input"
                    placeholder={envDefaults.hasGeminiKey ? '•••••••••••••••• (from .env)' : 'AIza...'}
                    value={geminiApiKey}
                    onChange={(e) => {
                      setGeminiApiKey(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                  <button
                    type="button"
                    className="settings-password-toggle"
                    data-testid="settings-gemini-key-toggle"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                  >
                    {showGeminiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="settings-field-hint">
                  Dispatched securely via <code>x-goog-api-key</code> header in Main process.
                </span>
              </div>

              <div className="settings-form-group">
                <label htmlFor="settings-gemini-model-input" className="settings-field-label">
                  <span>Model Name</span>
                  <span className="settings-field-optional">Default: {DEFAULT_GEMINI_MODEL}</span>
                </label>
                <div className="settings-input-wrapper">
                  <Cpu size={14} className="settings-input-icon" />
                  <input
                    id="settings-gemini-model-input"
                    type="text"
                    className="settings-input with-icon"
                    data-testid="settings-gemini-model-input"
                    placeholder={envDefaults.geminiModel || DEFAULT_GEMINI_MODEL}
                    value={geminiModel}
                    onChange={(e) => {
                      setGeminiModel(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (successMessage) setSuccessMessage(null);
                    }}
                  />
                </div>
                <div className="settings-model-presets">
                  <span className="settings-preset-label">Presets:</span>
                  {['gemini-1.5-flash', 'gemini-1.5-pro'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`settings-preset-chip ${geminiModel === m ? 'active' : ''}`}
                      onClick={() => setGeminiModel(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Hidden submit trigger for Enter key support */}
          <button type="submit" className="sr-only" tabIndex={-1}>
            Submit
          </button>
        </form>

        {/* Action Buttons Footer */}
        <footer className="settings-modal-footer">
          <div className="settings-footer-left">
            <button
              type="button"
              className="btn-settings-reset"
              data-testid="settings-reset-btn"
              onClick={handleReset}
              title="Clear active provider configuration and revert to environment defaults"
            >
              <RotateCcw size={13} />
              <span>Reset to Defaults</span>
            </button>
          </div>

          <div className="settings-footer-right">
            <button
              type="button"
              className="btn-settings-close"
              data-testid="settings-close-btn"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="btn-settings-save"
              data-testid="settings-save-btn"
              onClick={() => handleSave()}
            >
              <Save size={13} />
              <span>Save Changes</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SettingsModal;
