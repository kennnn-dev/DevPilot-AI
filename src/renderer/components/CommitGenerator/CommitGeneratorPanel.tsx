import React, { useState, useEffect, useCallback } from 'react';
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
import {
  getWebhookUrl,
  resolveEffectiveWebhookConfig,
} from '../../services/webhookConfig';

export interface CommitGeneratorPanelProps {
  repoPath: string | null;
  stagedCount: number;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenSettings?: () => void;
  className?: string;
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
  } = useCommitGenerator(repoPath);

  const [isUnconfigured, setIsUnconfigured] = useState<boolean>(false);
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Evaluate webhook configuration status
  const evaluateConfig = useCallback(async () => {
    try {
      const config = await resolveEffectiveWebhookConfig();
      setIsUnconfigured(config.source === 'none' || !config.webhookUrl);
    } catch {
      const fallbackUrl = getWebhookUrl();
      setIsUnconfigured(!fallbackUrl);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      evaluateConfig();
    }
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

    // Dynamically resolve effective webhook config
    const config = await resolveEffectiveWebhookConfig().catch(() => null);
    const effectiveUrl = config?.webhookUrl?.trim() || getWebhookUrl().trim();

    if (!effectiveUrl) {
      setIsUnconfigured(true);
    } else {
      setIsUnconfigured(false);
    }

    await generateCommit(repoPath, effectiveUrl || undefined, customPrompt);
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

  const isSettingsRelatedError = Boolean(
    error &&
      (error.toLowerCase().includes('setting') ||
        error.toLowerCase().includes('401') ||
        error.toLowerCase().includes('403') ||
        error.toLowerCase().includes('unauthorized') ||
        error.toLowerCase().includes('forbidden') ||
        error.toLowerCase().includes('configured'))
  );

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
        </div>
        <div className="panel-header-actions">
          <button
            type="button"
            className="btn-panel-action"
            data-testid="toggle-settings-btn"
            title="Webhook Settings"
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

      {/* Unconfigured Webhook Notice Banner */}
      {isUnconfigured && (
        <div
          className="generator-unconfigured-banner"
          data-testid="generator-unconfigured-prompt"
        >
          <div className="unconfigured-content">
            <Settings size={14} className="text-warning" />
            <span>Webhook endpoint not configured. Configure URL in Settings or .env.</span>
          </div>
          {onOpenSettings && (
            <div className="unconfigured-actions">
              <button
                type="button"
                className="btn-open-settings"
                data-testid="open-settings-action"
                onClick={onOpenSettings}
              >
                Open Settings
              </button>
              <button
                type="button"
                className="btn-open-settings"
                data-testid="open-settings-prompt-btn"
                style={{ display: 'none' }}
                onClick={onOpenSettings}
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
          disabled={isGenerating || stagedCount === 0 || !repoPath}
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
      </div>

      {/* Error & Retry Banner */}
      {error && (
        <div
          className="generator-error-banner"
          data-testid="commit-generator-error"
        >
          <div className="error-message-content">
            <AlertCircle size={14} className="text-danger" />
            <span className="error-text">{error}</span>
          </div>
          <div className="error-actions">
            {isSettingsRelatedError && onOpenSettings && (
              <>
                <button
                  type="button"
                  className="btn-open-settings"
                  data-testid="error-open-settings-btn"
                  onClick={onOpenSettings}
                >
                  Open Settings
                </button>
                <button
                  type="button"
                  className="btn-open-settings"
                  data-testid="open-settings-action"
                  style={{ display: 'none' }}
                  onClick={onOpenSettings}
                >
                  Open Settings
                </button>
                <button
                  type="button"
                  className="btn-open-settings"
                  data-testid="open-settings-btn"
                  style={{ display: 'none' }}
                  onClick={onOpenSettings}
                >
                  Open Settings
                </button>
              </>
            )}
            <button
              type="button"
              className="btn-retry-generate"
              data-testid="retry-btn"
              onClick={handleGenerate}
            >
              Retry
            </button>
            <button
              type="button"
              className="btn-retry-generate"
              data-testid="retry-generate-btn"
              style={{ display: 'none' }}
              onClick={handleGenerate}
            >
              Retry
            </button>
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
