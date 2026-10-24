import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/renderer/App';
import type { DevPilotAPI, GitStatusResult, GitDiffResult } from '../../src/shared/types';

describe('DevPilot AI App End-to-End Interactive Flows', () => {
  let mockDevPilot: DevPilotAPI;

  const mockValidStatus: GitStatusResult = {
    repoPath: '/home/user/my-repo',
    branch: 'feature/inspect-git',
    isDetached: false,
    staged: [
      { path: 'src/index.ts', changeType: 'modified', statusCode: 'M ' },
      { path: 'src/newFile.ts', changeType: 'added', statusCode: 'A ' },
    ],
    unstaged: [
      { path: 'README.md', changeType: 'modified', statusCode: ' M' },
    ],
    untracked: [
      { path: 'notes.txt', changeType: 'untracked', statusCode: '??' },
    ],
  };

  const mockDiff: GitDiffResult = {
    repoPath: '/home/user/my-repo',
    filePath: 'src/index.ts',
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

  beforeEach(() => {
    vi.clearAllMocks();

    mockDevPilot = {
      openDirectory: vi.fn(),
      getStatus: vi.fn(),
      getStagedDiff: vi.fn(),
      getAllStagedDiff: vi.fn(),
      generateCommitMessage: vi.fn(),
    };

    Object.defineProperty(window, 'devPilot', {
      value: mockDevPilot,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Flow 1: Initial Render
  it('renders application header, sidebar empty state, diff placeholder, and status bar', () => {
    render(<App />);

    expect(screen.getByTestId('app-container')).toBeDefined();
    expect(screen.getByTestId('app-header')).toBeDefined();
    expect(screen.getByText('DevPilot AI')).toBeDefined();
    expect(screen.getByTestId('open-repo-btn')).toBeDefined();
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByTestId('sidebar-no-repo')).toBeDefined();
    expect(screen.getByTestId('diff-viewer')).toBeDefined();
    expect(screen.getByTestId('diff-placeholder')).toBeDefined();
    expect(screen.getByText('No File Selected')).toBeDefined();
    expect(screen.getByTestId('status-bar')).toBeDefined();
    expect(screen.getByText('Read-Only')).toBeDefined();
    expect(screen.getByText('Standby')).toBeDefined();
  });

  // Flow 2: Open Repository and Display Categorized Changes
  it('loads repository and displays branch, breadcrumb, and categorized changes', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/my-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: mockValidStatus,
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(mockDevPilot.openDirectory).toHaveBeenCalledTimes(1);
      expect(mockDevPilot.getStatus).toHaveBeenCalledWith('/home/user/my-repo');
    });

    await waitFor(() => {
      expect(screen.getByTestId('repo-path').textContent).toContain('/home/user/my-repo');
      expect(screen.getByTestId('branch-badge').textContent).toContain('feature/inspect-git');
      expect(screen.getByTestId('total-changes-count').textContent).toBe('4');
      expect(screen.getByTestId('staged-section')).toBeDefined();
      expect(screen.getByTestId('unstaged-section')).toBeDefined();
      expect(screen.getByTestId('untracked-section')).toBeDefined();
      expect(screen.getByText('src/index.ts')).toBeDefined();
      expect(screen.getByText('README.md')).toBeDefined();
      expect(screen.getByText('notes.txt')).toBeDefined();
      expect(screen.getByText('2 staged, 1 unstaged, 1 untracked')).toBeDefined();
    });
  });

  // Flow 3: Clean Working Tree
  it('displays working tree clean state when opened repository has no changes', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/clean-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: {
        repoPath: '/home/user/clean-repo',
        branch: 'main',
        isDetached: false,
        staged: [],
        unstaged: [],
        untracked: [],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-clean')).toBeDefined();
      expect(screen.getByText('Working tree clean')).toBeDefined();
      expect(screen.getByText('0 staged, 0 unstaged, 0 untracked')).toBeDefined();
    });
  });

  // Flow 4: Detached HEAD Display
  it('displays detached HEAD badge styling when HEAD is detached', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/detached-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: {
        repoPath: '/home/user/detached-repo',
        branch: 'c2e4f6a',
        isDetached: true,
        staged: [],
        unstaged: [],
        untracked: [],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      const badge = screen.getByTestId('branch-badge');
      expect(badge.className).toContain('detached');
      expect(badge.textContent).toContain('c2e4f6a');
    });
  });

  // Flow 5: Select Staged File and Query Staged Diff
  it('queries and displays staged diff when a staged file is clicked', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/my-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: mockValidStatus,
    });
    (mockDevPilot.getStagedDiff as any).mockResolvedValue({
      success: true,
      data: mockDiff,
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByText('src/index.ts')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('file-item-src/index.ts'));

    await waitFor(() => {
      expect(mockDevPilot.getStagedDiff).toHaveBeenCalledWith(
        '/home/user/my-repo',
        'src/index.ts',
        undefined
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('diff-header')).toBeDefined();
      expect(screen.getByText('@@ -1,2 +1,3 @@')).toBeDefined();
      expect(screen.getByText('-old')).toBeDefined();
      expect(screen.getByText('+new')).toBeDefined();
    });
  });

  // Flow 6: Renamed Staged File Diff Request
  it('passes oldPath to getStagedDiff when inspecting a renamed file', async () => {
    const renamedFile = {
      path: 'src/components/Header.tsx',
      oldPath: 'src/Header.tsx',
      changeType: 'renamed' as const,
      statusCode: 'R ',
    };

    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/my-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: {
        ...mockValidStatus,
        staged: [renamedFile],
      },
    });
    (mockDevPilot.getStagedDiff as any).mockResolvedValue({
      success: true,
      data: {
        repoPath: '/home/user/my-repo',
        filePath: 'src/components/Header.tsx',
        rawDiff: '@@ -0,0 +1 @@\n+renamed',
        isBinary: false,
        isEmpty: false,
        hunks: [
          {
            header: '@@ -0,0 +1 @@',
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [{ type: 'add', content: '+renamed', newLineNumber: 1 }],
          },
        ],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('file-item-src/components/Header.tsx')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('file-item-src/components/Header.tsx'));

    await waitFor(() => {
      expect(mockDevPilot.getStagedDiff).toHaveBeenCalledWith(
        '/home/user/my-repo',
        'src/components/Header.tsx',
        'src/Header.tsx'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('renamed from src/Header.tsx')).toBeDefined();
    });
  });

  // Flow 7: Inspecting Binary Staged File
  it('renders binary file notice when inspecting a binary staged file', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/my-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: {
        ...mockValidStatus,
        staged: [
          { path: 'assets/icon.png', changeType: 'modified', statusCode: 'M ' },
        ],
      },
    });
    (mockDevPilot.getStagedDiff as any).mockResolvedValue({
      success: true,
      data: {
        repoPath: '/home/user/my-repo',
        filePath: 'assets/icon.png',
        rawDiff: 'Binary files differ',
        isBinary: true,
        isEmpty: false,
        hunks: [],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('file-item-assets/icon.png')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('file-item-assets/icon.png'));

    await waitFor(() => {
      expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
      expect(screen.getByText('Binary file diff cannot be viewed in text inspector.')).toBeDefined();
    });
  });

  // Flow 8: Inspecting Empty Staged File
  it('renders empty diff notice when inspecting a 0-byte added staged file', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/my-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: {
        ...mockValidStatus,
        staged: [
          { path: 'empty.txt', changeType: 'added', statusCode: 'A ' },
        ],
      },
    });
    (mockDevPilot.getStagedDiff as any).mockResolvedValue({
      success: true,
      data: {
        repoPath: '/home/user/my-repo',
        filePath: 'empty.txt',
        rawDiff: '',
        isBinary: false,
        isEmpty: true,
        hunks: [],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('file-item-empty.txt')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('file-item-empty.txt'));

    await waitFor(() => {
      expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
      expect(screen.getByText('File has zero modified lines or is an empty staged file.')).toBeDefined();
    });
  });

  // Flow 9: Refresh Repository Status
  it('re-queries repository status and re-fetches staged diff on refresh button click', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/my-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: mockValidStatus,
    });
    (mockDevPilot.getStagedDiff as any).mockResolvedValue({
      success: true,
      data: mockDiff,
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('file-item-src/index.ts')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('file-item-src/index.ts'));

    await waitFor(() => {
      expect(screen.getByText('@@ -1,2 +1,3 @@')).toBeDefined();
    });

    // Setup refreshed data
    const refreshedDiff: GitDiffResult = {
      ...mockDiff,
      rawDiff: '@@ -1,3 +1,4 @@\n-old\n+new-updated',
      hunks: [
        {
          header: '@@ -1,3 +1,4 @@',
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 4,
          lines: [{ type: 'add', content: '+new-updated', newLineNumber: 1 }],
        },
      ],
    };

    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: {
        ...mockValidStatus,
        branch: 'feature/refreshed',
      },
    });
    (mockDevPilot.getStagedDiff as any).mockResolvedValue({
      success: true,
      data: refreshedDiff,
    });

    // Click refresh
    fireEvent.click(screen.getByTestId('refresh-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('branch-badge').textContent).toContain('feature/refreshed');
      expect(screen.getByText('+new-updated')).toBeDefined();
    });
  });

  // Flow 10: Non-Git Directory Error Banner & Dismissal
  it('displays error banner when repository query fails and dismisses banner on button click', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/invalid/repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: false,
      error: 'Not a git repository: /invalid/repo',
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeDefined();
      expect(screen.getByText('Not a git repository: /invalid/repo')).toBeDefined();
    });

    const dismissBtn = screen.getByTitle('Dismiss error');
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('error-banner')).toBeNull();
    });
  });

  // Flow 11: Staged Diff Failure Error Banner
  it('displays error banner when getStagedDiff returns an error', async () => {
    (mockDevPilot.openDirectory as any).mockResolvedValue('/home/user/my-repo');
    (mockDevPilot.getStatus as any).mockResolvedValue({
      success: true,
      data: mockValidStatus,
    });
    (mockDevPilot.getStagedDiff as any).mockResolvedValue({
      success: false,
      error: 'Failed to generate diff for src/index.ts: Permission denied',
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('file-item-src/index.ts')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('file-item-src/index.ts'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeDefined();
      expect(
        screen.getByText('Failed to generate diff for src/index.ts: Permission denied')
      ).toBeDefined();
    });
  });

  // Flow 12: Missing Electron Bridge Error
  it('displays error banner if user clicks Open Repository without Electron bridge', async () => {
    delete (window as any).devPilot;

    render(<App />);

    fireEvent.click(screen.getByTestId('open-repo-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeDefined();
      expect(
        screen.getByText(/Electron API not detected|DevPilot API not available/)
      ).toBeDefined();
    });
  });
});
