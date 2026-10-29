import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  X,
  Copy,
  Check,
  RotateCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldAlert,
  Send,
  HelpCircle,
} from 'lucide-react';
import type {
  ReviewAudienceMode,
  WorkspaceReviewResult,
  ImpactSeverity,
  SiblingRepoImpact,
} from '../../../shared/types';

export interface WorkspaceReviewModalProps {
  isOpen: boolean;
  activeRepoPath: string | null;
  workspaceRepoPaths: string[];
  reviewResult: WorkspaceReviewResult | null;
  loading: boolean;
  error: string | null;
  mode: ReviewAudienceMode;
  customPrompt: string;
  onClose: () => void;
  onSetMode: (mode: ReviewAudienceMode) => void;
  onSetCustomPrompt: (prompt: string) => void;
  onRunReview: (targetMode?: ReviewAudienceMode) => Promise<void>;
  onClearReview: () => void;
}

export const WorkspaceReviewModal: React.FC<WorkspaceReviewModalProps> = ({
  isOpen,
  activeRepoPath,
  workspaceRepoPaths,
  reviewResult,
  loading,
  error,
  mode,
  customPrompt,
  onClose,
  onSetMode,
  onSetCustomPrompt,
  onRunReview,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Automatically trigger review when modal opens for the first time if no result exists
  useEffect(() => {
    if (isOpen && !reviewResult && !loading && !error && activeRepoPath) {
      void onRunReview();
    }
  }, [isOpen, reviewResult, loading, error, activeRepoPath, onRunReview]);

  // Trap Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const activeRepoBasename = activeRepoPath ? activeRepoPath.split(/[/\\]/).filter(Boolean).pop() : 'Repository';
  const siblingCount = (workspaceRepoPaths || []).filter(
    (p) => p && activeRepoPath && p.trim() !== activeRepoPath.trim()
  ).length;

  const handleCopyMarkdown = useCallback(async () => {
    if (!reviewResult) return;

    const lines: string[] = [];
    lines.push(`# 🔍 Workspace Review & Impact Analysis`);
    lines.push(`**Repository**: ${reviewResult.activeRepoName || activeRepoBasename}`);
    lines.push(`**Audience Mode**: ${reviewResult.mode === 'plain' ? 'Plain English (Non-Dev Mindset)' : 'Technical Details'}`);
    lines.push(`**Overall Workspace Impact**: ${reviewResult.overallImpactStatus.toUpperCase()}`);
    lines.push('');
    lines.push(`### 💬 What Changed (In Simple Words)`);
    lines.push(reviewResult.plainEnglishSummary);
    lines.push('');
    lines.push(`### 🎯 Why It Matters`);
    lines.push(reviewResult.whyItMatters);
    lines.push('');

    if (reviewResult.technicalDetails) {
      lines.push(`### 🛠️ Technical Details`);
      lines.push(reviewResult.technicalDetails);
      lines.push('');
    }

    lines.push(`### 🌐 Cross-Repository Impact (${reviewResult.crossRepoImpacts.length} Sibling Repositories)`);
    if (reviewResult.crossRepoImpacts.length === 0) {
      lines.push('*(No other repositories in this workspace)*');
    } else {
      for (const sib of reviewResult.crossRepoImpacts) {
        const icon = sib.status === 'breaking_risk' ? '🔴' : sib.status === 'potential_impact' ? '🟡' : '🟢';
        lines.push(`- ${icon} **${sib.repoName}** (${sib.status}): ${sib.summary}`);
        if (sib.affectedSymbolsOrEndpoints && sib.affectedSymbolsOrEndpoints.length > 0) {
          lines.push(`  - Touchpoints: \`${sib.affectedSymbolsOrEndpoints.join('`, `')}\``);
        }
      }
    }
    lines.push('');

    lines.push(`### 🧪 Suggested Verification Steps`);
    for (const step of reviewResult.suggestedVerification) {
      lines.push(`- [ ] ${step}`);
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  }, [reviewResult, activeRepoBasename]);

  const handleModeChange = useCallback(
    (newMode: ReviewAudienceMode) => {
      onSetMode(newMode);
      void onRunReview(newMode);
    },
    [onSetMode, onRunReview]
  );

  const renderStatusBadge = (status: ImpactSeverity) => {
    switch (status) {
      case 'breaking_risk':
        return (
          <span className="review-badge badge-breaking" data-testid="status-badge-breaking">
            <ShieldAlert size={12} />
            <span>Breaking Risk</span>
          </span>
        );
      case 'potential_impact':
        return (
          <span className="review-badge badge-warning" data-testid="status-badge-warning">
            <AlertTriangle size={12} />
            <span>Potential Impact</span>
          </span>
        );
      case 'safe':
      default:
        return (
          <span className="review-badge badge-safe" data-testid="status-badge-safe">
            <CheckCircle2 size={12} />
            <span>Isolated / Safe</span>
          </span>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="settings-modal-backdrop"
      data-testid="workspace-review-backdrop"
      onClick={onClose}
    >
      <div
        className="settings-modal-dialog workspace-review-modal"
        data-testid="workspace-review-modal"
        ref={modalContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="settings-modal-header review-modal-header">
          <div className="settings-header-left">
            <div className="settings-header-icon review-header-icon">
              <Sparkles size={18} />
            </div>
            <div className="settings-title-group">
              <h2 id="workspace-review-title" className="settings-modal-title">
                Workspace Review & Impact Analysis
              </h2>
              <span className="settings-modal-subtitle">
                Explains changes in plain language & detects ripple effects on {siblingCount} sibling repo(s)
              </span>
            </div>
          </div>
          <button
            type="button"
            className="settings-header-close-btn"
            data-testid="close-review-modal-btn"
            aria-label="Close workspace review"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        {/* Modal Body */}
        <div className="workspace-review-body">
          {/* Audience Mode Switcher Bar */}
          <div className="review-mode-selector-bar">
            <div className="review-mode-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'plain'}
                className={`review-mode-tab ${mode === 'plain' ? 'active' : ''}`}
                data-testid="audience-toggle-plain"
                onClick={() => handleModeChange('plain')}
              >
                <span className="tab-icon">🧑‍💼</span>
                <span className="tab-label">Plain English (Non-Dev Mindset)</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'technical'}
                className={`review-mode-tab ${mode === 'technical' ? 'active' : ''}`}
                data-testid="audience-toggle-technical"
                onClick={() => handleModeChange('technical')}
              >
                <span className="tab-icon">👨‍💻</span>
                <span className="tab-label">Technical Details</span>
              </button>
            </div>

            {reviewResult && (
              <div className="review-overall-status">
                <span className="status-label">Overall Impact:</span>
                {renderStatusBadge(reviewResult.overallImpactStatus)}
              </div>
            )}
          </div>

          {/* Error Alert */}
          {error && (
            <div
              className="settings-alert settings-alert-error review-alert"
              data-testid="workspace-review-error"
              role="alert"
            >
              <AlertCircle size={15} className="settings-alert-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="review-loading-container" data-testid="workspace-review-loading">
              <RotateCw size={24} className="review-spin-icon" />
              <p className="loading-title">
                {mode === 'plain'
                  ? 'Translating changes into plain English & checking workspace sibling repos...'
                  : 'Analyzing architecture & scanning cross-repository touchpoints...'}
              </p>
              <p className="loading-subtitle">
                Inspecting active changes and checking {siblingCount} sibling project(s) in this workspace.
              </p>
            </div>
          )}

          {/* Results Display */}
          {!loading && reviewResult && (
            <div className="review-content-scroll" data-testid="workspace-review-content">
              {/* Card 1: What Changed */}
              <div className="review-card" data-testid="workspace-review-summary">
                <div className="review-card-header">
                  <span className="card-badge-icon">💬</span>
                  <h3 className="review-card-title">
                    {mode === 'plain' ? 'What Changed in Plain English' : 'Change Architecture Summary'}
                  </h3>
                </div>
                <p className="review-card-text">{reviewResult.plainEnglishSummary}</p>
              </div>

              {/* Card 2: Why It Matters */}
              <div className="review-card" data-testid="workspace-review-why-matters">
                <div className="review-card-header">
                  <span className="card-badge-icon">🎯</span>
                  <h3 className="review-card-title">
                    {mode === 'plain' ? 'Why It Matters (User & Business Value)' : 'Operational & System Impact'}
                  </h3>
                </div>
                <p className="review-card-text">{reviewResult.whyItMatters}</p>
              </div>

              {/* Technical Details (if technical mode) */}
              {mode === 'technical' && reviewResult.technicalDetails && (
                <div className="review-card" data-testid="workspace-review-technical-details">
                  <div className="review-card-header">
                    <span className="card-badge-icon">🛠️</span>
                    <h3 className="review-card-title">Technical Deep Dive</h3>
                  </div>
                  <pre className="review-technical-box">{reviewResult.technicalDetails}</pre>
                </div>
              )}

              {/* Card 3: Cross-Repository Impact Matrix */}
              <div className="review-card" data-testid="workspace-review-cross-repo">
                <div className="review-card-header">
                  <span className="card-badge-icon">🌐</span>
                  <div className="card-title-group">
                    <h3 className="review-card-title">Cross-Repository Workspace Impact</h3>
                    <span className="card-title-sub">
                      Checking how changes in <strong>{reviewResult.activeRepoName || activeRepoBasename}</strong> affect sibling projects
                    </span>
                  </div>
                </div>

                {reviewResult.crossRepoImpacts.length === 0 ? (
                  <div className="review-isolated-notice">
                    <CheckCircle2 size={16} className="text-emerald" />
                    <span>
                      <strong>Safe & Isolated:</strong> No other repositories in this workspace. Changes are fully self-contained.
                    </span>
                  </div>
                ) : (
                  <div className="sibling-impacts-list">
                    {reviewResult.crossRepoImpacts.map((sib: SiblingRepoImpact, idx: number) => (
                      <div
                        key={sib.repoPath || idx}
                        className={`sibling-impact-item impact-${sib.status}`}
                        data-testid={`sibling-repo-impact-card-${idx}`}
                      >
                        <div className="sibling-header">
                          <div className="sibling-name-group">
                            <Layers size={14} className="sibling-icon" />
                            <span className="sibling-name">{sib.repoName}</span>
                          </div>
                          {renderStatusBadge(sib.status)}
                        </div>

                        <p className="sibling-summary">{sib.summary}</p>

                        {sib.affectedSymbolsOrEndpoints && sib.affectedSymbolsOrEndpoints.length > 0 && (
                          <div className="sibling-touchpoints">
                            <span className="touchpoint-label">Detected Touchpoints:</span>
                            <div className="touchpoint-tags">
                              {sib.affectedSymbolsOrEndpoints.map((item, tIdx) => (
                                <code key={tIdx} className="touchpoint-tag">
                                  {item}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}

                        {sib.affectedFiles && sib.affectedFiles.length > 0 && (
                          <div className="sibling-files">
                            <span className="touchpoint-label">Candidate Sibling Files:</span>
                            <span className="files-list">
                              {sib.affectedFiles.slice(0, 3).join(', ')}
                              {sib.affectedFiles.length > 3 && ` +${sib.affectedFiles.length - 3} more`}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Card 4: Suggested Verification (For Non-Devs / QA) */}
              <div className="review-card" data-testid="workspace-review-verification">
                <div className="review-card-header">
                  <span className="card-badge-icon">🧪</span>
                  <div className="card-title-group">
                    <h3 className="review-card-title">
                      {mode === 'plain' ? 'How to Test (Non-Dev QA Guide)' : 'Suggested Test & Verification Plan'}
                    </h3>
                    <span className="card-title-sub">
                      Simple step-by-step checklist to ensure everything works smoothly
                    </span>
                  </div>
                </div>

                <ul className="review-verification-list">
                  {reviewResult.suggestedVerification.map((step, sIdx) => (
                    <li key={sIdx} className="verification-step-item">
                      <ArrowRight size={13} className="step-arrow" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Empty / Prompt Input Row */}
          <div className="review-custom-prompt-row">
            <input
              type="text"
              className="review-custom-input"
              data-testid="workspace-review-prompt-input"
              placeholder="Ask a specific question or focus (e.g. 'Is the authentication flow safe?')"
              value={customPrompt}
              onChange={(e) => onSetCustomPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  void onRunReview();
                }
              }}
            />
            <button
              type="button"
              className="review-submit-prompt-btn"
              data-testid="workspace-review-submit-prompt-btn"
              disabled={loading}
              onClick={() => onRunReview()}
              title="Run review with custom prompt"
            >
              <Send size={13} />
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <footer className="settings-modal-footer review-modal-footer">
          <div className="footer-left">
            <span className="footer-hint">
              <HelpCircle size={12} />
              Review generated using your active AI provider configuration
            </span>
          </div>

          <div className="footer-actions">
            {reviewResult && (
              <button
                type="button"
                className="btn-secondary copy-report-btn"
                data-testid="copy-review-btn"
                onClick={handleCopyMarkdown}
                title="Copy full review report in Markdown format for Slack, Jira, or PR"
              >
                {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Report'}</span>
              </button>
            )}

            <button
              type="button"
              className="btn-primary re-run-btn"
              data-testid="run-review-btn"
              disabled={loading}
              onClick={() => onRunReview()}
            >
              <RotateCw size={14} className={loading ? 'review-spin-icon' : ''} />
              <span>{loading ? 'Analyzing...' : reviewResult ? 'Re-analyze' : 'Start Review'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default WorkspaceReviewModal;
