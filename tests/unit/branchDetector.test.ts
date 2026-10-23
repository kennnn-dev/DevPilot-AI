import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectBranch } from '../../src/main/git/branchDetector';
import * as executor from '../../src/main/git/executor';

vi.mock('../../src/main/git/executor', async () => {
  const actual = await vi.importActual('../../src/main/git/executor');
  return {
    ...actual,
    executeGit: vi.fn(),
  };
});

describe('Branch Detector Unit Tests (src/main/git/branchDetector.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects standard active branch name with commits', async () => {
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: 'main\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await detectBranch('/mock/repo');
    expect(result).toEqual({
      branch: 'main',
      isDetached: false,
    });
  });

  it('detects branch names containing slashes (feature/auth-provider)', async () => {
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: 'feature/auth-provider\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await detectBranch('/mock/repo');
    expect(result).toEqual({
      branch: 'feature/auth-provider',
      isDetached: false,
    });
  });

  it('handles unborn branch (0 commits) cleanly via branch --show-current', async () => {
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: 'main\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await detectBranch('/mock/empty-repo');
    expect(result).toEqual({
      branch: 'main',
      isDetached: false,
    });
  });

  it('handles detached HEAD state by resolving short commit SHA', async () => {
    // 1. branch --show-current returns empty string
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: '\n',
      stderr: '',
      exitCode: 0,
    });

    // 2. rev-parse --short HEAD returns short SHA
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: 'abc1234\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await detectBranch('/mock/repo');
    expect(result).toEqual({
      branch: '(HEAD detached at abc1234)',
      isDetached: true,
      commitSha: 'abc1234',
    });
  });

  it('handles unborn branch fallback when branch --show-current returns empty', async () => {
    // 1. branch --show-current returns empty
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    // 2. rev-parse --short HEAD fails (exit 128: no commits)
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: '',
      stderr: 'fatal: Needed a single revision',
      exitCode: 128,
    });

    // 3. symbolic-ref --short HEAD returns branch name
    vi.mocked(executor.executeGit).mockResolvedValueOnce({
      stdout: 'master\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await detectBranch('/mock/unborn-repo');
    expect(result).toEqual({
      branch: 'master',
      isDetached: false,
    });
  });

  it('falls back to HEAD if all branch queries fail', async () => {
    vi.mocked(executor.executeGit).mockResolvedValue({
      stdout: '',
      stderr: 'fatal error',
      exitCode: 128,
    });

    const result = await detectBranch('/mock/corrupt-repo');
    expect(result).toEqual({
      branch: 'HEAD',
      isDetached: false,
    });
  });
});
