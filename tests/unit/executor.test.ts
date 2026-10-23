import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGit, GitExecutionError, DEFAULT_MAX_BUFFER, DEFAULT_TIMEOUT_MS } from '../../src/main/git/executor';
import childProcess from 'node:child_process';
import fs from 'node:fs';

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    default: {
      ...actual,
      execFile: mockExecFile,
    },
    execFile: mockExecFile,
  };
});

vi.mock('node:fs', () => ({
  default: {
    statSync: vi.fn(),
  },
}));

describe('Git Executor Unit Tests (src/main/git/executor.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid or empty cwd without executing subprocess', async () => {
    await expect(executeGit(['status'], { cwd: '' })).rejects.toThrow(GitExecutionError);
    await expect(executeGit(['status'], { cwd: '   ' })).rejects.toThrow(
      'Working directory (cwd) must be a non-empty string.'
    );
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it('throws GitExecutionError when cwd does not exist on filesystem', async () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    await expect(executeGit(['status'], { cwd: '/non/existent/path' })).rejects.toThrow(
      'Working directory does not exist: /non/existent/path'
    );
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it('throws GitExecutionError when cwd is a file, not a directory', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);

    await expect(executeGit(['status'], { cwd: '/path/to/file.txt' })).rejects.toThrow(
      'Working directory is not a directory: /path/to/file.txt'
    );
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it('executes git with hardened environment variables (LC_ALL, GIT_TERMINAL_PROMPT, PAGER)', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(childProcess.execFile).mockImplementation((_bin, _args, _opts, callback: any) => {
      callback(null, 'git version 2.53.0\n', '');
      return {} as any;
    });

    const result = await executeGit(['--version'], { cwd: '/mock/repo' });

    expect(result.stdout).toBe('git version 2.53.0\n');
    expect(result.exitCode).toBe(0);

    const callArgs = vi.mocked(childProcess.execFile).mock.calls[0];
    expect(callArgs[0]).toBe('git');
    expect(callArgs[1]).toEqual(['--version']);
    const options = callArgs[2] as childProcess.ExecFileOptions;
    expect(options.cwd).toBe('/mock/repo');
    expect(options.maxBuffer).toBe(DEFAULT_MAX_BUFFER);
    expect(options.timeout).toBe(DEFAULT_TIMEOUT_MS);
    expect(options.env?.LC_ALL).toBe('C.UTF-8');
    expect(options.env?.GIT_TERMINAL_PROMPT).toBe('0');
    expect(options.env?.GIT_PAGER).toBe('cat');
    expect(options.env?.PAGER).toBe('cat');
  });

  it('suppresses non-zero exit code throwing when ignoreExitCode is true', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(childProcess.execFile).mockImplementation((_bin, _args, _opts, callback: any) => {
      const err: any = new Error('Command failed');
      err.code = 128;
      err.stdout = '';
      err.stderr = 'fatal: not a git repository\n';
      callback(err, '', 'fatal: not a git repository\n');
      return {} as any;
    });

    const result = await executeGit(['rev-parse'], { cwd: '/mock/repo', ignoreExitCode: true });

    expect(result.exitCode).toBe(128);
    expect(result.stderr).toContain('fatal: not a git repository');
  });

  it('throws descriptive error when Git binary is missing (ENOENT)', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(childProcess.execFile).mockImplementation((_bin, _args, _opts, callback: any) => {
      const err: any = new Error('spawn git ENOENT');
      err.code = 'ENOENT';
      callback(err, '', '');
      return {} as any;
    });

    const promise = executeGit(['status'], { cwd: '/mock/repo' });
    await expect(promise).rejects.toThrow(
      'Git binary not found. Please ensure Git is installed and available in PATH.'
    );
  });

  it('throws descriptive error on command timeout', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(childProcess.execFile).mockImplementation((_bin, _args, _opts, callback: any) => {
      const err: any = new Error('Command timed out');
      err.killed = true;
      err.signal = 'SIGTERM';
      callback(err, '', '');
      return {} as any;
    });

    await expect(executeGit(['diff'], { cwd: '/mock/repo', timeout: 5000 })).rejects.toThrow(
      'Git command timed out after 5000ms: git diff'
    );
  });

  it('throws descriptive error on maxBuffer overflow', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(childProcess.execFile).mockImplementation((_bin, _args, _opts, callback: any) => {
      const err: any = new Error('maxBuffer length exceeded');
      err.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
      callback(err, '', '');
      return {} as any;
    });

    await expect(executeGit(['log'], { cwd: '/mock/repo' })).rejects.toThrow(
      'Git command output exceeded maximum buffer limit (10485760 bytes).'
    );
  });
});
