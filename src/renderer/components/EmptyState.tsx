import React from 'react';
import { FolderGit2, CheckCircle2, FileCode, Plus } from 'lucide-react';

export type EmptyStateMode = 'no-repo' | 'clean-tree' | 'no-file-selected';

export interface EmptyStateProps {
  /** Mode of empty state */
  mode: EmptyStateMode;
  /** Optional click handler for CTA button */
  onAction?: () => void;
  /** Label for CTA button */
  actionLabel?: string;
  /** Optional custom data-testid */
  testId?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  mode,
  onAction,
  actionLabel,
  testId,
}) => {
  if (mode === 'no-repo') {
    return (
      <div
        className="empty-state-card-centered"
        data-testid={testId || 'empty-state-no-repo'}
      >
        <div className="empty-state-icon-circle">
          <FolderGit2 className="empty-state-icon" size={32} aria-hidden="true" />
        </div>
        <h3 className="empty-state-title">No Repository Opened</h3>
        <p className="empty-state-desc">
          Open an existing local Git repository to inspect working tree status, branches, and diffs safely.
        </p>
        {onAction && (
          <button
            type="button"
            className="btn-empty-cta"
            onClick={onAction}
            data-testid="empty-state-action-btn"
          >
            <Plus size={14} />
            <span>{actionLabel || 'Open Repository'}</span>
          </button>
        )}
      </div>
    );
  }

  if (mode === 'clean-tree') {
    return (
      <div
        className="sidebar-clean-state"
        data-testid={testId || 'sidebar-clean'}
      >
        <div className="clean-icon-circle">
          <CheckCircle2 className="clean-icon" size={28} aria-hidden="true" />
        </div>
        <p className="clean-title">Working tree clean</p>
        <p className="clean-subtitle">
          No staged, unstaged, or untracked changes.
        </p>
      </div>
    );
  }

  // mode === 'no-file-selected'
  return (
    <div
      className="diff-placeholder"
      data-testid={testId || 'diff-placeholder'}
    >
      <div className="placeholder-icon-circle">
        <FileCode className="placeholder-icon" size={32} aria-hidden="true" />
      </div>
      <h3>No File Selected</h3>
      <p>Select any staged file from the sidebar to inspect its staged diff.</p>
    </div>
  );
};

export default EmptyState;
