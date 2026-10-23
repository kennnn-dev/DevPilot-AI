import { execFile, type ExecFileOptions } from 'node:child_process';
import fs from 'node:fs';

function execFilePromise(
  file: string,
  args: string[],
  options: ExecFileOptions
): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        const errWithOutput = error as { stdout?: string | Buffer; stderr?: string | Buffer };
        if (!errWithOutput.stdout) errWithOutput.stdout = stdout;
        if (!errWithOutput.stderr) errWithOutput.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Standard execution result from Git CLI.
 */
export interface GitExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Configuration options for executing Git commands.
 */
export interface GitExecutorOptions {
  /** Working directory for Git execution (must exist and be a directory) */
  cwd: string;
  /** Maximum buffer size in bytes for stdout/stderr (default: 10MB) */
  maxBuffer?: number;
  /** Timeout in milliseconds before process is terminated (default: 15s) */
  timeout?: number;
  /** Additional or overriding environment variables */
  env?: NodeJS.ProcessEnv;
  /** Executable binary path or command name (default: 'git') */
  gitBinary?: string;
  /** When true, non-zero exit codes return GitExecutionResult instead of throwing */
  ignoreExitCode?: boolean;
}

/**
 * Strongly typed error representing a Git CLI failure.
 */
export class GitExecutionError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly cwd: string;
  readonly exitCode?: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly code?: string;

  constructor(params: {
    message: string;
    command: string;
    args: string[];
    cwd: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    code?: string;
  }) {
    super(params.message);
    this.name = 'GitExecutionError';
    this.command = params.command;
    this.args = params.args;
    this.cwd = params.cwd;
    this.exitCode = params.exitCode;
    this.stdout = params.stdout ?? '';
    this.stderr = params.stderr ?? '';
    this.code = params.code;

    // Preserve prototype chain across ESM/CJS compilation boundaries
    Object.setPrototypeOf(this, GitExecutionError.prototype);
  }
}

export const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10MB
export const DEFAULT_TIMEOUT_MS = 15000; // 15 seconds
export const DEFAULT_GIT_BINARY = 'git';

/**
 * Safely executes a Git command using execFile with strict security hardening.
 *
 * Security & Guardrails:
 * - Uses child_process.execFile (never exec) to avoid shell interpolation.
 * - Enforces UTF-8 encoding and standard English messages via LC_ALL: 'C.UTF-8'.
 * - Disables interactive credentials prompts via GIT_TERMINAL_PROMPT: '0'.
 * - Disables pagers via GIT_PAGER: 'cat' and PAGER: 'cat'.
 * - Enforces default 10MB maxBuffer and 15s timeout.
 */
export async function executeGit(
  args: string[],
  options: GitExecutorOptions
): Promise<GitExecutionResult> {
  const {
    cwd,
    maxBuffer = DEFAULT_MAX_BUFFER,
    timeout = DEFAULT_TIMEOUT_MS,
    env: customEnv = {},
    gitBinary = DEFAULT_GIT_BINARY,
    ignoreExitCode = false,
  } = options;

  if (!cwd || typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new GitExecutionError({
      message: 'Working directory (cwd) must be a non-empty string.',
      command: gitBinary,
      args,
      cwd: cwd ?? '',
    });
  }

  // Pre-validate filesystem path to distinguish directory absence from missing binary
  try {
    const stats = fs.statSync(cwd);
    if (!stats.isDirectory()) {
      throw new GitExecutionError({
        message: `Working directory is not a directory: ${cwd}`,
        command: gitBinary,
        args,
        cwd,
        code: 'ENOTDIR',
      });
    }
  } catch (fsErr: unknown) {
    if (fsErr instanceof GitExecutionError) {
      throw fsErr;
    }
    throw new GitExecutionError({
      message: `Working directory does not exist: ${cwd}`,
      command: gitBinary,
      args,
      cwd,
      code: 'ENOENT',
    });
  }

  const safeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    LC_ALL: 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    ...customEnv,
  };

  const execOptions: ExecFileOptions = {
    cwd,
    maxBuffer,
    timeout,
    env: safeEnv,
    windowsHide: true,
  };

  try {
    const { stdout, stderr } = await execFilePromise(gitBinary, args, execOptions);
    return {
      stdout: typeof stdout === 'string' ? stdout : stdout.toString('utf-8'),
      stderr: typeof stderr === 'string' ? stderr : stderr.toString('utf-8'),
      exitCode: 0,
    };
  } catch (err: unknown) {
    const errorObj = err as {
      code?: number | string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
      killed?: boolean;
      signal?: string;
    };

    const stdout = errorObj.stdout
      ? typeof errorObj.stdout === 'string'
        ? errorObj.stdout
        : errorObj.stdout.toString('utf-8')
      : '';
    const stderr = errorObj.stderr
      ? typeof errorObj.stderr === 'string'
        ? errorObj.stderr
        : errorObj.stderr.toString('utf-8')
      : '';
    const exitCode = typeof errorObj.code === 'number' ? errorObj.code : undefined;
    const errorCode = typeof errorObj.code === 'string' ? errorObj.code : undefined;

    if (ignoreExitCode && exitCode !== undefined) {
      return {
        stdout,
        stderr,
        exitCode,
      };
    }

    if (errorCode === 'ENOENT') {
      throw new GitExecutionError({
        message: 'Git binary not found. Please ensure Git is installed and available in PATH.',
        command: gitBinary,
        args,
        cwd,
        code: 'ENOENT',
        stdout,
        stderr,
      });
    }

    if (errorObj.killed || errorObj.signal === 'SIGTERM' || errorCode === 'ETIMEDOUT') {
      throw new GitExecutionError({
        message: `Git command timed out after ${timeout}ms: ${gitBinary} ${args.join(' ')}`,
        command: gitBinary,
        args,
        cwd,
        code: 'ETIMEDOUT',
        stdout,
        stderr,
      });
    }

    if (errorCode === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      throw new GitExecutionError({
        message: `Git command output exceeded maximum buffer limit (${maxBuffer} bytes).`,
        command: gitBinary,
        args,
        cwd,
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        stdout,
        stderr,
      });
    }

    const rawError = stderr.trim() || stdout.trim() || errorObj.message || 'Unknown error';
    throw new GitExecutionError({
      message: `Git execution failed (exit ${exitCode ?? 'unknown'}): ${rawError}`,
      command: gitBinary,
      args,
      cwd,
      exitCode,
      code: errorCode,
      stdout,
      stderr,
    });
  }
}
