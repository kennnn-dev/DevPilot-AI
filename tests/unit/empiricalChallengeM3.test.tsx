import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import App from '../../src/renderer/App';
import Header from '../../src/renderer/components/Header';
import ErrorBanner from '../../src/renderer/components/ErrorBanner';
import { useGitRepo } from '../../src/renderer/hooks/useGitRepo';
import type {
  DevPilotAPI,
  GitStatusResult,
  GitDiffResult,
} from '../../src/shared/types';

describe('Milestone 3 Empirical Challenge Test Suite (UI Interaction & State Transitions)', () => {
  let mockDevPilot: {
    openDirectory: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    getStagedDiff: ReturnType<typeof vi.fn>;
  };

  const sampleRepoPath = '/repo/empirical-challenge';

  const mockMultiStagedStatus: GitStatusResult = {
    repoPath: sampleRepoPath,
    branch: 'main',
    isDetached: false,
    staged: [
      { path: 'src/alpha.ts', changeType: 'modified', statusCode: 'M ' },
      { path: 'src/beta.ts', changeType: 'modified', statusCode: 'M ' },
      { path: 'src/gamma.ts', changeType: 'added', statusCode: 'A ' },
      { path: 'src/delta.ts', changeType: 'deleted', statusCode: 'D ' },
    ],
    unstaged: [
      { path: 'docs/spec.md', changeType: 'modified', statusCode: ' M' },
    ],
    untracked: [
      { path: 'temp.log', changeType: 'untracked', statusCode: '??' },
    ],
  };

  const createDiffResult = (filePath: string, customText: string): GitDiffResult => ({
    repoPath: sampleRepoPath,
    filePath,
    rawDiff: `@@ -1,1 +1,2 @@\n-${filePath}-old\n+${filePath}-new: ${customText}`,
    isBinary: false,
    isEmpty: false,
    hunks: [
      {
        header: '@@ -1,1 +1,2 @@',
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 2,
        lines: [
          { type: 'delete', content: `-${filePath}-old`, oldLineNumber: 1 },
          { type: 'add', content: `+${filePath}-new: ${customText}`, newLineNumber: 1 },
        ],
      },
    ],
  });

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

  // =========================================================================
  // Challenge 1: Race Condition & Out-of-Order Asynchronous Diff Responses
  // =========================================================================
  describe('Challenge 1: Race Condition Testing on activeDiffFileRef', () => {
    it('discards out-of-order diff responses across 4 rapid sequential file selections', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });

      // Controlled deferred promises for diff requests
      let resolveAlpha: (val: any) => void = () => {};
      let resolveBeta: (val: any) => void = () => {};
      let resolveGamma: (val: any) => void = () => {};
      let resolveDelta: (val: any) => void = () => {};

      const pAlpha = new Promise((res) => { resolveAlpha = res; });
      const pBeta = new Promise((res) => { resolveBeta = res; });
      const pGamma = new Promise((res) => { resolveGamma = res; });
      const pDelta = new Promise((res) => { resolveDelta = res; });

      mockDevPilot.getStagedDiff.mockImplementation((_repo: string, filePath: string) => {
        if (filePath === 'src/alpha.ts') return pAlpha;
        if (filePath === 'src/beta.ts') return pBeta;
        if (filePath === 'src/gamma.ts') return pGamma;
        if (filePath === 'src/delta.ts') return pDelta;
        return Promise.reject(new Error(`Unexpected file: ${filePath}`));
      });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      // User rapidly clicks alpha, beta, gamma, delta in sequence
      act(() => {
        result.current.handleSelectFile(result.current.staged[0]); // alpha
      });
      act(() => {
        result.current.handleSelectFile(result.current.staged[1]); // beta
      });
      act(() => {
        result.current.handleSelectFile(result.current.staged[2]); // gamma
      });
      act(() => {
        result.current.handleSelectFile(result.current.staged[3]); // delta
      });

      expect(result.current.selectedFile?.path).toBe('src/delta.ts');
      expect(result.current.diffLoading).toBe(true);

      // Now resolve out-of-order: Gamma first, then Alpha, then Beta
      await act(async () => {
        resolveGamma({
          success: true,
          data: createDiffResult('src/gamma.ts', 'gamma resolved first'),
        });
        resolveAlpha({
          success: true,
          data: createDiffResult('src/alpha.ts', 'alpha resolved second'),
        });
        resolveBeta({
          success: true,
          data: createDiffResult('src/beta.ts', 'beta resolved third'),
        });
      });

      // Still waiting for Delta! Earlier responses must be dropped.
      expect(result.current.selectedFile?.path).toBe('src/delta.ts');
      expect(result.current.diffResult).toBeNull();
      expect(result.current.diffLoading).toBe(true);

      // Now Delta resolves
      await act(async () => {
        resolveDelta({
          success: true,
          data: createDiffResult('src/delta.ts', 'delta finally resolved'),
        });
      });

      expect(result.current.selectedFile?.path).toBe('src/delta.ts');
      expect(result.current.diffResult?.filePath).toBe('src/delta.ts');
      expect(result.current.diffResult?.rawDiff).toContain('delta finally resolved');
      expect(result.current.diffLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('ignores late errors/rejections from superseded diff queries', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });

      let rejectAlpha: (err: any) => void = () => {};
      let resolveBetaFail: (val: any) => void = () => {};
      let resolveGammaSuccess: (val: any) => void = () => {};

      const pAlpha = new Promise((_, rej) => { rejectAlpha = rej; });
      const pBeta = new Promise((res) => { resolveBetaFail = res; });
      const pGamma = new Promise((res) => { resolveGammaSuccess = res; });

      mockDevPilot.getStagedDiff.mockImplementation((_repo: string, filePath: string) => {
        if (filePath === 'src/alpha.ts') return pAlpha;
        if (filePath === 'src/beta.ts') return pBeta;
        if (filePath === 'src/gamma.ts') return pGamma;
        return Promise.reject(new Error(`Unexpected file: ${filePath}`));
      });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      // Rapidly select alpha, beta, gamma
      act(() => { result.current.handleSelectFile(result.current.staged[0]); });
      act(() => { result.current.handleSelectFile(result.current.staged[1]); });
      act(() => { result.current.handleSelectFile(result.current.staged[2]); });

      // Gamma resolves successfully
      await act(async () => {
        resolveGammaSuccess({
          success: true,
          data: createDiffResult('src/gamma.ts', 'gamma success'),
        });
      });

      expect(result.current.selectedFile?.path).toBe('src/gamma.ts');
      expect(result.current.diffResult?.filePath).toBe('src/gamma.ts');
      expect(result.current.error).toBeNull();

      // Now Alpha throws hard rejection, Beta returns { success: false, error: '...' }
      await act(async () => {
        rejectAlpha(new Error('Hard network crash on alpha'));
        resolveBetaFail({ success: false, error: 'Git diff failed for beta' });
      });

      // Stale errors MUST NOT overwrite Gamma's state or pollute error banner!
      expect(result.current.selectedFile?.path).toBe('src/gamma.ts');
      expect(result.current.diffResult?.filePath).toBe('src/gamma.ts');
      expect(result.current.error).toBeNull();
      expect(result.current.diffLoading).toBe(false);
    });

    it('properly discards in-flight diff when switching to a different repository', async () => {
      mockDevPilot.openDirectory
        .mockResolvedValueOnce('/repo/first')
        .mockResolvedValueOnce('/repo/second');

      mockDevPilot.getStatus
        .mockResolvedValueOnce({
          success: true,
          data: {
            repoPath: '/repo/first',
            branch: 'main',
            isDetached: false,
            staged: [{ path: 'file1.ts', changeType: 'modified', statusCode: 'M ' }],
            unstaged: [],
            untracked: [],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            repoPath: '/repo/second',
            branch: 'dev',
            isDetached: false,
            staged: [{ path: 'file2.ts', changeType: 'added', statusCode: 'A ' }],
            unstaged: [],
            untracked: [],
          },
        });

      let resolveDiffFirst: (val: any) => void = () => {};
      const diffFirstPromise = new Promise((res) => { resolveDiffFirst = res; });
      mockDevPilot.getStagedDiff.mockImplementation(() => diffFirstPromise);

      const { result } = renderHook(() => useGitRepo());

      // Open first repo
      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      // Start fetching diff in first repo (delayed)
      act(() => {
        result.current.handleSelectFile(result.current.staged[0]);
      });
      expect(result.current.diffLoading).toBe(true);

      // Now open second repo before diff finishes
      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      expect(result.current.repoPath).toBe('/repo/second');
      expect(result.current.selectedFile).toBeNull();
      expect(result.current.diffResult).toBeNull();

      // Now first diff resolves late
      await act(async () => {
        resolveDiffFirst({
          success: true,
          data: createDiffResult('file1.ts', 'late first diff'),
        });
      });

      // Second repo must NOT receive old diff from first repo!
      expect(result.current.repoPath).toBe('/repo/second');
      expect(result.current.selectedFile).toBeNull();
      expect(result.current.diffResult).toBeNull();
    });
  });

  // =========================================================================
  // Challenge 2: Dynamic State Transitions & Folder Picker Cancellation
  // =========================================================================
  describe('Challenge 2: Folder Picker Cancellation Robustness', () => {
    it('preserves entire existing repo state and diff when directory dialog is canceled (returns null)', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: createDiffResult('src/alpha.ts', 'active diff'),
      });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });
      await act(async () => {
        await result.current.handleSelectFile(result.current.staged[0]);
      });

      expect(result.current.repoPath).toBe(sampleRepoPath);
      expect(result.current.selectedFile?.path).toBe('src/alpha.ts');
      expect(result.current.diffResult?.filePath).toBe('src/alpha.ts');

      // User triggers open folder again, but clicks Cancel in native dialog
      mockDevPilot.openDirectory.mockResolvedValueOnce(null);

      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      // Everything must be preserved unchanged
      expect(result.current.repoPath).toBe(sampleRepoPath);
      expect(result.current.branch).toBe('main');
      expect(result.current.staged.length).toBe(4);
      expect(result.current.selectedFile?.path).toBe('src/alpha.ts');
      expect(result.current.diffResult?.filePath).toBe('src/alpha.ts');
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it('handles undefined or empty string from openDirectory without clearing state or throwing', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      expect(result.current.repoPath).toBe(sampleRepoPath);

      // Dialog returns undefined
      mockDevPilot.openDirectory.mockResolvedValueOnce(undefined as any);
      await act(async () => {
        await result.current.handleOpenDirectory();
      });
      expect(result.current.repoPath).toBe(sampleRepoPath);

      // Dialog returns empty string
      mockDevPilot.openDirectory.mockResolvedValueOnce('' as any);
      await act(async () => {
        await result.current.handleOpenDirectory();
      });
      expect(result.current.repoPath).toBe(sampleRepoPath);
      expect(result.current.error).toBeNull();
    });

    it('retains UI state on cancellation during full App component interaction', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: createDiffResult('src/alpha.ts', 'full app alpha diff'),
      });

      render(<App />);

      // Open repository
      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('repo-path')).toBeDefined();
        expect(screen.getByText('src/alpha.ts')).toBeDefined();
      });

      // Select staged file
      fireEvent.click(screen.getByTestId('file-item-src/alpha.ts'));

      await waitFor(() => {
        expect(screen.getByTestId('diff-header')).toBeDefined();
        expect(screen.getByText('full app alpha diff', { exact: false })).toBeDefined();
      });

      // Now click Open Folder again and simulate native Cancel
      mockDevPilot.openDirectory.mockResolvedValueOnce(null);
      fireEvent.click(screen.getByTestId('open-repo-btn'));

      // Assert diff and repo remain visible in DOM
      expect(screen.getByTestId('repo-path')).toBeDefined();
      expect(screen.getByText('full app alpha diff', { exact: false })).toBeDefined();
      expect(screen.queryByTestId('error-banner')).toBeNull();
    });
  });

  // =========================================================================
  // Challenge 3: Manual Refresh State Retention & Cleanup Oracles
  // =========================================================================
  describe('Challenge 3: Manual Refresh Synchronization Oracles', () => {
    it('synchronizes diff content when selected file remains staged with updated changes', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: createDiffResult('src/alpha.ts', 'version 1 diff'),
      });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });
      await act(async () => {
        await result.current.handleSelectFile(result.current.staged[0]);
      });

      expect(result.current.diffResult?.rawDiff).toContain('version 1 diff');

      // External edit and staged update
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: createDiffResult('src/alpha.ts', 'version 2 updated diff'),
      });

      await act(async () => {
        await result.current.handleRefresh();
      });

      expect(result.current.selectedFile?.path).toBe('src/alpha.ts');
      expect(result.current.diffResult?.rawDiff).toContain('version 2 updated diff');
      expect(result.current.refreshing).toBe(false);
    });

    it('cleans up selectedFile and diffResult when selected file is un-staged externally', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: createDiffResult('src/alpha.ts', 'alpha diff'),
      });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });
      await act(async () => {
        await result.current.handleSelectFile(result.current.staged[0]);
      });

      expect(result.current.selectedFile?.path).toBe('src/alpha.ts');
      expect(result.current.diffResult).not.toBeNull();

      // Externally unstaged: staged list now excludes src/alpha.ts
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: {
          ...mockMultiStagedStatus,
          staged: [
            { path: 'src/beta.ts', changeType: 'modified', statusCode: 'M ' },
          ],
        },
      });

      await act(async () => {
        await result.current.handleRefresh();
      });

      expect(result.current.selectedFile).toBeNull();
      expect(result.current.diffResult).toBeNull();
      expect(result.current.staged.length).toBe(1);
    });

    it('transitions to clean tree empty state when all changes are committed externally', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });

      render(<App />);

      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('total-changes-count').textContent).toBe('6');
      });

      // External commit makes worktree 100% clean
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: sampleRepoPath,
          branch: 'main',
          isDetached: false,
          staged: [],
          unstaged: [],
          untracked: [],
        },
      });

      fireEvent.click(screen.getByTestId('refresh-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-clean')).toBeDefined();
        expect(screen.getByText('Working tree clean')).toBeDefined();
        expect(screen.getByText('0 staged, 0 unstaged, 0 untracked')).toBeDefined();
      });
    });

    it('debounces concurrent refresh calls while already refreshing', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });

      let resolveRefresh: (val: any) => void = () => {};
      const refreshPromise = new Promise((res) => { resolveRefresh = res; });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      mockDevPilot.getStatus.mockImplementation(() => refreshPromise);

      // Trigger first refresh (in flight)
      act(() => {
        result.current.handleRefresh();
      });

      expect(result.current.refreshing).toBe(true);

      // Trigger second and third refresh calls while still refreshing
      act(() => {
        result.current.handleRefresh();
      });
      act(() => {
        result.current.handleRefresh();
      });

      // getStatus should only have been called once for initial open, and once for refresh!
      expect(mockDevPilot.getStatus).toHaveBeenCalledTimes(2);

      // Finish refresh
      await act(async () => {
        resolveRefresh({
          success: true,
          data: mockMultiStagedStatus,
        });
      });

      expect(result.current.refreshing).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 4: Detached HEAD Formatting and Branch Badge Styling
  // =========================================================================
  describe('Challenge 4: Detached HEAD Formatting and Branch Badge Styling', () => {
    it('formats detached HEAD with (HEAD detached at <sha>) and applies .detached CSS class', () => {
      render(
        <Header
          repoPath="/workspace/detached"
          branch="e4d9b2a"
          isDetached={true}
          refreshing={false}
          onRefresh={vi.fn()}
        />
      );

      const badge = screen.getByTestId('branch-badge');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('branch-badge');
      expect(badge.className).toContain('detached');
      expect(badge.textContent).toBe('(HEAD detached at e4d9b2a)');
      expect(badge.getAttribute('title')).toBe('Detached HEAD at commit e4d9b2a');
    });

    it('formats normal attached branch without prefix or .detached CSS class', () => {
      render(
        <Header
          repoPath="/workspace/normal"
          branch="feature/empirical-review"
          isDetached={false}
          refreshing={false}
          onRefresh={vi.fn()}
        />
      );

      const badge = screen.getByTestId('branch-badge');
      expect(badge).toBeDefined();
      expect(badge.className).toBe('branch-badge ');
      expect(badge.className).not.toContain('detached');
      expect(badge.textContent).toBe('feature/empirical-review');
      expect(badge.getAttribute('title')).toBe('Active Branch: feature/empirical-review');
    });

    it('does not render branch badge if branch is null or empty string', () => {
      const { rerender } = render(
        <Header
          repoPath="/workspace/empty-branch"
          branch=""
          isDetached={false}
          refreshing={false}
          onRefresh={vi.fn()}
        />
      );

      expect(screen.queryByTestId('branch-badge')).toBeNull();

      rerender(
        <Header
          repoPath="/workspace/null-branch"
          branch={null}
          isDetached={false}
          refreshing={false}
          onRefresh={vi.fn()}
        />
      );

      expect(screen.queryByTestId('branch-badge')).toBeNull();
    });
  });

  // =========================================================================
  // Challenge 5: Error Banner Dismissal & Error Recovery
  // =========================================================================
  describe('Challenge 5: Error Dismissal via Banner Close Button', () => {
    it('renders error message with close button, and dismisses on click', () => {
      const handleDismiss = vi.fn();
      const { rerender } = render(
        <ErrorBanner
          message="Critical: git command timed out"
          onDismiss={handleDismiss}
        />
      );

      const banner = screen.getByTestId('error-banner');
      expect(banner).toBeDefined();
      expect(banner.getAttribute('role')).toBe('alert');
      expect(screen.getByText('Critical: git command timed out')).toBeDefined();

      const dismissBtn = banner.querySelector('.btn-dismiss');
      expect(dismissBtn).not.toBeNull();

      fireEvent.click(dismissBtn!);
      expect(handleDismiss).toHaveBeenCalledTimes(1);

      // Parent updates message to null -> Banner is unmounted
      rerender(<ErrorBanner message={null} onDismiss={handleDismiss} />);
      expect(screen.queryByTestId('error-banner')).toBeNull();
    });

    it('recovers from error state in full App lifecycle via banner dismissal', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce('/not/a/git/repo');
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: false,
        error: 'fatal: not a git repository (or any of the parent directories): .git',
      });

      render(<App />);

      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error-banner')).toBeDefined();
        expect(screen.getByText(/fatal: not a git repository/)).toBeDefined();
      });

      // Click dismiss button
      const dismissBtn = screen.getByTestId('error-banner').querySelector('.btn-dismiss');
      expect(dismissBtn).toBeDefined();
      fireEvent.click(dismissBtn!);

      // Error banner should disappear
      await waitFor(() => {
        expect(screen.queryByTestId('error-banner')).toBeNull();
      });

      // Subsequent valid open works normally
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });

      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('repo-path')).toBeDefined();
        expect(screen.queryByTestId('error-banner')).toBeNull();
      });
    });
  });

  // =========================================================================
  // Challenge 6: Binary Diff, Empty Diff & Partial Staging Representation
  // =========================================================================
  describe('Challenge 6: Binary Diff, Empty Diff & Partial Staging UI Representation', () => {
    it('renders binary notice when staged diff indicates isBinary: true', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: {
          ...mockMultiStagedStatus,
          staged: [
            { path: 'assets/logo.png', changeType: 'added', statusCode: 'A ' },
          ],
        },
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: sampleRepoPath,
          filePath: 'assets/logo.png',
          rawDiff: 'Binary files differ',
          isBinary: true,
          isEmpty: false,
          hunks: [],
        },
      });

      render(<App />);

      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByText('assets/logo.png')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('file-item-assets/logo.png'));

      await waitFor(() => {
        expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
        expect(screen.getByText('Binary file: diff not displayed')).toBeDefined();
        expect(screen.getByText('Binary File')).toBeDefined();
      });
    });

    it('renders empty diff notice when staged diff indicates isEmpty: true', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: {
          ...mockMultiStagedStatus,
          staged: [
            { path: 'empty.txt', changeType: 'added', statusCode: 'A ' },
          ],
        },
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: sampleRepoPath,
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
        expect(screen.getByText('empty.txt')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('file-item-empty.txt'));

      await waitFor(() => {
        expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
        expect(screen.getByText('Empty file or no content changes')).toBeDefined();
        expect(screen.getByText('Empty Diff')).toBeDefined();
      });
    });

    it('displays partially staged files (MM, AM) with distinct status badge tags', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: sampleRepoPath,
          branch: 'main',
          isDetached: false,
          staged: [
            { path: 'both.ts', changeType: 'modified', statusCode: 'MM' },
          ],
          unstaged: [
            { path: 'both.ts', changeType: 'modified', statusCode: 'MM' },
          ],
          untracked: [],
        },
      });

      render(<App />);

      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        const fileItems = screen.getAllByTestId('file-item-both.ts');
        expect(fileItems.length).toBe(2);
        // Staged is selectable, unstaged has readonly style
        expect(fileItems[0].className).not.toContain('file-item-readonly');
        expect(fileItems[1].className).toContain('file-item-readonly');
      });
    });
  });

  // =========================================================================
  // Challenge 7: In-flight Diff vs External Unstage During Refresh Interleaving
  // =========================================================================
  describe('Challenge 7: In-Flight Diff Interleaving with External Unstage During Refresh', () => {
    it('discards an in-flight diff request when refresh simultaneously unstages the file', async () => {
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: mockMultiStagedStatus,
      });

      let resolveAlphaDiff: (val: any) => void = () => {};
      const alphaDiffPromise = new Promise((res) => { resolveAlphaDiff = res; });

      mockDevPilot.getStagedDiff.mockImplementation((_repo: string, filePath: string) => {
        if (filePath === 'src/alpha.ts') return alphaDiffPromise;
        return Promise.resolve({ success: true, data: createDiffResult(filePath, 'fast') });
      });

      const { result } = renderHook(() => useGitRepo());

      await act(async () => {
        await result.current.handleOpenDirectory();
      });

      // User selects alpha -> diff is now in flight
      act(() => {
        result.current.handleSelectFile(result.current.staged[0]);
      });
      expect(result.current.diffLoading).toBe(true);

      // Meanwhile, user triggers refresh; status returns alpha NO LONGER STAGED
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: {
          ...mockMultiStagedStatus,
          staged: [
            { path: 'src/beta.ts', changeType: 'modified', statusCode: 'M ' },
          ],
        },
      });

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Refresh finished: selectedFile and diffResult must be null
      expect(result.current.selectedFile).toBeNull();
      expect(result.current.diffResult).toBeNull();

      // Now earlier alpha diff resolves late
      await act(async () => {
        resolveAlphaDiff({
          success: true,
          data: createDiffResult('src/alpha.ts', 'late alpha diff'),
        });
      });

      // Must NOT resurrect alpha!
      expect(result.current.selectedFile).toBeNull();
      expect(result.current.diffResult).toBeNull();
    });
  });

  // =========================================================================
  // Challenge 8: Path Encoding & Unicode / Spaces Robustness
  // =========================================================================
  describe('Challenge 8: Path Encoding & Unicode Stress Testing', () => {
    it('safely handles file paths containing spaces, brackets, and international characters', async () => {
      const specialPath = 'src/components/모듈 [Special] & #1 (v2).tsx';
      mockDevPilot.openDirectory.mockResolvedValueOnce(sampleRepoPath);
      mockDevPilot.getStatus.mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: sampleRepoPath,
          branch: 'main',
          isDetached: false,
          staged: [
            { path: specialPath, changeType: 'added', statusCode: 'A ' },
          ],
          unstaged: [],
          untracked: [],
        },
      });
      mockDevPilot.getStagedDiff.mockResolvedValueOnce({
        success: true,
        data: createDiffResult(specialPath, 'unicode diff content'),
      });

      render(<App />);

      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId(`file-item-${specialPath}`)).toBeDefined();
      });

      fireEvent.click(screen.getByTestId(`file-item-${specialPath}`));

      await waitFor(() => {
        expect(mockDevPilot.getStagedDiff).toHaveBeenCalled();
        const diffHeader = screen.getByTestId('diff-header');
        expect(diffHeader).toBeDefined();
        expect(diffHeader.textContent).toContain(specialPath);
        expect(screen.getByText('unicode diff content', { exact: false })).toBeDefined();
      });
    });
  });
});
