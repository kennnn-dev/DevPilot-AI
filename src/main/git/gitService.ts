import type { GitStatusResult, GitDiffResult, IPCResult } from '../../shared/types';
import { validateGitRepository } from './repoValidator';
import { detectBranch } from './branchDetector';
import { parseStatusOutput } from './statusParser';
import { getStagedDiff } from './diffService';
import { executeGit } from './executor';

export class GitService {
  /**
   * Retrieves complete working tree status for a repository.
   */
  async getStatus(repoPath: string): Promise<IPCResult<GitStatusResult>> {
    // Step 1: Validate repository
    const validation = await validateGitRepository(repoPath);
    if (!validation.isGitRepo) {
      return {
        success: false,
        error: validation.error ?? 'Not a valid Git repository.',
      };
    }

    if (validation.isBare) {
      return {
        success: false,
        error: 'Repository is bare (no working tree).',
      };
    }

    const workingRoot = validation.rootPath ?? repoPath;

    try {
      // Step 2: Query active branch
      const branchInfo = await detectBranch(workingRoot);

      // Step 3: Query porcelain status (v1 -z with -uall)
      const statusExecResult = await executeGit(
        ['status', '--porcelain=v1', '-z', '-uall'],
        { cwd: workingRoot }
      );

      // Step 4: Parse porcelain status records
      const parsedStatus = parseStatusOutput(statusExecResult.stdout);

      return {
        success: true,
        data: {
          repoPath: workingRoot,
          branch: branchInfo.branch,
          isDetached: branchInfo.isDetached,
          staged: parsedStatus.staged,
          unstaged: parsedStatus.unstaged,
          untracked: parsedStatus.untracked,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Retrieves unified staged diff for a selected file.
   */
  async getStagedDiff(
    repoPath: string,
    filePath: string,
    oldPath?: string
  ): Promise<IPCResult<GitDiffResult>> {
    // Step 1: Validate repository
    const validation = await validateGitRepository(repoPath);
    if (!validation.isGitRepo) {
      return {
        success: false,
        error: validation.error ?? 'Not a valid Git repository.',
      };
    }

    const workingRoot = validation.rootPath ?? repoPath;

    try {
      const diffResult = await getStagedDiff({
        repoPath: workingRoot,
        filePath,
        oldPath,
      });

      return {
        success: true,
        data: diffResult,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
      };
    }
  }
}

export const gitService = new GitService();
