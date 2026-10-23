import React from 'react';
import { FolderOpen, RefreshCw, GitBranch } from 'lucide-react';

export interface HeaderProps {
  /** Absolute path of the opened Git repository, or null if none */
  repoPath: string | null;
  /** Active branch name, or short commit SHA if detached HEAD */
  branch: string | null;
  /** Whether the repository is currently in a detached HEAD state */
  isDetached?: boolean;
  /** Whether repository status loading is in progress */
  loading?: boolean;
  /** Whether a refresh operation is currently in progress */
  refreshing?: boolean;
  /** Callback triggered when user clicks Open Folder / Open Directory */
  onOpenFolder?: () => void;
  /** Callback alias */
  onOpenDirectory?: () => void;
  /** Callback triggered when user clicks Refresh */
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  repoPath,
  branch,
  isDetached = false,
  refreshing = false,
  onOpenFolder,
  onOpenDirectory,
  onRefresh,
}) => {
  const handleOpen = onOpenDirectory || onOpenFolder;
  const folderName = repoPath
    ? repoPath.split(/[/\\]/).filter(Boolean).pop() || repoPath
    : null;

  return (
    <header className="app-header" data-testid="app-header">
      {/* Left section: Branding & Open Repo */}
      <div className="header-left">
        <div className="app-brand" title="DevPilot AI - Safe Read-Only Git Inspector">
          <svg
            className="brand-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
            <line x1="6" y1="9" x2="6" y2="21" />
          </svg>
          <span className="brand-title">DevPilot AI</span>
          <span className="badge-readonly" title="Strict Read-Only Mode: Mutative Git commands are prohibited">
            Read-Only
          </span>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleOpen}
          data-testid="open-repo-btn"
          title="Open a local Git repository"
        >
          <FolderOpen className="btn-icon" size={14} aria-hidden="true" />
          <span>Open Folder</span>
        </button>

        {repoPath ? (
          <div
            className="repo-path-display"
            title={repoPath}
            data-testid="repo-path"
          >
            <span className="repo-folder-name">{folderName}</span>
            <span className="repo-path-divider">/</span>
            <span className="repo-path-text">{repoPath}</span>
          </div>
        ) : (
          <div className="repo-path-empty" data-testid="repo-path-empty">
            No repository opened
          </div>
        )}
      </div>

      {/* Right section: Branch badge & Refresh button */}
      <div className="header-right">
        {branch && (
          <div
            className={`branch-badge ${isDetached ? 'detached' : ''}`}
            title={isDetached ? `Detached HEAD at commit ${branch}` : `Active Branch: ${branch}`}
            data-testid="branch-badge"
          >
            <GitBranch className="branch-icon" size={14} aria-hidden="true" />
            <span className="branch-name">
              {isDetached ? `(HEAD detached at ${branch})` : branch}
            </span>
          </div>
        )}

        <button
          type="button"
          className="btn btn-icon-only"
          onClick={onRefresh}
          disabled={!repoPath || refreshing}
          title={refreshing ? 'Refreshing repository status...' : 'Refresh repository status'}
          data-testid="refresh-btn"
          aria-label="Refresh repository status"
        >
          <RefreshCw
            className={`refresh-icon ${refreshing ? 'spinning' : ''}`}
            size={14}
            aria-hidden="true"
          />
        </button>
      </div>
    </header>
  );
};

export default Header;
