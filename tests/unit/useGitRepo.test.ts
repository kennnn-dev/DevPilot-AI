import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGitRepo } from '../../src/renderer/hooks/useGitRepo';
import type {
  DevPilotAPI,
  GitStatusResult,
  GitDiffResult,
  GitFileStatus,
} from '../../src/shared/types';

describe('useGitRepo Custom Hook (src/renderer/hooks/useGitRepo.ts)', () => {
  let mockDevPilot: {
    openDirectory: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    getStagedDiff: ReturnType<typeof vi.fn>;
  };

  const defaultMockStatus: GitStatusResult = {
    repoPath: '/workspace/test-repo',
    branch: 'feature/inspect',
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

  const defaultMockDiff: GitDiffResult = {
    repoPath: '/workspace/test-repo',
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
    };

    Object.defineProperty(window, 'devPilot', {
      value: mockDevPilot as unknown as DevPilotAPI,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Initial State
  it('returns expected default initial state before any user actions', () => {
    const { result } = renderHook(() => useGitRepo());

    expect(result.current.repoPath).toBeNull();
    expect(result.current.branch).toBe('');
    expect(result.current.isDetached).toBe(false);
    expect(result.current.staged).toEqual([]);
    expect(result.current.unstaged).toEqual([]);
    expect(result.current.untracked).toEqual([]);
    expect(result.current.selectedFile).toBeNull();
    expect(result.current.diffResult).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.diffLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // 2. Successful Directory Opening
  it('handles successful directory opening and queries repository status', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: defaultMockStatus,
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    expect(mockDevPilot.openDirectory).toHaveBeenCalledTimes(1);
    expect(mockDevPilot.getStatus).toHaveBeenCalledWith('/workspace/test-repo');
    expect(result.current.repoPath).toBe('/workspace/test-repo');
    expect(result.current.branch).toBe('feature/inspect');
    expect(result.current.isDetached).toBe(false);
    expect(result.current.staged.length).toBe(2);
    expect(result.current.unstaged.length).toBe(1);
    expect(result.current.untracked.length).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // 3. User Canceled Directory Dialog
  it('does not invoke getStatus if directory picker is canceled', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    expect(mockDevPilot.openDirectory).toHaveBeenCalledTimes(1);
    expect(mockDevPilot.getStatus).not.toHaveBeenCalled();
    expect(result.current.repoPath).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // 4. Non-Git Directory Error
  it('captures error message when selected folder is not a git repository', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/invalid/path');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: false,
      error: 'Not a git repository: /invalid/path',
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    expect(result.current.repoPath).toBe('/invalid/path');
    expect(result.current.error).toBe('Not a git repository: /invalid/path');
    expect(result.current.staged).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  // 5. loadRepoStatus Direct Call & IPC Exception Handling
  it('handles IPC rejection gracefully inside loadRepoStatus', async () => {
    mockDevPilot.getStatus.mockRejectedValueOnce(new Error('IPC channel timeout'));

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.loadRepoStatus('/some/repo');
    });

    expect(result.current.error).toBe('IPC channel timeout');
    expect(result.current.loading).toBe(false);
    expect(result.current.staged).toEqual([]);
  });

  // 6. Selecting Staged File and Loading Diff
  it('selects staged file and queries staged diff successfully', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: defaultMockStatus,
    });
    mockDevPilot.getStagedDiff.mockResolvedValueOnce({
      success: true,
      data: defaultMockDiff,
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    const stagedFile = result.current.staged[0];

    await act(async () => {
      await result.current.handleSelectFile(stagedFile);
    });

    expect(mockDevPilot.getStagedDiff).toHaveBeenCalledWith(
      '/workspace/test-repo',
      'src/index.ts',
      undefined
    );
    expect(result.current.selectedFile).toEqual(stagedFile);
    expect(result.current.diffResult).toEqual(defaultMockDiff);
    expect(result.current.diffLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // 7. Renamed File with oldPath Passed to getStagedDiff
  it('passes oldPath to getStagedDiff when selecting a renamed file', async () => {
    const renamedFile: GitFileStatus = {
      path: 'src/components/Header.tsx',
      oldPath: 'src/Header.tsx',
      changeType: 'renamed',
      statusCode: 'R ',
    };

    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...defaultMockStatus,
        staged: [renamedFile],
      },
    });
    mockDevPilot.getStagedDiff.mockResolvedValueOnce({
      success: true,
      data: {
        ...defaultMockDiff,
        filePath: 'src/components/Header.tsx',
      },
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    await act(async () => {
      await result.current.handleSelectFile(renamedFile);
    });

    expect(mockDevPilot.getStagedDiff).toHaveBeenCalledWith(
      '/workspace/test-repo',
      'src/components/Header.tsx',
      'src/Header.tsx'
    );
  });

  // 8. Staged Diff Failure Handling
  it('sets error and clears diffResult if getStagedDiff fails', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: defaultMockStatus,
    });
    mockDevPilot.getStagedDiff.mockResolvedValueOnce({
      success: false,
      error: 'Failed to read staged diff for src/index.ts',
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    await act(async () => {
      await result.current.handleSelectFile(result.current.staged[0]);
    });

    expect(result.current.error).toBe('Failed to read staged diff for src/index.ts');
    expect(result.current.diffResult).toBeNull();
    expect(result.current.diffLoading).toBe(false);
  });

  // 9. Staged Diff Promise Rejection
  it('handles staged diff rejection gracefully', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: defaultMockStatus,
    });
    mockDevPilot.getStagedDiff.mockRejectedValueOnce(new Error('Process terminated'));

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    await act(async () => {
      await result.current.handleSelectFile(result.current.staged[0]);
    });

    expect(result.current.error).toBe('Process terminated');
    expect(result.current.diffResult).toBeNull();
    expect(result.current.diffLoading).toBe(false);
  });

  // 10. Refreshing Repository Status (File Remains Staged -> Diff Auto-Refreshes)
  it('refreshes repository status and automatically updates staged diff for selected file', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: defaultMockStatus,
    });
    mockDevPilot.getStagedDiff.mockResolvedValueOnce({
      success: true,
      data: defaultMockDiff,
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    await act(async () => {
      await result.current.handleSelectFile(result.current.staged[0]);
    });

    // Mock refresh responses: status with updated unstaged, and updated diff
    const updatedDiff: GitDiffResult = {
      ...defaultMockDiff,
      rawDiff: '@@ -1,3 +1,4 @@\n-old\n+new\n+added',
    };

    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...defaultMockStatus,
        unstaged: [], // Unstaged changes cleared externally
      },
    });
    mockDevPilot.getStagedDiff.mockResolvedValueOnce({
      success: true,
      data: updatedDiff,
    });

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mockDevPilot.getStatus).toHaveBeenCalledTimes(2);
    expect(mockDevPilot.getStagedDiff).toHaveBeenCalledTimes(2);
    expect(result.current.unstaged.length).toBe(0);
    expect(result.current.selectedFile?.path).toBe('src/index.ts');
    expect(result.current.diffResult?.rawDiff).toBe('@@ -1,3 +1,4 @@\n-old\n+new\n+added');
    expect(result.current.refreshing).toBe(false);
  });

  // 11. Refreshing Repository Status (File Un-staged Externally -> Deselects)
  it('clears selected file and diffResult if selected file is un-staged during refresh', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: defaultMockStatus,
    });
    mockDevPilot.getStagedDiff.mockResolvedValueOnce({
      success: true,
      data: defaultMockDiff,
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    await act(async () => {
      await result.current.handleSelectFile(result.current.staged[0]);
    });

    expect(result.current.selectedFile).not.toBeNull();

    // Mock refresh where src/index.ts is no longer staged
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...defaultMockStatus,
        staged: [
          { path: 'src/newFile.ts', changeType: 'added', statusCode: 'A ' },
        ],
      },
    });

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(result.current.selectedFile).toBeNull();
    expect(result.current.diffResult).toBeNull();
    expect(result.current.refreshing).toBe(false);
  });

  // 12. Refresh with No Repository Opened (No-Op)
  it('does nothing when handleRefresh is called without an opened repository', async () => {
    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mockDevPilot.getStatus).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });

  // 13. Dismiss Error Action
  it('clears active error message when handleDismissError is invoked', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/not/a/git');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: false,
      error: 'Repository not found',
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    expect(result.current.error).toBe('Repository not found');

    act(() => {
      result.current.handleDismissError();
    });

    expect(result.current.error).toBeNull();
  });

  // 14. Missing Electron Bridge Fallback
  it('sets user-facing error message without crashing when window.devPilot is undefined', async () => {
    // Delete window.devPilot
    delete (window as any).devPilot;

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    expect(result.current.error).toContain('DevPilot API not available');
    expect(result.current.loading).toBe(false);
  });

  // 15. Detached HEAD State Handling
  it('captures detached HEAD branch identifier and isDetached flag correctly', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/detached-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: {
        repoPath: '/workspace/detached-repo',
        branch: 'd3b0738',
        isDetached: true,
        staged: [],
        unstaged: [],
        untracked: [],
      },
    });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    expect(result.current.branch).toBe('d3b0738');
    expect(result.current.isDetached).toBe(true);
  });

  // 16. Race condition defense
  it('prevents out-of-order race conditions when rapidly selecting different files', async () => {
    mockDevPilot.openDirectory.mockResolvedValueOnce('/workspace/test-repo');
    mockDevPilot.getStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...defaultMockStatus,
        staged: [
          { path: 'fileA.ts', changeType: 'modified', statusCode: 'M ' },
          { path: 'fileB.ts', changeType: 'modified', statusCode: 'M ' },
        ],
      },
    });

    let resolveDiffA: (val: any) => void = () => {};
    const diffAPromise = new Promise((resolve) => {
      resolveDiffA = resolve;
    });

    mockDevPilot.getStagedDiff
      .mockImplementationOnce(() => diffAPromise)
      .mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/workspace/test-repo',
          filePath: 'fileB.ts',
          rawDiff: 'diff for fileB',
          isBinary: false,
          isEmpty: false,
          hunks: [],
        },
      });

    const { result } = renderHook(() => useGitRepo());

    await act(async () => {
      await result.current.handleOpenDirectory();
    });

    // Rapidly select file A (which delays)
    act(() => {
      result.current.handleSelectFile(result.current.staged[0]);
    });

    // Then immediately select file B (which resolves immediately)
    await act(async () => {
      await result.current.handleSelectFile(result.current.staged[1]);
    });

    expect(result.current.selectedFile?.path).toBe('fileB.ts');
    expect(result.current.diffResult?.filePath).toBe('fileB.ts');

    // Now resolve file A afterwards
    await act(async () => {
      resolveDiffA({
        success: true,
        data: {
          repoPath: '/workspace/test-repo',
          filePath: 'fileA.ts',
          rawDiff: 'diff for fileA',
          isBinary: false,
          isEmpty: false,
          hunks: [],
        },
      });
    });

    // File B diff must STILL be present, not overwritten by File A!
    expect(result.current.selectedFile?.path).toBe('fileB.ts');
    expect(result.current.diffResult?.filePath).toBe('fileB.ts');
  });
});
