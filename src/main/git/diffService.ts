/**
 * Staged Diff Service for DevPilot AI.
 * Queries `git diff --staged -M -- <path>` safely and coordinates with diffParser.
 */

import { executeGit, type GitExecutionResult } from './executor';
import { parseDiffOutput } from './diffParser';
import type { GitDiffResult } from '../../shared/types';

export interface GetStagedDiffOptions {
  repoPath: string;
  filePath: string;
  oldPath?: string;
}

/**
 * Safely executes Git to retrieve and parse staged diff for a specified file.
 *
 * Security & Hardening:
 * - Employs argument injection protection by placing `--` delimiter before all file paths.
 * - Validates input parameters strictly before invoking subprocess.
 * - Handles renamed files by supplying both oldPath and filePath to git diff.
 *
 * @param options repoPath, filePath, and optional oldPath
 * @returns Structured GitDiffResult
 */
export async function getStagedDiff(options: GetStagedDiffOptions): Promise<GitDiffResult> {
  const { repoPath, filePath, oldPath } = options;

  if (!repoPath || typeof repoPath !== 'string' || repoPath.trim().length === 0) {
    throw new Error('Repository path must be a non-empty string.');
  }

  if (!filePath || typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('File path must be a non-empty string.');
  }

  if (oldPath !== undefined && (typeof oldPath !== 'string' || oldPath.trim().length === 0)) {
    throw new Error('Old path must be a non-empty string when provided.');
  }

  const cleanRepo = repoPath.trim();
  const cleanPath = filePath.trim();

  // Argument injection defense: '--' guarantees that subsequent items are paths, not flags
  const args = ['diff', '--staged', '-M', '--'];

  if (oldPath && oldPath.trim().length > 0) {
    args.push(oldPath.trim());
  }

  args.push(cleanPath);

  const result: GitExecutionResult = await executeGit(args, { cwd: cleanRepo });

  return parseDiffOutput(result.stdout, cleanRepo, cleanPath);
}

/**
 * Helper function accepting positional parameters.
 */
export async function getStagedDiffForFile(
  repoPath: string,
  filePath: string,
  oldPath?: string
): Promise<GitDiffResult> {
  return getStagedDiff({ repoPath, filePath, oldPath });
}
