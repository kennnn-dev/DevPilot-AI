import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../../src/renderer/components/Header';
import Sidebar from '../../src/renderer/components/Sidebar';
import FileList from '../../src/renderer/components/FileList';
import DiffViewer from '../../src/renderer/components/DiffViewer';
import EmptyState from '../../src/renderer/components/EmptyState';
import ErrorBanner from '../../src/renderer/components/ErrorBanner';
import type { GitFileStatus, GitDiffResult } from '../../src/shared/types';

describe('Milestone 3 Presentation Components (src/renderer/components/)', () => {
  // =========================================================================
  // Header Component Tests
  // =========================================================================
  describe('Header Component', () => {
    it('renders brand title, read-only badge, and empty repo display by default', () => {
      render(
        <Header
          repoPath={null}
          branch={null}
          isDetached={false}
          refreshing={false}
          onOpenFolder={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      expect(screen.getByTestId('app-header')).toBeDefined();
      expect(screen.getByText('DevPilot AI')).toBeDefined();
      expect(screen.getByText('Read-Only')).toBeDefined();
      expect(screen.getByTestId('repo-path-empty')).toBeDefined();
      expect(screen.getByText('No repository opened')).toBeDefined();
    });

    it('renders repository path and active branch badge when repository is loaded', () => {
      render(
        <Header
          repoPath="/home/developer/workspace/project"
          branch="main"
          isDetached={false}
          refreshing={false}
          onOpenFolder={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      expect(screen.getByTestId('repo-path').textContent).toContain('/home/developer/workspace/project');
      expect(screen.getByTestId('branch-badge').textContent).toContain('main');
    });

    it('renders detached HEAD indicator when isDetached is true', () => {
      render(
        <Header
          repoPath="/workspace/project"
          branch="a1b2c3d"
          isDetached={true}
          refreshing={false}
          onOpenFolder={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      const branchBadge = screen.getByTestId('branch-badge');
      expect(branchBadge.className).toContain('detached');
      expect(branchBadge.textContent).toContain('a1b2c3d');
    });

    it('fires onOpenFolder when Open Folder button is clicked', () => {
      const handleOpen = vi.fn();
      render(
        <Header
          repoPath={null}
          branch={null}
          onOpenFolder={handleOpen}
          onRefresh={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('open-repo-btn'));
      expect(handleOpen).toHaveBeenCalledTimes(1);
    });

    it('fires onOpenDirectory alias when provided', () => {
      const handleOpenDir = vi.fn();
      render(
        <Header
          repoPath={null}
          branch={null}
          onOpenDirectory={handleOpenDir}
          onRefresh={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('open-repo-btn'));
      expect(handleOpenDir).toHaveBeenCalledTimes(1);
    });

    it('disables refresh button when no repo is open or when refreshing is true', () => {
      const handleRefresh = vi.fn();
      const { rerender } = render(
        <Header
          repoPath={null}
          branch={null}
          refreshing={false}
          onOpenFolder={vi.fn()}
          onRefresh={handleRefresh}
        />
      );

      const refreshBtn = screen.getByTestId('refresh-btn') as HTMLButtonElement;
      expect(refreshBtn.disabled).toBe(true);

      // Opened repo but refreshing
      rerender(
        <Header
          repoPath="/valid/repo"
          branch="main"
          refreshing={true}
          onOpenFolder={vi.fn()}
          onRefresh={handleRefresh}
        />
      );

      expect(refreshBtn.disabled).toBe(true);
      expect(refreshBtn.querySelector('.spinning')).toBeDefined();
    });

    it('triggers onRefresh when clicked on an open repo while not refreshing', () => {
      const handleRefresh = vi.fn();
      render(
        <Header
          repoPath="/valid/repo"
          branch="main"
          refreshing={false}
          onOpenFolder={vi.fn()}
          onRefresh={handleRefresh}
        />
      );

      const refreshBtn = screen.getByTestId('refresh-btn');
      fireEvent.click(refreshBtn);
      expect(handleRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Sidebar & FileList Component Tests
  // =========================================================================
  describe('Sidebar & FileList Components', () => {
    const mockStaged: GitFileStatus[] = [
      { path: 'src/main.ts', changeType: 'modified', statusCode: 'M ' },
      { path: 'src/new.ts', changeType: 'added', statusCode: 'A ' },
    ];
    const mockUnstaged: GitFileStatus[] = [
      { path: 'docs/guide.md', changeType: 'modified', statusCode: ' M' },
    ];
    const mockUntracked: GitFileStatus[] = [
      { path: 'temp.log', changeType: 'untracked', statusCode: '??' },
    ];

    it('renders sidebar empty state when repoPath is null', () => {
      render(
        <Sidebar
          repoPath={null}
          staged={[]}
          unstaged={[]}
          untracked={[]}
          selectedFile={null}
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getByTestId('sidebar-no-repo')).toBeDefined();
      expect(screen.getByText('No Repository Opened')).toBeDefined();
    });

    it('renders working tree clean state when repository has zero changes', () => {
      render(
        <Sidebar
          repoPath="/workspace/clean-repo"
          staged={[]}
          unstaged={[]}
          untracked={[]}
          selectedFile={null}
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getByTestId('sidebar-clean')).toBeDefined();
      expect(screen.getByText('Working tree clean')).toBeDefined();
    });

    it('renders total changes badge and all three categorized sections', () => {
      render(
        <Sidebar
          repoPath="/workspace/dirty-repo"
          staged={mockStaged}
          unstaged={mockUnstaged}
          untracked={mockUntracked}
          selectedFile={null}
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getByTestId('total-changes-count').textContent).toBe('4');
      expect(screen.getByTestId('staged-section')).toBeDefined();
      expect(screen.getByTestId('unstaged-section')).toBeDefined();
      expect(screen.getByTestId('untracked-section')).toBeDefined();
      expect(screen.getByText('src/main.ts')).toBeDefined();
      expect(screen.getByText('docs/guide.md')).toBeDefined();
      expect(screen.getByText('temp.log')).toBeDefined();
    });

    it('fires onSelectFile callback when clicking a staged file item', () => {
      const handleSelect = vi.fn();
      render(
        <Sidebar
          repoPath="/workspace/dirty-repo"
          staged={mockStaged}
          unstaged={mockUnstaged}
          untracked={mockUntracked}
          selectedFile={null}
          onSelectFile={handleSelect}
        />
      );

      const fileItem = screen.getByTestId('file-item-src/main.ts');
      fireEvent.click(fileItem);
      expect(handleSelect).toHaveBeenCalledWith(mockStaged[0]);
    });

    it('highlights active item when selectedFile matches item path', () => {
      render(
        <Sidebar
          repoPath="/workspace/dirty-repo"
          staged={mockStaged}
          unstaged={mockUnstaged}
          untracked={mockUntracked}
          selectedFile={mockStaged[0]}
          onSelectFile={vi.fn()}
        />
      );

      const fileItem = screen.getByTestId('file-item-src/main.ts');
      expect(fileItem.className).toContain('selected');
    });

    it('renders renamed file indicator showing oldPath arrow newPath', () => {
      const renamed: GitFileStatus[] = [
        { path: 'src/app.tsx', oldPath: 'src/index.tsx', changeType: 'renamed', statusCode: 'R ' },
      ];
      render(
        <FileList
          title="Staged Changes"
          count={1}
          files={renamed}
          sectionId="staged"
          isSelectable={true}
        />
      );

      expect(screen.getByText('src/index.tsx →')).toBeDefined();
      expect(screen.getByText('src/app.tsx')).toBeDefined();
    });
  });

  // =========================================================================
  // DiffViewer Component Tests
  // =========================================================================
  describe('DiffViewer Component', () => {
    const mockFile: GitFileStatus = {
      path: 'src/app.ts',
      changeType: 'modified',
      statusCode: 'M ',
    };

    const mockDiff: GitDiffResult = {
      repoPath: '/workspace/project',
      filePath: 'src/app.ts',
      rawDiff: '@@ -1,2 +1,3 @@\n-old\n+new',
      isBinary: false,
      isEmpty: false,
      hunks: [
        {
          header: '@@ -1,2 +1,3 @@',
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 3,
          lines: [
            { type: 'delete', content: '-old', oldLineNumber: 1 },
            { type: 'add', content: '+new', newLineNumber: 1 },
          ],
        },
      ],
    };

    it('renders empty diff placeholder when no file is selected', () => {
      render(<DiffViewer selectedFile={null} diffResult={null} />);

      expect(screen.getByTestId('diff-placeholder')).toBeDefined();
      expect(screen.getByText('No File Selected')).toBeDefined();
    });

    it('renders loading state when loading is true', () => {
      render(
        <DiffViewer
          selectedFile={mockFile}
          diffResult={null}
          loading={true}
        />
      );

      expect(screen.getByTestId('diff-loading')).toBeDefined();
      expect(screen.getByText('Loading staged diff...')).toBeDefined();
    });

    it('renders diff header, hunk header, line additions, line deletions, and line numbers', () => {
      render(
        <DiffViewer
          selectedFile={mockFile}
          diffResult={mockDiff}
          loading={false}
        />
      );

      expect(screen.getByTestId('diff-header')).toBeDefined();
      expect(screen.getByText('src/app.ts')).toBeDefined();
      expect(screen.getByText('@@ -1,2 +1,3 @@')).toBeDefined();
      expect(screen.getByText('-old')).toBeDefined();
      expect(screen.getByText('+new')).toBeDefined();
    });

    it('renders binary file notice card when diffResult.isBinary is true', () => {
      const binaryDiff: GitDiffResult = {
        repoPath: '/workspace/project',
        filePath: 'logo.png',
        rawDiff: 'Binary files differ',
        isBinary: true,
        isEmpty: false,
        hunks: [],
      };

      render(
        <DiffViewer
          selectedFile={{ path: 'logo.png', changeType: 'modified', statusCode: 'M ' }}
          diffResult={binaryDiff}
        />
      );

      expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
      expect(screen.getByText('Binary file: diff not displayed')).toBeDefined();
      expect(screen.queryByText('@@')).toBeNull();
    });

    it('renders empty file notice card when diffResult.isEmpty is true', () => {
      const emptyDiff: GitDiffResult = {
        repoPath: '/workspace/project',
        filePath: 'empty.txt',
        rawDiff: '',
        isBinary: false,
        isEmpty: true,
        hunks: [],
      };

      render(
        <DiffViewer
          selectedFile={{ path: 'empty.txt', changeType: 'added', statusCode: 'A ' }}
          diffResult={emptyDiff}
        />
      );

      expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
      expect(screen.getByText('Empty file or no content changes')).toBeDefined();
    });
  });

  // =========================================================================
  // EmptyState Component Tests
  // =========================================================================
  describe('EmptyState Component', () => {
    it('renders mode="no-repo" with title, description, and CTA button', () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          mode="no-repo"
          onAction={handleAction}
          actionLabel="Open Repository"
        />
      );

      expect(screen.getByText('No Repository Opened')).toBeDefined();
      const btn = screen.getByTestId('empty-state-action-btn');
      fireEvent.click(btn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });

    it('renders mode="clean-tree" with checkmark icon and text', () => {
      render(<EmptyState mode="clean-tree" />);

      expect(screen.getByTestId('sidebar-clean')).toBeDefined();
      expect(screen.getByText('Working tree clean')).toBeDefined();
    });

    it('renders mode="no-file-selected" with placeholder prompt', () => {
      render(<EmptyState mode="no-file-selected" />);

      expect(screen.getByTestId('diff-placeholder')).toBeDefined();
      expect(screen.getByText('No File Selected')).toBeDefined();
    });
  });

  // =========================================================================
  // ErrorBanner Component Tests
  // =========================================================================
  describe('ErrorBanner Component', () => {
    it('returns null when message is null or empty', () => {
      const { container } = render(
        <ErrorBanner message={null} onDismiss={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders error banner with message and dismiss button', () => {
      const handleDismiss = vi.fn();
      render(
        <ErrorBanner
          message="Failed to execute git status"
          onDismiss={handleDismiss}
        />
      );

      expect(screen.getByTestId('error-banner')).toBeDefined();
      expect(screen.getByText('Failed to execute git status')).toBeDefined();

      const dismissBtn = screen.getByTitle('Dismiss error');
      fireEvent.click(dismissBtn);
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
