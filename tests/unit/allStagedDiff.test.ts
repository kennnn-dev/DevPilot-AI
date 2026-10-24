import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllStagedDiff } from '../../src/main/git/diffService';
import * as executorModule from '../../src/main/git/executor';

vi.mock('../../src/main/git/executor');

describe('getAllStagedDiff (src/main/git/diffService.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error if options or repoPath is invalid', async () => {
    await expect(getAllStagedDiff(null as any)).rejects.toThrow('Repository path must be a non-empty string.');
    await expect(getAllStagedDiff({ repoPath: '' })).rejects.toThrow('Repository path must be a non-empty string.');
    await expect(getAllStagedDiff({ repoPath: '   ' })).rejects.toThrow('Repository path must be a non-empty string.');
    await expect(getAllStagedDiff({ repoPath: 123 as any })).rejects.toThrow('Repository path must be a non-empty string.');
  });

  it('retrieves and parses complete staged diff and metrics for repository', async () => {
    const mockDiff = [
      'diff --git a/src/index.ts b/src/index.ts',
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -1,3 +1,4 @@',
      ' context line',
      '+added line 1',
      '+added line 2',
      '-deleted line 1',
    ].join('\n');

    const mockPorcelain = 'M  src/index.ts\0';

    vi.spyOn(executorModule, 'executeGit').mockImplementation(async (args) => {
      if (args[0] === 'diff') {
        return { stdout: mockDiff, stderr: '', exitCode: 0 };
      }
      if (args[0] === 'status') {
        return { stdout: mockPorcelain, stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await getAllStagedDiff({ repoPath: '/mock/repo' });

    expect(result.repoPath).toBe('/mock/repo');
    expect(result.rawDiff).toBe(mockDiff);
    expect(result.stagedFiles).toHaveLength(1);
    expect(result.stagedFiles[0].path).toBe('src/index.ts');
    expect(result.stagedFiles[0].changeType).toBe('modified');
    expect(result.summary.filesChanged).toBe(1);
    expect(result.summary.insertions).toBe(2);
    expect(result.summary.deletions).toBe(1);
    expect(result.isEmpty).toBe(false);
  });

  it('flags isEmpty as true when no staged files exist', async () => {
    vi.spyOn(executorModule, 'executeGit').mockImplementation(async (args) => {
      if (args[0] === 'diff') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args[0] === 'status') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await getAllStagedDiff({ repoPath: '/mock/repo' });
    expect(result.isEmpty).toBe(true);
    expect(result.stagedFiles).toHaveLength(0);
    expect(result.summary.filesChanged).toBe(0);
    expect(result.summary.insertions).toBe(0);
    expect(result.summary.deletions).toBe(0);
  });

  it('detects binary file diffs correctly', async () => {
    const mockDiff = 'Binary files a/assets/icon.png and b/assets/icon.png differ\n';
    const mockPorcelain = 'A  assets/icon.png\0';

    vi.spyOn(executorModule, 'executeGit').mockImplementation(async (args) => {
      if (args[0] === 'diff') {
        return { stdout: mockDiff, stderr: '', exitCode: 0 };
      }
      if (args[0] === 'status') {
        return { stdout: mockPorcelain, stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await getAllStagedDiff({ repoPath: '/mock/repo' });
    expect(result.isEmpty).toBe(false);
    expect(result.stagedFiles).toHaveLength(1);
  });
});
