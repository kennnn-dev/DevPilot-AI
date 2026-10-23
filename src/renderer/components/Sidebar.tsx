import React, { useState } from 'react';
import {
  GitBranch,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  GitCommit,
  Layers,
  Eye,
  ArrowLeftRight,
  Terminal,
  MoreHorizontal,
  Folder,
} from 'lucide-react';
import type { GitFileStatus } from '../../shared/types';
import FileList from './FileList';
import EmptyState from './EmptyState';

export interface SidebarProps {
  /** Currently opened repository path */
  repoPath: string | null;
  /** Active branch name */
  branch?: string | null;
  /** Staged files */
  staged: GitFileStatus[];
  /** Unstaged working tree files */
  unstaged: GitFileStatus[];
  /** Untracked files */
  untracked: GitFileStatus[];
  /** Currently selected file for diff inspection */
  selectedFile: GitFileStatus | null;
  /** Whether loading is in progress */
  loading?: boolean;
  /** File selection handler */
  onSelectFile: (file: GitFileStatus, scope?: 'staged' | 'unstaged' | 'untracked') => void;
  /** Handler to open folder from empty state */
  onOpenFolder?: () => void;
  /** Alias for onOpenFolder */
  onOpenDirectory?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  repoPath,
  branch = 'main',
  staged,
  unstaged,
  untracked,
  selectedFile,
  onSelectFile,
  onOpenFolder,
  onOpenDirectory,
}) => {
  const handleOpen = onOpenDirectory || onOpenFolder;
  const totalChanges = staged.length + unstaged.length + untracked.length;
  const [isRepoCardExpanded, setIsRepoCardExpanded] = useState(true);

  const repoName = repoPath
    ? repoPath.split(/[/\\]/).filter(Boolean).pop() || repoPath
    : null;

  return (
    <aside className="app-sidebar" data-testid="sidebar">
      {/* Sidebar Header (for test accessibility & changes count) */}
      <div className="sidebar-header">
        <span className="sidebar-title">Changes</span>
        {repoPath && (
          <span className="sidebar-count-badge" data-testid="total-changes-count">
            {totalChanges}
          </span>
        )}
      </div>

      <div className="sidebar-content">
        {!repoPath ? (
          <div className="sidebar-empty-state" data-testid="sidebar-no-repo">
            <EmptyState
              mode="no-repo"
              onAction={handleOpen}
              actionLabel="Open Repository"
            />
          </div>
        ) : totalChanges === 0 ? (
          <EmptyState mode="clean-tree" />
        ) : (
          <div className="sidebar-workspace-body">
            {/* Selected Repository Card matching Image */}
            <div className="repo-status-card" data-testid="repo-status-card">
              <div
                className="repo-status-card-header"
                onClick={() => setIsRepoCardExpanded((prev) => !prev)}
              >
                <div className="repo-card-meta-left">
                  <div className="repo-icon-badge">
                    <Folder size={14} className="text-cyan" />
                  </div>
                  <span className="repo-card-title">{repoName}</span>
                  <span className="repo-branch-tag">
                    <GitBranch size={11} />
                    <span>{branch || 'main'}</span>
                  </span>
                  <span className="repo-status-tag tag-up-to-date">
                    Up to date
                  </span>
                </div>

                <button
                  type="button"
                  className="repo-expand-trigger"
                  title={isRepoCardExpanded ? 'Collapse' : 'Expand'}
                >
                  {isRepoCardExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* 3 Metric Cards matching Image */}
              {isRepoCardExpanded && (
                <div className="repo-metrics-grid">
                  <div className="metric-card metric-staged">
                    <div className="metric-icon-box box-staged">
                      <CheckCircle2 size={13} />
                    </div>
                    <div className="metric-text-group">
                      <span className="metric-number">{staged.length}</span>
                      <span className="metric-label">Staged</span>
                    </div>
                  </div>

                  <div className="metric-card metric-unstaged">
                    <div className="metric-icon-box box-unstaged">
                      <GitCommit size={13} />
                    </div>
                    <div className="metric-text-group">
                      <span className="metric-number">{unstaged.length}</span>
                      <span className="metric-label">Unstaged</span>
                    </div>
                  </div>

                  <div className="metric-card metric-untracked">
                    <div className="metric-icon-box box-untracked">
                      <Layers size={13} />
                    </div>
                    <div className="metric-text-group">
                      <span className="metric-number">{untracked.length}</span>
                      <span className="metric-label">Untracked</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Files List Header matching Image: [x] Files (6) */}
            <div className="files-section-bar">
              <input
                type="checkbox"
                className="files-master-checkbox"
                defaultChecked
                readOnly
                title="All Changed Files"
              />
              <span className="files-bar-title">Files ({totalChanges})</span>
            </div>

            {/* Categorized File Sections */}
            <div className="file-sections-container">
              {/* Staged Changes Section */}
              <FileList
                title="Staged Changes"
                count={staged.length}
                files={staged}
                sectionId="staged"
                selectedFile={selectedFile}
                isSelectable={true}
                defaultExpanded={true}
                emptyText="No staged changes"
                onSelectFile={(f) => onSelectFile(f)}
              />

              {/* Unstaged Changes Section */}
              <FileList
                title="Changes"
                count={unstaged.length}
                files={unstaged}
                sectionId="unstaged"
                selectedFile={selectedFile}
                isSelectable={false}
                defaultExpanded={true}
                emptyText="No unstaged changes"
                onSelectFile={(f) => onSelectFile(f, 'unstaged')}
              />

              {/* Untracked Files Section */}
              <FileList
                title="Untracked Files"
                count={untracked.length}
                files={untracked}
                sectionId="untracked"
                selectedFile={selectedFile}
                isSelectable={false}
                defaultExpanded={true}
                emptyText="No untracked files"
                onSelectFile={(f) => onSelectFile(f, 'untracked')}
              />
            </div>

            {/* Bottom Repository Actions matching Image */}
            <div className="repo-actions-panel">
              <span className="repo-actions-title">Repository Actions</span>
              <div className="repo-actions-row">
                <button
                  type="button"
                  className="btn-repo-action"
                  title="View Selected Diff"
                >
                  <Eye size={13} />
                  <span>View Diff</span>
                </button>
                <button
                  type="button"
                  className="btn-repo-action"
                  title="Read-Only Mode: Staging is safe & disabled"
                >
                  <ArrowLeftRight size={13} />
                  <span>Stage/Unstage</span>
                </button>
                <button
                  type="button"
                  className="btn-repo-action"
                  title="Open Repository in Terminal"
                >
                  <Terminal size={13} />
                  <span>Open in Terminal</span>
                </button>
                <button
                  type="button"
                  className="btn-repo-action btn-repo-action-more"
                  title="More actions"
                >
                  <MoreHorizontal size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
