/**
 * Staged & File Diff Service for DevPilot AI.
 * Queries `git diff --staged -M`, working tree `git diff`, or untracked file diff safely.
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeGit, type GitExecutionResult } from './executor';
import { parseDiffOutput } from './diffParser';
import { parseStatusOutput } from './statusParser';
import type { GitDiffResult, GitAllStagedDiffResult } from '../../shared/types';

export interface GetStagedDiffOptions {
  repoPath: string;
  filePath: string;
  oldPath?: string;
  scope?: 'staged' | 'unstaged' | 'untracked';
}

/**
 * Safely executes Git to retrieve and parse diff for a specified file (staged, unstaged, or untracked).
 *
 * Security & Hardening:
 * - Employs argument injection protection by placing `--` delimiter before all file paths.
 * - Validates input parameters strictly before invoking subprocess.
 * - Handles renamed files by supplying both oldPath and filePath to git diff.
 *
 * @param options repoPath, filePath, optional oldPath, and optional scope
 * @returns Structured GitDiffResult
 */
export async function getStagedDiff(options: GetStagedDiffOptions): Promise<GitDiffResult> {
  const { repoPath, filePath, oldPath, scope } = options;

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

  // Helper to run unstaged working tree diff
  const runUnstagedDiff = async (): Promise<GitExecutionResult> => {
    const args = ['diff', '-M', '--'];
    if (oldPath && oldPath.trim().length > 0) {
      args.push(oldPath.trim());
    }
    args.push(cleanPath);
    return executeGit(args, { cwd: cleanRepo });
  };

  // Helper to run untracked file diff
  const runUntrackedDiff = async (): Promise<GitExecutionResult> => {
    const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(cleanRepo, cleanPath);
    if (!fs.existsSync(fullPath)) {
      return { stdout: '', stderr: '', exitCode: 0 };
    }
    const args = ['diff', '--no-index', '--', '/dev/null', cleanPath];
    return executeGit(args, { cwd: cleanRepo, ignoreExitCode: true });
  };

  // Helper to run staged diff
  const runStagedDiff = async (): Promise<GitExecutionResult> => {
    const args = ['diff', '--staged', '-M', '--'];
    if (oldPath && oldPath.trim().length > 0) {
      args.push(oldPath.trim());
    }
    args.push(cleanPath);
    return executeGit(args, { cwd: cleanRepo });
  };

  if (scope === 'untracked') {
    const result = await runUntrackedDiff();
    return parseDiffOutput(result.stdout, cleanRepo, cleanPath);
  }

  if (scope === 'unstaged') {
    const result = await runUnstagedDiff();
    return parseDiffOutput(result.stdout, cleanRepo, cleanPath);
  }

  if (scope === 'staged') {
    const result = await runStagedDiff();
    return parseDiffOutput(result.stdout, cleanRepo, cleanPath);
  }

  // Automatic scope resolution when scope is omitted:
  // 1. Try staged diff first
  const stagedRes = await runStagedDiff();
  if (stagedRes.stdout.trim().length > 0) {
    return parseDiffOutput(stagedRes.stdout, cleanRepo, cleanPath);
  }

  // 2. Try unstaged working tree diff
  const unstagedRes = await runUnstagedDiff();
  if (unstagedRes.stdout.trim().length > 0) {
    return parseDiffOutput(unstagedRes.stdout, cleanRepo, cleanPath);
  }

  // 3. Try untracked diff if file exists on disk
  const untrackedRes = await runUntrackedDiff();
  if (untrackedRes.stdout.trim().length > 0) {
    return parseDiffOutput(untrackedRes.stdout, cleanRepo, cleanPath);
  }

  // Default: return empty parsed diff
  return parseDiffOutput(stagedRes.stdout, cleanRepo, cleanPath);
}

/**
 * Helper function accepting positional parameters.
 */
export async function getStagedDiffForFile(
  repoPath: string,
  filePath: string,
  oldPath?: string,
  scope?: 'staged' | 'unstaged' | 'untracked'
): Promise<GitDiffResult> {
  return getStagedDiff({ repoPath, filePath, oldPath, scope });
}

export interface GetAllStagedDiffOptions {
  repoPath: string;
}

export async function getAllStagedDiff(options: GetAllStagedDiffOptions): Promise<GitAllStagedDiffResult> {
  if (!options || typeof options.repoPath !== 'string' || options.repoPath.trim().length === 0) {
    throw new Error('Repository path must be a non-empty string.');
  }

  const cleanRepo = options.repoPath.trim();
  const diffResult = await executeGit(['diff', '--staged', '-M'], { cwd: cleanRepo });
  const rawDiff = diffResult.stdout;

  const statusResult = await executeGit(['status', '--porcelain=v1', '-z', '-uall'], { cwd: cleanRepo });
  const parsedStatus = parseStatusOutput(statusResult.stdout);

  const BINARY_DIFF_REGEX = /Binary files .* differ/;
  const GIT_BINARY_PATCH_REGEX = /^GIT binary patch/m;
  const isBinary = BINARY_DIFF_REGEX.test(rawDiff) || GIT_BINARY_PATCH_REGEX.test(rawDiff);
  const isEmpty = parsedStatus.staged.length === 0 || (rawDiff.trim().length === 0 && !isBinary);

  let insertions = 0;
  let deletions = 0;
  for (const line of rawDiff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) insertions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  return {
    repoPath: cleanRepo,
    rawDiff,
    stagedFiles: parsedStatus.staged,
    summary: {
      filesChanged: parsedStatus.staged.length,
      insertions,
      deletions,
    },
    isEmpty,
  };
}
