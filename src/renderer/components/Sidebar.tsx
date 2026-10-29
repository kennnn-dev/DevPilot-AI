import React, { useState } from 'react';
import {
  GitBranch,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Layers,
  Eye,
  ArrowLeftRight,
  Terminal,
  MoreHorizontal,
  Folder,
  Sparkles,
  Edit2,
  Filter,
  RotateCcw,
  Check,
} from 'lucide-react';
import type { GitFileStatus } from '../../shared/types';
import FileList from './FileList';
import EmptyState from './EmptyState';
import CommitGeneratorPanel from './CommitGenerator/CommitGeneratorPanel';

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
  /** Handler to open settings modal */
  onOpenSettings?: () => void;
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
  onOpenSettings,
}) => {
  const handleOpen = onOpenDirectory || onOpenFolder;
  const totalChanges = staged.length + unstaged.length + untracked.length;
  const [isRepoCardExpanded, setIsRepoCardExpanded] = useState(true);
  const [isCommitAssistantOpen, setIsCommitAssistantOpen] = useState(false);
  const [terminalLaunching, setTerminalLaunching] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const filterFn = (f: GitFileStatus) => {
    if (!filterQuery.trim()) return true;
    return f.path.toLowerCase().includes(filterQuery.toLowerCase());
  };

  const filteredStaged = staged.filter(filterFn);
  const filteredUnstaged = unstaged.filter(filterFn);
  const filteredUntracked = untracked.filter(filterFn);

  const handleOpenTerminal = async () => {
    if (!repoPath) return;
    setTerminalLaunching(true);
    try {
      if (window.devPilot && typeof window.devPilot.openTerminal === 'function') {
        const res = await window.devPilot.openTerminal(repoPath);
        if (!res.success && res.error) {
          console.warn('[DevPilot Terminal]', res.error);
        }
      }
    } catch (err) {
      console.error('[DevPilot Terminal]', err);
    } finally {
      setTerminalLaunching(false);
    }
  };

  const repoName = repoPath
    ? repoPath.split(/[\/\\]/).filter(Boolean).pop() || repoPath
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
                    <Check size={11} className="mr-1" />
                    Up to date
                  </span>
                </div>

                <div className="repo-card-meta-right">
                  <span className="repo-sync-time">Last sync: 2 mins ago</span>
                  <button
                    type="button"
                    className="repo-expand-trigger"
                    title={isRepoCardExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isRepoCardExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* 3 Metric Cards matching Image 1 */}
              {isRepoCardExpanded && (
                <div className="repo-metrics-grid">
                  <div className="metric-card metric-staged">
                    <div className="metric-icon-box box-staged">
                      <CheckCircle2 size={15} />
                    </div>
                    <div className="metric-text-group">
                      <span className="metric-label">Staged Changes</span>
                      <span className="metric-number">{staged.length} files</span>
                    </div>
                    <span className="metric-status-pill pill-clean">Clean</span>
                  </div>

                  <div className="metric-card metric-unstaged">
                    <div className="metric-icon-box box-unstaged">
                      <Edit2 size={14} />
                    </div>
                    <div className="metric-text-group">
                      <span className="metric-label">Unstaged Changes</span>
                      <span className="metric-number text-amber">{unstaged.length} modified</span>
                    </div>
                    <span className="metric-status-pill pill-diff">
                      <span className="text-emerald">+8</span>
                      <span className="diff-slash">/</span>
                      <span className="text-rose">-3</span>
                    </span>
                  </div>

                  <div className="metric-card metric-untracked">
                    <div className="metric-icon-box box-untracked">
                      <Layers size={14} />
                    </div>
                    <div className="metric-text-group">
                      <span className="metric-label">Untracked Files</span>
                      <span className="metric-number text-cyan">{untracked.length} new</span>
                    </div>
                    <span className="metric-status-pill pill-cyan">+165 lines</span>
                  </div>
                </div>
              )}
            </div>

            {/* AI Commit Assistant Panel (Triggered via Sparkles button) */}
            {isCommitAssistantOpen && (
              <CommitGeneratorPanel
                repoPath={repoPath}
                stagedCount={staged.length}
                isOpen={isCommitAssistantOpen}
                onClose={() => setIsCommitAssistantOpen(false)}
                onOpenSettings={onOpenSettings}
              />
            )}

            {/* Files List Toolbar matching Image 1 */}
            <div className="files-section-bar">
              <div className="files-bar-left">
                <span className="files-bar-title">Files</span>
                <span className="files-count-badge">{totalChanges}</span>
              </div>

              <div className="files-filter-box">
                <Filter size={12} className="filter-icon" />
                <input
                  type="text"
                  className="files-filter-input"
                  placeholder="Filter changed files (⌘F)"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
              </div>

              <div className="files-bar-actions">
                <button type="button" className="btn-files-action btn-stage-all" title="Stage all changes">
                  <span className="btn-plus-icon">+</span>
                  <span>Stage All</span>
                </button>
                <button type="button" className="btn-files-action btn-discard-all" title="Discard unstaged changes">
                  <RotateCcw size={12} />
                  <span>Discard All</span>
                </button>
                <button
                  type="button"
                  className="btn-files-action btn-staged-pill"
                  onClick={() => setIsCommitAssistantOpen((prev) => !prev)}
                  title="Open AI Commit Assistant"
                >
                  <Sparkles size={12} />
                  <span>{staged.length} staged</span>
                </button>
              </div>
            </div>

            {/* Categorized File Sections */}
            <div className="file-sections-container">
              {/* Staged Changes Section */}
              <FileList
                title="STAGED CHANGES"
                count={filteredStaged.length}
                files={filteredStaged}
                sectionId="staged"
                selectedFile={selectedFile}
                isSelectable={true}
                defaultExpanded={true}
                emptyText="No staged changes"
                onSelectFile={(f) => onSelectFile(f)}
                headerAction={
                  <button
                    type="button"
                    className={`btn-sparkles-trigger ${isCommitAssistantOpen ? 'active' : ''}`}
                    title="AI Commit Assistant"
                    data-testid="sparkles-btn"
                    onClick={() => setIsCommitAssistantOpen((prev) => !prev)}
                  >
                    <Sparkles size={13} />
                  </button>
                }
              />

              {/* Unstaged Changes Section */}
              <FileList
                title="CHANGES"
                count={filteredUnstaged.length}
                files={filteredUnstaged}
                sectionId="unstaged"
                selectedFile={selectedFile}
                isSelectable={false}
                defaultExpanded={true}
                emptyText="No unstaged changes"
                onSelectFile={(f) => onSelectFile(f, 'unstaged')}
              />

              {/* Untracked Files Section */}
              <FileList
                title="UNTRACKED FILES"
                count={filteredUntracked.length}
                files={filteredUntracked}
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
                  title="Generate Conventional Commit Message with AI"
                  data-testid="repo-action-generate-commit"
                  onClick={() => setIsCommitAssistantOpen(true)}
                >
                  <Sparkles size={13} className="text-cyan" />
                  <span>Generate Commit</span>
                </button>
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
                  title={repoPath ? `Open ${repoPath} in native terminal` : 'Open Repository in Terminal'}
                  data-testid="repo-action-open-terminal"
                  disabled={!repoPath || terminalLaunching}
                  onClick={handleOpenTerminal}
                >
                  <Terminal size={13} />
                  <span>{terminalLaunching ? 'Opening...' : 'Open in Terminal'}</span>
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
