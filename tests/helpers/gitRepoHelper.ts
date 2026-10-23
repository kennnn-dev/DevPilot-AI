import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export interface TestGitRepo {
  /** Absolute path to the temporary repository root */
  repoPath: string;

  /** Synchronously executes git CLI within the repository */
  git: (args: string[]) => string;

  /** Creates or overwrites a file relative to repo root */
  createFile: (relativePath: string, content: string | Buffer) => string;

  /** Appends content to a file */
  appendToFile: (relativePath: string, content: string | Buffer) => void;

  /** Modifies an existing file */
  modifyFile: (relativePath: string, content: string | Buffer) => void;

  /** Deletes a file from the filesystem */
  deleteFile: (relativePath: string) => void;

  /** Stages paths via `git add -- <paths>` (or `git add -A` if none provided) */
  stage: (...relativePaths: string[]) => void;

  /** Commits staged changes */
  commit: (message: string) => string;

  /** Stages and commits specified files in one step */
  stageAndCommit: (message: string, ...relativePaths: string[]) => string;

  /** Renames a file using `git mv` */
  rename: (oldPath: string, newPath: string) => void;

  /** Creates and switches to a new branch */
  createBranch: (branchName: string) => void;

  /** Checks out a branch or ref */
  checkout: (ref: string) => void;

  /** Checks out a commit in detached HEAD state */
  checkoutDetach: (commitHash: string) => void;

  /** Creates a binary file with null bytes */
  createBinaryFile: (relativePath: string, length?: number) => string;

  /** Cleans up the temporary directory */
  cleanup: () => Promise<void>;
}

export interface CreateRepoOptions {
  defaultBranch?: string;
  initialCommit?: boolean;
}

/**
 * Provisions a dynamic, real Git repository on disk in a temporary directory.
 */
export async function createTestGitRepo(options: CreateRepoOptions = {}): Promise<TestGitRepo> {
  const prefix = path.join(os.tmpdir(), 'devpilot-test-repo-');
  const repoPath = fs.mkdtempSync(prefix);

  const defaultBranch = options.defaultBranch ?? 'main';

  const git = (args: string[]): string => {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'DevPilot Tester',
        GIT_AUTHOR_EMAIL: 'tester@devpilot.test',
        GIT_COMMITTER_NAME: 'DevPilot Tester',
        GIT_COMMITTER_EMAIL: 'tester@devpilot.test',
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C.UTF-8',
      },
    });
  };

  // Initialize repo with standard configs
  git(['init', '-b', defaultBranch]);
  git(['config', 'user.name', 'DevPilot Tester']);
  git(['config', 'user.email', 'tester@devpilot.test']);
  git(['config', 'commit.gpgSign', 'false']);
  git(['config', 'core.autocrlf', 'false']);

  const createFile = (relativePath: string, content: string | Buffer): string => {
    const fullPath = path.join(repoPath, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  const appendToFile = (relativePath: string, content: string | Buffer): void => {
    const fullPath = path.join(repoPath, relativePath);
    fs.appendFileSync(fullPath, content);
  };

  const modifyFile = (relativePath: string, content: string | Buffer): void => {
    createFile(relativePath, content);
  };

  const deleteFile = (relativePath: string): void => {
    const fullPath = path.join(repoPath, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  };

  const stage = (...relativePaths: string[]): void => {
    if (relativePaths.length === 0) {
      git(['add', '-A']);
    } else {
      git(['add', '--', ...relativePaths]);
    }
  };

  const commit = (message: string): string => {
    git(['commit', '-m', message]);
    return git(['rev-parse', 'HEAD']).trim();
  };

  const stageAndCommit = (message: string, ...relativePaths: string[]): string => {
    stage(...relativePaths);
    return commit(message);
  };

  const rename = (oldPath: string, newPath: string): void => {
    const fullNewPath = path.join(repoPath, newPath);
    fs.mkdirSync(path.dirname(fullNewPath), { recursive: true });
    git(['mv', oldPath, newPath]);
  };

  const createBranch = (branchName: string): void => {
    git(['checkout', '-b', branchName]);
  };

  const checkout = (ref: string): void => {
    git(['checkout', ref]);
  };

  const checkoutDetach = (commitHash: string): void => {
    git(['checkout', '--detach', commitHash]);
  };

  const createBinaryFile = (relativePath: string, length = 64): string => {
    const buffer = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      buffer[i] = i % 256;
    }
    // Set first byte to 0 to ensure Git detects NUL byte and classifies as binary
    buffer[0] = 0;
    return createFile(relativePath, buffer);
  };

  const cleanup = async (): Promise<void> => {
    try {
      if (fs.existsSync(repoPath)) {
        await fs.promises.rm(repoPath, { recursive: true, force: true, maxRetries: 3 });
      }
    } catch (err) {
      console.warn(`[gitRepoHelper] Warning: Failed to clean temp dir ${repoPath}:`, err);
    }
  };

  if (options.initialCommit) {
    createFile('README.md', '# DevPilot Test\n');
    stageAndCommit('Initial commit', 'README.md');
  }

  return {
    repoPath,
    git,
    createFile,
    appendToFile,
    modifyFile,
    deleteFile,
    stage,
    commit,
    stageAndCommit,
    rename,
    createBranch,
    checkout,
    checkoutDetach,
    createBinaryFile,
    cleanup,
  };
}

/**
 * Scoped helper guaranteeing cleanup even if tests throw an assertion error.
 */
export async function withTestRepo<T>(
  fn: (repo: TestGitRepo) => Promise<T>,
  options?: CreateRepoOptions
): Promise<T> {
  const repo = await createTestGitRepo(options);
  try {
    return await fn(repo);
  } finally {
    await repo.cleanup();
  }
}
