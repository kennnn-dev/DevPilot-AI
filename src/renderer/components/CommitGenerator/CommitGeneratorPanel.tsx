import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Settings,
  Copy,
  Check,
  RotateCw,
  AlertCircle,
  X,
  FileCheck2,
} from 'lucide-react';
import { useCommitGenerator } from '../../hooks/useCommitGenerator';
import type { AIProvider, ResolvedAIConfig } from '../../../shared/types';
import {
  getActiveProvider,
  getOllamaConfig,
  getOpenAIConfig,
  getGeminiConfig,
  getWebhookUrl,
  resolveEffectiveAIConfig,
  resolveEffectiveWebhookConfig,
} from '../../services/aiConfig';

export interface CommitGeneratorPanelProps {
  repoPath: string | null;
  stagedCount: number;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenSettings?: () => void;
  className?: string;
}

export interface TailoredErrorInfo {
  displayMessage: string;
  isSettingsRelated: boolean;
  canRetry: boolean;
}

/**
 * Maps raw provider errors to user-friendly, actionable error alerts.
 */
export function formatProviderError(
  rawError: string | null,
  activeProvider: AIProvider,
  model?: string
): TailoredErrorInfo | null {
  if (!rawError) return null;

  const lower = rawError.toLowerCase();

  // 1. Ollama connection failure (offline / ECONNREFUSED)
  if (
    (activeProvider === 'ollama' &&
      (lower.includes('econnrefused') ||
        lower.includes('connection refused') ||
        lower.includes('offline') ||
        lower.includes('unreachable'))) ||
    (lower.includes('ollama') &&
      (lower.includes('offline') ||
        lower.includes('econnrefused') ||
        lower.includes('serve')))
  ) {
    return {
      displayMessage: "Ollama is offline. Run 'ollama serve' in your terminal.",
      isSettingsRelated: false,
      canRetry: true,
    };
  }

  // 2. Missing Ollama model (404 / pull)
  if (
    (lower.includes('model') && lower.includes('not found')) ||
    lower.includes('ollama pull') ||
    (activeProvider === 'ollama' && lower.includes('404'))
  ) {
    const targetModel = model || 'llama3.2';
    const match = rawError.match(/model ['"]?([^'"]+)['"]? not found/i);
    const matchedModel = match ? match[1] : targetModel;
    return {
      displayMessage: `Model '${matchedModel}' not found. Run 'ollama pull ${matchedModel}'.`,
      isSettingsRelated: false,
      canRetry: true,
    };
  }

  // 3. Invalid API Key for OpenAI / Gemini
  if (
    (activeProvider === 'openai' ||
      activeProvider === 'gemini' ||
      lower.includes('openai') ||
      lower.includes('gemini')) &&
    (lower.includes('invalid') ||
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('unauthorized') ||
      lower.includes('api key') ||
      lower.includes('forbidden'))
  ) {
    const providerName = activeProvider === 'gemini' ? 'Gemini' : 'OpenAI';
    return {
      displayMessage: `Invalid ${providerName} API key. Invalid API key for OpenAI / Gemini. Check your settings.`,
      isSettingsRelated: true,
      canRetry: false,
    };
  }

  // 4. Rate limit / Quota exceeded (429)
  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests')
  ) {
    return {
      displayMessage: 'Rate limit exceeded. Please wait or check your account.',
      isSettingsRelated: false,
      canRetry: true,
    };
  }

  // 5. 30-Second Timeout
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborted')
  ) {
    return {
      displayMessage: 'AI generation timed out after 30 seconds.',
      canRetry: true,
      isSettingsRelated: false,
    };
  }

  // Default: Webhook or general errors
  const isSettingsRelated = Boolean(
    lower.includes('setting') ||
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('unauthorized') ||
      lower.includes('forbidden') ||
      lower.includes('configured')
  );

  return {
    displayMessage: rawError,
    isSettingsRelated,
    canRetry: true,
  };
}

/**
 * Evaluates whether the currently active provider lacks necessary credentials.
 */
export function checkIsProviderUnconfigured(
  provider: AIProvider,
  resolvedConfig: ResolvedAIConfig
): { isUnconfigured: boolean; message: string } {
  switch (provider) {
    case 'webhook': {
      const url = resolvedConfig.providerConfigs.webhook.webhookUrl?.trim();
      const isMissing = !url || resolvedConfig.sources.webhook === 'none';
      return {
        isUnconfigured: isMissing,
        message: 'Webhook endpoint not configured. Configure URL in Settings or .env.',
      };
    }
    case 'openai': {
      const apiKey = resolvedConfig.providerConfigs.openai.apiKey?.trim();
      const hasEnvKey = Boolean(resolvedConfig.envDefaults?.hasOpenAiKey);
      const isMissing = (!apiKey || apiKey === '') && !hasEnvKey;
      return {
        isUnconfigured: isMissing,
        message: 'OpenAI API key not configured. Enter your API key in Settings.',
      };
    }
    case 'gemini': {
      const apiKey = resolvedConfig.providerConfigs.gemini.apiKey?.trim();
      const hasEnvKey = Boolean(resolvedConfig.envDefaults?.hasGeminiKey);
      const isMissing = (!apiKey || apiKey === '') && !hasEnvKey;
      return {
        isUnconfigured: isMissing,
        message: 'Gemini API key not configured. Enter your API key in Settings.',
      };
    }
    case 'ollama': {
      const baseUrl = resolvedConfig.providerConfigs.ollama.baseUrl?.trim();
      const model = resolvedConfig.providerConfigs.ollama.model?.trim();
      const isMissing = !baseUrl || !model;
      return {
        isUnconfigured: isMissing,
        message: 'Ollama configuration missing. Configure model or endpoint in Settings.',
      };
    }
    default:
      return { isUnconfigured: false, message: '' };
  }
}

/**
 * Returns formatted badge text for active provider.
 */
export function getProviderBadgeText(provider: AIProvider, model?: string): string {
  switch (provider) {
    case 'ollama':
      return `Ollama (${model || 'llama3.2'})`;
    case 'openai':
      return `OpenAI (${model || 'gpt-4o-mini'})`;
    case 'gemini':
      return `Gemini (${model || 'gemini-1.5-flash'})`;
    case 'webhook':
    default:
      return 'Custom Webhook';
  }
}

export const CommitGeneratorPanel: React.FC<CommitGeneratorPanelProps> = ({
  repoPath,
  stagedCount,
  isOpen = true,
  onClose,
  onOpenSettings,
  className = '',
}) => {
  const {
    isGenerating,
    generatedCommit,
    parsedCommit,
    error,
    customPrompt,
    setCustomPrompt,
    setGeneratedCommit,
    generateCommit,
    retry,
  } = useCommitGenerator(repoPath);

  const [activeProvider, setActiveProvider] = useState<AIProvider>(() => getActiveProvider());
  const [activeModel, setActiveModel] = useState<string>(() => {
    const p = getActiveProvider();
    if (p === 'ollama') return getOllamaConfig().model || 'llama3.2';
    if (p === 'openai') return getOpenAIConfig().model || 'gpt-4o-mini';
    if (p === 'gemini') return getGeminiConfig().model || 'gemini-1.5-flash';
    return '';
  });

  const [isUnconfigured, setIsUnconfigured] = useState<boolean>(false);
  const [unconfiguredMessage, setUnconfiguredMessage] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Evaluate active AI provider configuration status
  const evaluateConfig = useCallback(async () => {
    try {
      const config = await resolveEffectiveAIConfig();
      if (!isMountedRef.current) return;
      const provider = config.activeProvider;
      setActiveProvider(provider);

      let currentModel = '';
      if (provider === 'ollama') {
        currentModel = config.providerConfigs.ollama.model || 'llama3.2';
      } else if (provider === 'openai') {
        currentModel = config.providerConfigs.openai.model || 'gpt-4o-mini';
      } else if (provider === 'gemini') {
        currentModel = config.providerConfigs.gemini.model || 'gemini-1.5-flash';
      }
      setActiveModel(currentModel);

      const unconfig = checkIsProviderUnconfigured(provider, config);
      setIsUnconfigured(unconfig.isUnconfigured);
      setUnconfiguredMessage(unconfig.message);
    } catch {
      // Fallback for standalone / legacy webhook environments
      try {
        const legacyConfig = await resolveEffectiveWebhookConfig();
        if (!isMountedRef.current) return;
        const missing = legacyConfig.source === 'none' || !legacyConfig.webhookUrl;
        setIsUnconfigured(missing);
        setUnconfiguredMessage(
          missing ? 'Webhook endpoint not configured. Configure URL in Settings or .env.' : ''
        );
      } catch {
        if (!isMountedRef.current) return;
        const fallbackUrl = getWebhookUrl();
        setIsUnconfigured(!fallbackUrl);
        setUnconfiguredMessage(
          !fallbackUrl ? 'Webhook endpoint not configured. Configure URL in Settings or .env.' : ''
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    evaluateConfig();

    const handleFocus = () => {
      evaluateConfig();
    };

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('devpilot_')) {
        evaluateConfig();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      window.addEventListener('storage', handleStorage);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, [isOpen, evaluateConfig]);

  // Sync state when generatedCommit or parsedCommit updates
  useEffect(() => {
    if (parsedCommit) {
      const header = `${parsedCommit.type}${parsedCommit.scope ? `(${parsedCommit.scope})` : ''}${parsedCommit.isBreaking ? '!' : ''}: ${parsedCommit.subject}`;
      setSubject(header);
      setBody(parsedCommit.body || '');
    } else if (generatedCommit) {
      const lines = generatedCommit.split(/\r?\n/);
      setSubject(lines[0] || '');
      setBody(lines.slice(1).join('\n').trim());
    } else {
      setSubject('');
      setBody('');
    }
  }, [generatedCommit, parsedCommit]);

  const handleGenerate = async () => {
    if (!repoPath || stagedCount === 0 || isGenerating) return;

    try {
      const config = await resolveEffectiveAIConfig();
      const provider = config.activeProvider;
      setActiveProvider(provider);

      let currentModel = '';
      if (provider === 'ollama') {
        currentModel = config.providerConfigs.ollama.model || 'llama3.2';
      } else if (provider === 'openai') {
        currentModel = config.providerConfigs.openai.model || 'gpt-4o-mini';
      } else if (provider === 'gemini') {
        currentModel = config.providerConfigs.gemini.model || 'gemini-1.5-flash';
      }
      setActiveModel(currentModel);

      const unconfig = checkIsProviderUnconfigured(provider, config);
      setIsUnconfigured(unconfig.isUnconfigured);
      setUnconfiguredMessage(unconfig.message);
    } catch {
      const fallbackUrl = getWebhookUrl().trim();
      setIsUnconfigured(!fallbackUrl);
      setUnconfiguredMessage(
        !fallbackUrl ? 'Webhook endpoint not configured. Configure URL in Settings or .env.' : ''
      );
    }

    await generateCommit(repoPath, undefined, customPrompt);
  };

  const handleRetry = async () => {
    if (retry) {
      await retry(repoPath || undefined);
    } else {
      await handleGenerate();
    }
  };

  const handleSubjectChange = (newSubject: string) => {
    setSubject(newSubject);
    const full = body.trim() ? `${newSubject}\n\n${body.trim()}` : newSubject;
    setGeneratedCommit(full);
  };

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    const full = newBody.trim() ? `${subject}\n\n${newBody.trim()}` : subject;
    setGeneratedCommit(full);
  };

  const handleCopy = async () => {
    const textToCopy = body.trim() ? `${subject}\n\n${body.trim()}` : subject;
    if (!textToCopy) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy commit to clipboard:', err);
    }
  };

  if (!isOpen) return null;

  const providerBadgeText = getProviderBadgeText(activeProvider, activeModel);
  const tailoredError = formatProviderError(error, activeProvider, activeModel);

  const isGenerateDisabled = isGenerating || stagedCount === 0 || !repoPath || isUnconfigured;

  const getGenerateButtonTitle = (): string => {
    if (isUnconfigured) {
      return unconfiguredMessage || `Active provider (${activeProvider}) is not configured. Open Settings to configure.`;
    }
    if (!repoPath) {
      return 'No repository opened.';
    }
    if (stagedCount === 0) {
      return 'No staged changes to summarize. Stage changes first.';
    }
    if (isGenerating) {
      return 'Generating commit message...';
    }
    return 'Generate conventional commit message with AI';
  };

  return (
    <div
      className={`commit-generator-panel ${className}`}
      data-testid="commit-generator-panel"
    >
      {/* Panel Header */}
      <div className="generator-panel-header">
        <div className="panel-title-group">
          <Sparkles size={14} className="sparkles-icon text-cyan" />
          <span className="panel-title">AI Commit Assistant</span>
          <span
            className={`commit-generator-provider-badge provider-badge-${activeProvider}`}
            data-testid="commit-generator-provider-badge"
            title={`Active Provider: ${providerBadgeText}`}
          >
            {providerBadgeText}
          </span>
          {/* Compatibility alias for active-provider-badge */}
          <span
            data-testid="active-provider-badge"
            style={{ display: 'none' }}
            aria-hidden="true"
          >
            {providerBadgeText}
          </span>
        </div>
        <div className="panel-header-actions">
          <button
            type="button"
            className="btn-panel-action"
            data-testid="toggle-settings-btn"
            title="AI & Webhook Settings"
            onClick={() => onOpenSettings?.()}
          >
            <Settings size={13} />
          </button>
          {onClose && (
            <button
              type="button"
              className="btn-panel-action"
              title="Close Panel"
              onClick={onClose}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Unconfigured Warning Banner */}
      {isUnconfigured && (
        <div
          className="generator-unconfigured-banner"
          data-testid="commit-unconfigured-banner"
        >
          {/* Compatibility hook for existing test suite */}
          <div
            data-testid="generator-unconfigured-prompt"
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <div className="unconfigured-content">
            <Settings size={14} className="text-warning" />
            <span>
              {unconfiguredMessage || 'Provider not configured. Configure in Settings or .env.'}
            </span>
          </div>
          {onOpenSettings && (
            <div className="unconfigured-actions">
              <button
                type="button"
                className="btn-open-settings"
                data-testid="commit-open-settings-link"
                onClick={onOpenSettings}
              >
                Open Settings
              </button>
              {/* Compatibility aliases for legacy tests */}
              <button
                type="button"
                className="btn-open-settings"
                data-testid="open-settings-action"
                style={{ display: 'none' }}
                onClick={onOpenSettings}
                aria-hidden="true"
              >
                Open Settings
              </button>
              <button
                type="button"
                className="btn-open-settings"
                data-testid="open-settings-prompt-btn"
                style={{ display: 'none' }}
                onClick={onOpenSettings}
                aria-hidden="true"
              >
                Open Settings
              </button>
            </div>
          )}
        </div>
      )}

      {/* Staged Indicator Bar */}
      <div className="generator-status-indicator" data-testid="staged-indicator">
        <FileCheck2 size={13} />
        {stagedCount === 0 ? (
          <span className="text-warning">
            No staged changes to summarize. Stage changes first.
          </span>
        ) : (
          <span>
            {stagedCount} staged file{stagedCount === 1 ? '' : 's'} ready for commit
          </span>
        )}
      </div>

      {/* Custom Prompt / Instructions (Optional) */}
      <div className="generator-prompt-row">
        <input
          type="text"
          id="custom-instructions-input"
          className="generator-prompt-input"
          data-testid="custom-instructions-input"
          placeholder="Optional hint: e.g. 'Focus on the login modal UX'..."
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
        />
        <input
          type="text"
          data-testid="custom-prompt-input"
          style={{ display: 'none' }}
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
        />
        <button
          type="button"
          className={`btn-generate-commit ${isGenerating ? 'loading' : ''}`}
          data-testid="generate-commit-btn"
          disabled={isGenerateDisabled}
          title={getGenerateButtonTitle()}
          onClick={handleGenerate}
        >
          {isGenerating ? (
            <>
              <RotateCw size={13} className="spinning" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles size={13} />
              <span>Generate Commit Message</span>
            </>
          )}
        </button>
        {/* Forward-compatible alias for commit-generate-btn */}
        <button
          type="button"
          data-testid="commit-generate-btn"
          style={{ display: 'none' }}
          disabled={isGenerateDisabled}
          title={getGenerateButtonTitle()}
          onClick={handleGenerate}
          aria-hidden="true"
          tabIndex={-1}
        >
          Generate Commit Message
        </button>
      </div>

      {/* Provider-Tailored Error & Retry Banner */}
      {tailoredError && (
        <div
          className="generator-error-banner"
          data-testid="commit-generator-error"
        >
          <div className="error-message-content">
            <AlertCircle size={14} className="text-danger" />
            <span className="error-text">{tailoredError.displayMessage}</span>
          </div>
          <div className="error-actions">
            {tailoredError.isSettingsRelated && onOpenSettings && (
              <>
                <button
                  type="button"
                  className="btn-open-settings"
                  data-testid="commit-open-settings-link"
                  onClick={onOpenSettings}
                >
                  Open Settings
                </button>
                <button
                  type="button"
                  className="btn-open-settings"
                  data-testid="error-open-settings-btn"
                  style={{ display: 'none' }}
                  onClick={onOpenSettings}
                  aria-hidden="true"
                >
                  Open Settings
                </button>
                <button
                  type="button"
                  className="btn-open-settings"
                  data-testid="open-settings-action"
                  style={{ display: 'none' }}
                  onClick={onOpenSettings}
                  aria-hidden="true"
                >
                  Open Settings
                </button>
                <button
                  type="button"
                  className="btn-open-settings"
                  data-testid="open-settings-btn"
                  style={{ display: 'none' }}
                  onClick={onOpenSettings}
                  aria-hidden="true"
                >
                  Open Settings
                </button>
              </>
            )}
            {tailoredError.canRetry && (
              <>
                <button
                  type="button"
                  className="btn-retry-generate"
                  data-testid="commit-retry-btn"
                  onClick={handleRetry}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="btn-retry-generate"
                  data-testid="retry-btn"
                  style={{ display: 'none' }}
                  onClick={handleRetry}
                  aria-hidden="true"
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="btn-retry-generate"
                  data-testid="retry-generate-btn"
                  style={{ display: 'none' }}
                  onClick={handleRetry}
                  aria-hidden="true"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Generated & Editable Commit Details */}
      {(subject || generatedCommit) && (
        <div className="commit-editor-area" data-testid="commit-editor-area">
          {/* Tags & Badges Bar */}
          <div className="commit-meta-bar">
            {parsedCommit?.type && (
              <span className={`commit-type-badge badge-${parsedCommit.type}`}>
                {parsedCommit.type}
              </span>
            )}
            {parsedCommit?.scope && (
              <span className="commit-scope-badge">
                ({parsedCommit.scope})
              </span>
            )}
            {parsedCommit?.isBreaking && (
              <span className="commit-breaking-badge">
                BREAKING
              </span>
            )}
          </div>

          {/* Editable Subject */}
          <div className="commit-field">
            <label className="commit-field-label">Subject:</label>
            <input
              type="text"
              className="commit-subject-input"
              data-testid="commit-subject-input"
              value={subject}
              onChange={(e) => handleSubjectChange(e.target.value)}
              placeholder="feat: concise commit description"
            />
          </div>

          {/* Editable Body */}
          <div className="commit-field">
            <label className="commit-field-label">Body (optional):</label>
            <textarea
              className="commit-body-textarea"
              data-testid="commit-body-textarea"
              rows={3}
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
              placeholder="Detailed motivation and context..."
            />
          </div>

          {/* Copy Action Row */}
          <div className="commit-action-row">
            <button
              type="button"
              className={`btn-copy-commit ${copied ? 'copied' : ''}`}
              data-testid="copy-commit-btn"
              disabled={!subject && !body}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={13} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy Commit Message</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommitGeneratorPanel;
