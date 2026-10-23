import React from 'react';
import type { GitFileStatus } from '../../shared/types';
import FileList from './FileList';
import EmptyState from './EmptyState';

export interface SidebarProps {
  /** Currently opened repository path */
  repoPath: string | null;
  /** Staged files */
  staged: GitFileStatus[];
  /** Unstaged working tree files */
  unstaged: GitFileStatus[];
  /** Untracked files */
  untracked: GitFileStatus[];
  /** Currently selected file for staged diff inspection */
  selectedFile: GitFileStatus | null;
  /** Whether loading is in progress */
  loading?: boolean;
  /** File selection handler */
  onSelectFile: (file: GitFileStatus) => void;
  /** Handler to open folder from empty state */
  onOpenFolder?: () => void;
  /** Alias for onOpenFolder */
  onOpenDirectory?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  repoPath,
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

  return (
    <aside className="app-sidebar" data-testid="sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <span className="sidebar-title">Changes</span>
        {repoPath && (
          <span className="sidebar-count-badge" data-testid="total-changes-count">
            {totalChanges}
          </span>
        )}
      </div>

      {/* Sidebar Content */}
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
          <>
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
              onSelectFile={onSelectFile}
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
            />
          </>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
