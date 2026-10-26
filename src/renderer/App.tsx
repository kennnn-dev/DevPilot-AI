import React, { useCallback } from 'react';
import { useGitRepo } from './hooks/useGitRepo';
import { useWorkspaces } from './hooks/useWorkspaces';
import NavigationSidebar from './components/NavigationSidebar';
import Header from './components/Header';
import RepositoryCards from './components/RepositoryCards';
import Sidebar from './components/Sidebar';
import DiffViewer from './components/DiffViewer';
import ErrorBanner from './components/ErrorBanner';
import SettingsModal from './components/SettingsModal/SettingsModal';

/**
 * DevPilot AI Main Studio Component.
 * Implements the 3-column workspace studio layout:
 * - Left Column: Navigation rail & Workspace cards
 * - Center Column: Workspace Header, Horizontal Repo Cards, Metric Summary Cards, Changed Files, Actions
 * - Right Column: Unified Diff Inspector (opened when a file is clicked)
 */
export const App: React.FC = () => {
  const {
    repoPath,
    branch,
    isDetached,
    staged,
    unstaged,
    untracked,
    selectedFile,
    diffResult,
    loading,
    refreshing,
    diffLoading,
    error,
    handleOpenDirectory: gitRepoOpenDir,
    loadRepoStatus,
    handleRefresh,
    handleSelectFile,
    handleDismissError,
    clearRepo,
    deselectFile,
  } = useGitRepo();

  const {
    workspaces,
    activeWorkspace,
    activeRepoPath,
    selectWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    addRepoToWorkspace,
    removeRepoFromWorkspace,
    setActiveRepoPath,
  } = useWorkspaces();

  // Centralized settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = React.useState<boolean>(false);

  // User-resizable width for the diff panel (persisted locally)
  const [diffWidth, setDiffWidth] = React.useState<number>(() => {
    try {
      const saved = localStorage.getItem('devpilot_diff_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 1600) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return 560;
  });

  const [isResizing, setIsResizing] = React.useState<boolean>(false);

  // Cached active branch names for each repository in the workspace
  const [repoBranches, setRepoBranches] = React.useState<Record<string, string>>({});

  // Sync active repo branch into cache
  React.useEffect(() => {
    if (repoPath && branch) {
      setRepoBranches((prev) => {
        if (prev[repoPath] === branch) return prev;
        return { ...prev, [repoPath]: branch };
      });
    }
  }, [repoPath, branch]);

  const handleMouseDownResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = diffWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const maxDiffWidth = typeof window !== 'undefined' ? window.innerWidth - 500 : 1200;
        const newWidth = Math.min(Math.max(340, startWidth + delta), Math.max(360, maxDiffWidth));
        setDiffWidth(newWidth);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        try {
          localStorage.setItem('devpilot_diff_width', String(diffWidth));
        } catch {
          // ignore
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [diffWidth]
  );

  /**
   * Prompts native folder picker dialog and adds chosen repository exclusively to active workspace.
   */
  const handleOpenDirectory = useCallback(async () => {
    if (typeof window === 'undefined' || !window.devPilot) {
      await gitRepoOpenDir();
      return;
    }

    try {
      const selected = await window.devPilot.openDirectory();
      if (selected) {
        addRepoToWorkspace(selected);
        clearRepo();
        await loadRepoStatus(selected);
      }
    } catch (err: unknown) {
      await gitRepoOpenDir();
    }
  }, [addRepoToWorkspace, clearRepo, loadRepoStatus, gitRepoOpenDir]);

  /**
   * Creates a brand new, empty workspace with zero repositories.
   * Clears any active repository so repositories are never duplicated or copied across workspaces.
   */
  const handleCreateWorkspace = useCallback(
    (name: string) => {
      const newWs = createWorkspace(name);
      clearRepo();
      return newWs;
    },
    [createWorkspace, clearRepo]
  );

  /**
   * Selects an existing repository card in the active workspace.
   */
  const handleSelectRepo = useCallback(
    async (path: string) => {
      setActiveRepoPath(path);
      clearRepo();
      await loadRepoStatus(path);
    },
    [setActiveRepoPath, clearRepo, loadRepoStatus]
  );

  /**
   * Removes a repository from the active workspace.
   */
  const handleRemoveRepo = useCallback(
    (path: string) => {
      removeRepoFromWorkspace(path);
      const remaining = activeWorkspace.repoPaths.filter((p) => p !== path);
      if (remaining.length > 0) {
        clearRepo();
        loadRepoStatus(remaining[0]);
      } else {
        clearRepo();
      }
    },
    [removeRepoFromWorkspace, activeWorkspace.repoPaths, clearRepo, loadRepoStatus]
  );

  /**
   * Switches to another workspace and loads its active repository if any.
   * If the workspace is empty, clears repository state.
   */
  const handleSelectWorkspace = useCallback(
    (id: string) => {
      selectWorkspace(id);
      const targetWs = workspaces.find((w) => w.id === id);
      if (targetWs && targetWs.repoPaths.length > 0) {
        clearRepo();
        loadRepoStatus(targetWs.repoPaths[0]);
      } else {
        clearRepo();
      }
    },
    [selectWorkspace, workspaces, clearRepo, loadRepoStatus]
  );

  /**
   * Deletes a workspace and switches to another.
   */
  const handleDeleteWorkspace = useCallback(
    (id: string) => {
      deleteWorkspace(id);
      const remaining = workspaces.filter((w) => w.id !== id);
      if (remaining.length > 0 && remaining[0].repoPaths.length > 0) {
        clearRepo();
        loadRepoStatus(remaining[0].repoPaths[0]);
      } else {
        clearRepo();
      }
    },
    [deleteWorkspace, workspaces, clearRepo, loadRepoStatus]
  );

  return (
    <div className="app-container" data-testid="app-container">
      {/* 3-Column Main Studio Layout */}
      <div className="studio-main-layout">
        {/* Column 1: Left Navigation Sidebar */}
        <NavigationSidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspace.id}
          onSelectWorkspace={handleSelectWorkspace}
          onCreateWorkspace={handleCreateWorkspace}
          onRenameWorkspace={renameWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isSettingsActive={isSettingsOpen}
        />

        {/* Column 2: Center Workspace & Files Area (Expands full-width when no file is selected) */}
        <main
          className={`studio-center-panel ${selectedFile ? 'with-diff' : 'full-width'}`}
        >
          {/* Workspace Main Header */}
          <Header
            workspaceName={activeWorkspace.name}
            repoCount={activeWorkspace.repoPaths.length}
            onRenameWorkspace={(newName) => renameWorkspace(activeWorkspace.id, newName)}
            repoPath={repoPath}
            branch={branch}
            isDetached={isDetached}
            loading={loading}
            refreshing={refreshing}
            onOpenDirectory={handleOpenDirectory}
            onOpenFolder={handleOpenDirectory}
            onRefresh={handleRefresh}
            hideBrand={true}
          />

          {/* Global Error Banner */}
          <ErrorBanner
            message={error}
            onDismiss={handleDismissError}
          />

          {/* Horizontal Repository Selector Cards matching Image */}
          <RepositoryCards
            repoPaths={activeWorkspace.repoPaths}
            activeRepoPath={repoPath || activeRepoPath}
            activeBranch={branch}
            repoBranches={repoBranches}
            onSelectRepo={handleSelectRepo}
            onRemoveRepo={handleRemoveRepo}
            onAddRepo={handleOpenDirectory}
          />

          {/* Selected Repo Card, 3 Metric Cards, Changes List, Repository Actions */}
          <Sidebar
            repoPath={repoPath}
            branch={branch}
            staged={staged}
            unstaged={unstaged}
            untracked={untracked}
            selectedFile={selectedFile}
            loading={loading}
            onSelectFile={handleSelectFile}
            onOpenFolder={handleOpenDirectory}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </main>

        {/* Resizer Splitter between Center Panel and Diff Panel (Active when file is selected) */}
        {selectedFile && (
          <div
            className={`studio-panel-resizer ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDownResize}
            title="Drag to resize Diff Panel"
            role="separator"
            aria-orientation="vertical"
          >
            <div className="resizer-grip" />
          </div>
        )}

        {/* Column 3: Right Diff Viewer Pane (Opens only when a file is clicked) */}
        <aside
          className={`studio-right-panel ${selectedFile ? 'panel-visible' : 'panel-hidden'}`}
          style={selectedFile ? { width: `${diffWidth}px`, flex: 'none' } : undefined}
        >
          <DiffViewer
            selectedFile={selectedFile}
            diffResult={diffResult}
            loading={diffLoading}
            onClose={deselectFile}
          />
        </aside>
      </div>

      {/* Bottom Status Bar */}
      <footer className="app-status-bar" data-testid="status-bar">
        <div className="status-bar-left">
          <span className="status-indicator-dot" />
          <span className="status-text">
            {repoPath
              ? `${staged.length} staged, ${unstaged.length} unstaged, ${untracked.length} untracked`
              : 'Standby'}
          </span>
        </div>
        <div className="status-bar-right">
          <span className="security-tag" title="Strict Read-Only Mode: Mutative Git commands are prohibited">
            Read-Only
          </span>
          <span className="security-tag" title="Electron Context Isolation is strictly enforced">
            Sandbox & Context Isolated
          </span>
        </div>
      </footer>

      {/* Centralized Settings Modal Overlay */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default App;
