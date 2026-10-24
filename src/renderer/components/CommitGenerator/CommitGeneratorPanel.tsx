import React, { useState, useEffect } from 'react';
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
  setWebhookUrl,
  getWebhookToken,
  setWebhookToken,
  validateWebhookUrl,
} from '../../services/webhookConfig';

export interface CommitGeneratorPanelProps {
  repoPath: string | null;
  stagedCount: number;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export const CommitGeneratorPanel: React.FC<CommitGeneratorPanelProps> = ({
  repoPath,
  stagedCount,
  isOpen = true,
  onClose,
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

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [webhookUrl, setLocalWebhookUrl] = useState<string>(() => getWebhookUrl());
  const [webhookToken, setLocalWebhookToken] = useState<string>(() => getWebhookToken());
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<boolean>(false);

  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

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

  const handleSaveSettings = () => {
    const val = validateWebhookUrl(webhookUrl);
    if (!val.isValid) {
      setSettingsError(val.error || 'Invalid URL');
      return;
    }
    setSettingsError(null);
    setWebhookUrl(webhookUrl);
    setWebhookToken(webhookToken);
    setSettingsSuccess(true);
    setTimeout(() => setSettingsSuccess(false), 2000);
  };

  const handleGenerate = async () => {
    if (!repoPath || stagedCount === 0 || isGenerating) return;
    const url = getWebhookUrl();
    if (!url) {
      setShowSettings(true);
      setSettingsError('Please configure an n8n Webhook URL first.');
      return;
    }
    await generateCommit(repoPath, url, customPrompt);
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
            className={`btn-panel-action ${showSettings ? 'active' : ''}`}
            data-testid="toggle-settings-btn"
            title="Webhook Settings"
            onClick={() => setShowSettings((prev) => !prev)}
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

      {/* Settings Panel Drawer */}
      {showSettings && (
        <div className="generator-settings-drawer" data-testid="generator-settings">
          <div className="settings-field-group">
            <label className="settings-label" htmlFor="webhook-url-input">
              n8n Webhook URL:
            </label>
            <div className="settings-input-row">
              <input
                id="webhook-url-input"
                type="url"
                className="settings-input"
                data-testid="webhook-url-input"
                placeholder="https://n8n.example.com/webhook/..."
                value={webhookUrl}
                onChange={(e) => setLocalWebhookUrl(e.target.value)}
              />
              <button
                type="button"
                className="btn-save-settings"
                data-testid="save-webhook-btn"
                onClick={handleSaveSettings}
              >
                Save
              </button>
            </div>
            <div style={{ marginTop: '8px' }}>
              <label className="settings-label" htmlFor="webhook-token-input">
                Header Auth Token (Optional):
              </label>
              <input
                id="webhook-token-input"
                type="password"
                className="settings-input"
                data-testid="webhook-token-input"
                placeholder="Token/API Key (if required by n8n webhook)"
                value={webhookToken}
                onChange={(e) => setLocalWebhookToken(e.target.value)}
              />
            </div>
            {settingsError && (
              <span className="settings-error-text">{settingsError}</span>
            )}
            {settingsSuccess && (
              <span className="settings-success-text">Saved!</span>
            )}
          </div>
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
          className="generator-prompt-input"
          data-testid="custom-prompt-input"
          placeholder="Optional hint: e.g. 'Focus on the login modal UX'..."
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
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
          <button
            type="button"
            className="btn-retry-generate"
            data-testid="retry-generate-btn"
            onClick={handleGenerate}
          >
            Retry
          </button>
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
