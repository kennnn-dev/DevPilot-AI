import path from 'node:path';
import fs from 'node:fs';
import { executeGit, GitExecutionError } from './executor';

export interface RepoValidationResult {
  /** Whether the path is a valid non-bare Git repository with a working tree */
  isGitRepo: boolean;
  /** Alias for isGitRepo for compatibility with diverse service consumers */
  isValid: boolean;
  /** Whether the repository is bare (no working tree) */
  isBare?: boolean;
  /** Canonical root path of the Git repository */
  rootPath?: string;
  /** Human-readable error message if validation failed */
  error?: string;
}

/**
 * Validates whether targetPath is a valid, inspectable Git working tree repository.
 *
 * Evaluates:
 * 1. String validity & non-empty input.
 * 2. Filesystem existence (returns 'Path does not exist.').
 * 3. File vs directory check (returns 'Path is a file, not a directory.').
 * 4. Runs `git rev-parse --is-inside-work-tree --show-toplevel`.
 * 5. Returns canonical repository root path even when pointed at a deep subfolder.
 * 6. Intercepts exit 128 to identify bare repos ('Repository is bare (no working tree).')
 *    and non-git directories ('Not a git repository.').
 */
export async function validateGitRepository(targetPath: string): Promise<RepoValidationResult> {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    return {
      isGitRepo: false,
      isValid: false,
      error: 'Repository path must be a non-empty string.',
    };
  }

  const resolvedPath = path.resolve(targetPath.trim());

  // Filesystem existence and directory check
  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return {
        isGitRepo: false,
        isValid: false,
        error: 'Path is a file, not a directory.',
      };
    }
  } catch {
    return {
      isGitRepo: false,
      isValid: false,
      error: 'Path does not exist.',
    };
  }

  try {
    const result = await executeGit(['rev-parse', '--is-inside-work-tree', '--show-toplevel'], {
      cwd: resolvedPath,
      ignoreExitCode: true,
    });

    if (result.exitCode === 0) {
      const lines = result.stdout
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const isInsideWorkTree = lines[0] === 'true';
      if (isInsideWorkTree && lines.length >= 2) {
        return {
          isGitRepo: true,
          isValid: true,
          isBare: false,
          rootPath: path.resolve(lines[1]),
        };
      }

      if (isInsideWorkTree) {
        return {
          isGitRepo: true,
          isValid: true,
          isBare: false,
          rootPath: resolvedPath,
        };
      }
    }

    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();

    // Bare repository detection
    if (stdout === 'false' || stderr.includes('this operation must be run in a work tree') || stderr.includes('is a bare repository')) {
      return {
        isGitRepo: false,
        isValid: false,
        isBare: true,
        error: 'Repository is bare (no working tree).',
      };
    }

    // Standard non-git directory (Git exit 128)
    if (stderr.includes('not a git repository') || result.exitCode === 128) {
      return {
        isGitRepo: false,
        isValid: false,
        error: 'Not a git repository.',
      };
    }

    return {
      isGitRepo: false,
      isValid: false,
      error: stderr || 'Unknown repository validation failure.',
    };
  } catch (err: unknown) {
    if (err instanceof GitExecutionError) {
      if (err.code === 'ENOENT') {
        return {
          isGitRepo: false,
          isValid: false,
          error: 'Git binary not found. Please ensure Git is installed.',
        };
      }
      return {
        isGitRepo: false,
        isValid: false,
        error: 'Not a git repository.',
      };
    }

    const message = err instanceof Error ? err.message : 'Failed to inspect repository.';
    return {
      isGitRepo: false,
      isValid: false,
      error: message,
    };
  }
}

/**
 * Convenient alias for validateGitRepository
 */
export const validateRepository = validateGitRepository;
