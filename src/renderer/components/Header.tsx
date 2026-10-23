import React, { useState } from 'react';
import {
  Folder,
  Edit2,
  Plus,
  MoreHorizontal,
  RefreshCw,
  GitBranch,
  Check,
  X,
} from 'lucide-react';

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
  /** Callback triggered when user clicks Open Folder / Add Repository */
  onOpenFolder?: () => void;
  /** Callback alias */
  onOpenDirectory?: () => void;
  /** Callback triggered when user clicks Refresh */
  onRefresh: () => void;
  /** Current active workspace name */
  workspaceName?: string;
  /** Number of repositories in active workspace */
  repoCount?: number;
  /** Callback to rename active workspace */
  onRenameWorkspace?: (newName: string) => void;
  /** Whether to hide duplicate brand in 3-column layout */
  hideBrand?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  repoPath,
  branch,
  isDetached = false,
  refreshing = false,
  onOpenFolder,
  onOpenDirectory,
  onRefresh,
  workspaceName = 'Default Workspace',
  repoCount = 0,
  onRenameWorkspace,
  hideBrand = false,
}) => {
  const handleOpen = onOpenDirectory || onOpenFolder;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(workspaceName);

  const folderName = repoPath
    ? repoPath.split(/[/\\]/).filter(Boolean).pop() || repoPath
    : null;

  const handleStartRename = () => {
    setRenameVal(workspaceName);
    setIsRenaming(true);
  };

  const handleConfirmRename = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (renameVal.trim() && onRenameWorkspace) {
      onRenameWorkspace(renameVal.trim());
    }
    setIsRenaming(false);
  };

  const displayBranch = isDetached ? `(HEAD detached at ${branch})` : branch;

  return (
    <header className="app-header workspace-main-header" data-testid="app-header">
      {/* Brand title for standalone test compatibility */}
      {!hideBrand && (
        <div className="app-brand" title="DevPilot AI - Safe Read-Only Git Inspector">
          <span className="brand-title">DevPilot AI</span>
          <span className="badge-readonly" title="Strict Read-Only Mode">
            Read-Only
          </span>
        </div>
      )}

      {/* Left side: Folder icon, Workspace Title, Subtitle matching Image */}
      <div className="ws-header-left">
        <div className="ws-header-folder-box">
          <Folder size={18} className="ws-header-folder-icon" />
        </div>

        <div className="ws-header-text">
          {isRenaming ? (
            <form className="ws-header-rename-form" onSubmit={handleConfirmRename}>
              <input
                type="text"
                className="ws-header-rename-input"
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                autoFocus
              />
              <button type="submit" className="ws-action-btn ws-confirm" title="Save">
                <Check size={13} />
              </button>
              <button
                type="button"
                className="ws-action-btn ws-cancel"
                onClick={() => setIsRenaming(false)}
                title="Cancel"
              >
                <X size={13} />
              </button>
            </form>
          ) : (
            <div className="ws-header-title-row">
              <h1 className="ws-header-title">{workspaceName}</h1>
              {onRenameWorkspace && (
                <button
                  type="button"
                  className="ws-rename-trigger"
                  onClick={handleStartRename}
                  title="Rename workspace"
                  data-testid="rename-workspace-icon"
                >
                  <Edit2 size={13} />
                </button>
              )}
            </div>
          )}

          <div className="ws-header-subtitle">
            <span>
              {repoCount} {repoCount === 1 ? 'repository' : 'repositories'}
            </span>
            <span className="subtitle-dot">•</span>
            <span>Local workspace</span>

            {/* Accessible elements for test assertions without visual clutter */}
            {repoPath ? (
              <span
                className="repo-path-display-inline"
                title={repoPath}
                data-testid="repo-path"
              >
                <span className="subtitle-dot">•</span>
                <span className="repo-path-highlight">{folderName}</span>
                <span className="sr-only">({repoPath})</span>
              </span>
            ) : (
              <span className="sr-only" data-testid="repo-path-empty">
                No repository opened
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Branch badge, Refresh button, Primary + Add Repository, and More button */}
      <div className="ws-header-actions">
        {branch && (
          <div
            className={`branch-badge ${isDetached ? 'detached' : ''}`}
            title={isDetached ? `Detached HEAD at commit ${branch}` : `Active Branch: ${branch}`}
            data-testid="branch-badge"
          >
            <GitBranch className="branch-icon" size={13} aria-hidden="true" />
            <span className="branch-name">{displayBranch}</span>
          </div>
        )}

        <button
          type="button"
          className="btn-header-icon"
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

        <button
          type="button"
          className="btn-add-repo-primary"
          onClick={handleOpen}
          data-testid="open-repo-btn"
          title="Add a local Git repository from disk to this workspace"
        >
          <Plus size={14} aria-hidden="true" />
          <span>Add Repository</span>
        </button>

        <button
          type="button"
          className="btn-header-icon"
          title="More options"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
    </header>
  );
};

export default Header;
