import React from 'react';
import { useGitRepo } from './hooks/useGitRepo';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import DiffViewer from './components/DiffViewer';
import ErrorBanner from './components/ErrorBanner';

/**
 * DevPilot AI Main Application Root Component.
 * Orchestrates application layout and connects the useGitRepo hook to view components.
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
    handleOpenDirectory,
    handleRefresh,
    handleSelectFile,
    handleDismissError,
  } = useGitRepo();

  return (
    <div className="app-container" data-testid="app-container">
      {/* Top Application Header */}
      <Header
        repoPath={repoPath}
        branch={branch}
        isDetached={isDetached}
        loading={loading}
        refreshing={refreshing}
        onOpenDirectory={handleOpenDirectory}
        onOpenFolder={handleOpenDirectory}
        onRefresh={handleRefresh}
      />

      {/* Global Error Banner */}
      <ErrorBanner
        message={error}
        onDismiss={handleDismissError}
      />

      {/* Two-Pane Workspace Layout */}
      <main className="app-main">
        {/* Left Changes Sidebar */}
        <Sidebar
          repoPath={repoPath}
          staged={staged}
          unstaged={unstaged}
          untracked={untracked}
          selectedFile={selectedFile}
          loading={loading}
          onSelectFile={handleSelectFile}
          onOpenFolder={handleOpenDirectory}
        />

        {/* Right Staged Diff Viewer */}
        <DiffViewer
          selectedFile={selectedFile}
          diffResult={diffResult}
          loading={diffLoading}
        />
      </main>

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
          <span className="security-tag" title="Electron Context Isolation is strictly enforced">
            Sandbox & Context Isolated
          </span>
          <span className="security-tag" title="No mutative git actions allowed">
            Strict Read-Only
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
