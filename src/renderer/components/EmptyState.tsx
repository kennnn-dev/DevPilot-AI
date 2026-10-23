import React from 'react';
import { FolderGit2, CheckCircle2, FileText } from 'lucide-react';

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
        className="empty-state empty-state-no-repo"
        data-testid={testId || 'empty-state-no-repo'}
      >
        <FolderGit2 className="empty-state-icon" size={48} aria-hidden="true" />
        <h3 className="empty-state-title">No Repository Opened</h3>
        <p className="empty-state-desc">
          Open a Git repository to inspect working tree status.
        </p>
        {onAction && (
          <button
            type="button"
            className="btn btn-primary btn-large"
            onClick={onAction}
            data-testid="empty-state-action-btn"
          >
            {actionLabel || 'Open Repository'}
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
        <CheckCircle2 className="clean-icon" size={36} aria-hidden="true" />
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
      <FileText className="placeholder-icon" size={48} aria-hidden="true" />
      <h3>No File Selected</h3>
      <p>Select any staged file from the sidebar to inspect its staged diff.</p>
    </div>
  );
};

export default EmptyState;
