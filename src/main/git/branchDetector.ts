import { executeGit } from './executor';

export interface BranchResolutionResult {
  branch: string;
  isDetached: boolean;
  commitSha?: string;
}

/**
 * Resolves the active branch name and detached HEAD state for a repository.
 *
 * Algorithm:
 * 1. Queries `git branch --show-current`.
 *    - For active branches (with commits or unborn in Git >= 2.22), returns branch name.
 * 2. If branch is non-empty string:
 *    - Returns `{ branch, isDetached: false }`.
 * 3. If branch is empty string, handles detached HEAD vs unborn branch:
 *    a. Checks detached HEAD via `git rev-parse --short HEAD`:
 *       - If HEAD points to a commit, outputs 7-char short SHA.
 *       - Returns `{ branch: `(HEAD detached at ${shortSha})`, isDetached: true, commitSha: shortSha }`.
 *    b. Checks unborn branch via `git symbolic-ref --short HEAD`:
 *       - On fresh repos with 0 commits, returns branch name (e.g. 'main').
 *       - Returns `{ branch: unbornBranch, isDetached: false }`.
 * 4. Fallback:
 *    - Returns `{ branch: 'HEAD', isDetached: false }`.
 */
export async function detectBranch(repoPath: string): Promise<BranchResolutionResult> {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('Repository path must be a non-empty string.');
  }

  // 1. Try git branch --show-current
  try {
    const showCurrentResult = await executeGit(['branch', '--show-current'], {
      cwd: repoPath,
      ignoreExitCode: true,
    });

    const currentBranch = showCurrentResult.stdout.trim();
    if (showCurrentResult.exitCode === 0 && currentBranch.length > 0) {
      return {
        branch: currentBranch,
        isDetached: false,
      };
    }
  } catch {
    // Continue to fallbacks
  }

  // 2. Disambiguate Detached HEAD via git rev-parse --short HEAD
  try {
    const revParseResult = await executeGit(['rev-parse', '--short', 'HEAD'], {
      cwd: repoPath,
      ignoreExitCode: true,
    });

    const shortSha = revParseResult.stdout.trim();
    if (revParseResult.exitCode === 0 && shortSha.length > 0) {
      return {
        branch: `(HEAD detached at ${shortSha})`,
        isDetached: true,
        commitSha: shortSha,
      };
    }
  } catch {
    // Continue to unborn branch check
  }

  // 3. Disambiguate Unborn branch via git symbolic-ref --short HEAD
  try {
    const symbolicRefResult = await executeGit(['symbolic-ref', '--short', 'HEAD'], {
      cwd: repoPath,
      ignoreExitCode: true,
    });

    const symbolicBranch = symbolicRefResult.stdout.trim();
    if (symbolicRefResult.exitCode === 0 && symbolicBranch.length > 0) {
      return {
        branch: symbolicBranch,
        isDetached: false,
      };
    }
  } catch {
    // Continue to final fallback
  }

  // 4. Final fallback
  return {
    branch: 'HEAD',
    isDetached: false,
  };
}

/**
 * Convenient alias for detectBranch
 */
export const getActiveBranch = detectBranch;
