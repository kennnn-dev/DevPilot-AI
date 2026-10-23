import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateGitRepository } from '../../src/main/git/repoValidator';
import * as executor from '../../src/main/git/executor';
import fs from 'node:fs';

vi.mock('node:fs', () => ({
  default: {
    statSync: vi.fn(),
  },
}));

vi.mock('../../src/main/git/executor', async () => {
  const actual = await vi.importActual('../../src/main/git/executor');
  return {
    ...actual,
    executeGit: vi.fn(),
  };
});

describe('Repository Validator Unit Tests (src/main/git/repoValidator.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty, null, or whitespace target path', async () => {
    const res1 = await validateGitRepository('');
    expect(res1.isGitRepo).toBe(false);
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain('Repository path must be a non-empty string.');

    const res2 = await validateGitRepository('   ');
    expect(res2.isGitRepo).toBe(false);
    expect(res2.isValid).toBe(false);
    expect(res2.error).toContain('Repository path must be a non-empty string.');
  });

  it('returns clear error when target path does not exist', async () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await validateGitRepository('/path/does/not/exist');
    expect(res.isGitRepo).toBe(false);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Path does not exist.');
  });

  it('returns clear error when target path is a file, not a directory', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);

    const res = await validateGitRepository('/path/to/somefile.txt');
    expect(res.isGitRepo).toBe(false);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Path is a file, not a directory.');
  });

  it('returns canonical rootPath for a valid Git repository root', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(executor.executeGit).mockResolvedValue({
      stdout: 'true\n/home/user/my-repo\n',
      stderr: '',
      exitCode: 0,
    });

    const res = await validateGitRepository('/home/user/my-repo');
    expect(res).toEqual({
      isGitRepo: true,
      isValid: true,
      isBare: false,
      rootPath: '/home/user/my-repo',
    });
  });

  it('resolves canonical rootPath when pointed to a nested subdirectory', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(executor.executeGit).mockResolvedValue({
      stdout: 'true\n/home/user/my-repo\n',
      stderr: '',
      exitCode: 0,
    });

    const res = await validateGitRepository('/home/user/my-repo/src/components');
    expect(res).toEqual({
      isGitRepo: true,
      isValid: true,
      isBare: false,
      rootPath: '/home/user/my-repo',
    });
  });

  it('detects a bare repository and returns specific error', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(executor.executeGit).mockResolvedValue({
      stdout: 'false\n',
      stderr: 'fatal: this operation must be run in a work tree\n',
      exitCode: 128,
    });

    const res = await validateGitRepository('/home/user/bare.git');
    expect(res).toEqual({
      isGitRepo: false,
      isValid: false,
      isBare: true,
      error: 'Repository is bare (no working tree).',
    });
  });

  it('intercepts exit 128 on a non-git directory', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(executor.executeGit).mockResolvedValue({
      stdout: '',
      stderr: 'fatal: not a git repository (or any parent up to mount point /)\n',
      exitCode: 128,
    });

    const res = await validateGitRepository('/home/user/non-git-dir');
    expect(res).toEqual({
      isGitRepo: false,
      isValid: false,
      error: 'Not a git repository.',
    });
  });
});
