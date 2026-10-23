/**
 * Git Porcelain v1 Status Parser for DevPilot AI.
 * Parses NUL-delimited `git status --porcelain=v1 -z -uall` output into
 * structured Staged, Unstaged, and Untracked file categories.
 */

import type { GitFileStatus, GitFileChangeType } from '../../shared/types';

export interface ParsedStatus {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
}

/**
 * Maps Git porcelain index status character (X) to shared GitFileChangeType.
 */
export function mapStagedChangeType(code: string): GitFileChangeType {
  switch (code) {
    case 'M':
    case 'T':
      return 'modified';
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    default:
      return 'modified';
  }
}

/**
 * Maps Git porcelain worktree status character (Y) to shared GitFileChangeType.
 */
export function mapUnstagedChangeType(code: string): GitFileChangeType {
  switch (code) {
    case 'M':
    case 'T':
      return 'modified';
    case 'D':
      return 'deleted';
    default:
      return 'modified';
  }
}

/**
 * Parses raw NUL-delimited porcelain v1 output from Git CLI.
 *
 * Characteristics:
 * - Robust against filenames with spaces, unicode characters, quotes, and newlines.
 * - Categorizes files with dual changes (e.g., MM, AM, MD, RM) into both staged and unstaged lists.
 * - Extracts `oldPath` for renames (R) and copies (C).
 *
 * @param rawOutput Raw string output from `git status --porcelain=v1 -z -uall`
 * @returns Categorized ParsedStatus containing staged, unstaged, and untracked arrays
 */
export function parseStatusOutput(rawOutput: string): ParsedStatus {
  const staged: GitFileStatus[] = [];
  const unstaged: GitFileStatus[] = [];
  const untracked: GitFileStatus[] = [];

  if (!rawOutput || rawOutput.length === 0) {
    return { staged, unstaged, untracked };
  }

  // Split on NUL delimiter. Note: trailing NUL results in a final empty token.
  const tokens = rawOutput.split('\0');
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token.length < 3) {
      i++;
      continue;
    }

    const statusCode = token.slice(0, 2);
    const X = statusCode[0];
    const Y = statusCode[1];
    const filePath = token.slice(3);

    // If change is a rename or copy, Git emits the old path in the immediately following token
    let oldPath: string | undefined;
    if (X === 'R' || X === 'C' || Y === 'R' || Y === 'C') {
      i++;
      if (i < tokens.length && tokens[i].length > 0) {
        oldPath = tokens[i];
      }
    }

    // 1. Untracked files (??)
    if (statusCode === '??') {
      untracked.push({
        path: filePath,
        changeType: 'untracked',
        statusCode: '??',
      });
      i++;
      continue;
    }

    // 2. Ignored files (!!) - skip
    if (statusCode === '!!') {
      i++;
      continue;
    }

    // 3. Staged changes (index status X is M, A, D, R, C, or T)
    if (X === 'M' || X === 'A' || X === 'D' || X === 'R' || X === 'C' || X === 'T') {
      const stagedEntry: GitFileStatus = {
        path: filePath,
        changeType: mapStagedChangeType(X),
        statusCode,
      };
      if (oldPath) {
        stagedEntry.oldPath = oldPath;
      }
      staged.push(stagedEntry);
    }

    // 4. Unstaged changes (worktree status Y is M, D, or T)
    if (Y === 'M' || Y === 'D' || Y === 'T') {
      const unstagedEntry: GitFileStatus = {
        path: filePath,
        changeType: mapUnstagedChangeType(Y),
        statusCode,
      };
      unstaged.push(unstagedEntry);
    }

    // 5. Unmerged / merge conflict state fallback (e.g. UU, AA, DD, AU, UD)
    if (X === 'U' || Y === 'U' || (X === 'A' && Y === 'A') || (X === 'D' && Y === 'D')) {
      unstaged.push({
        path: filePath,
        changeType: 'modified',
        statusCode,
      });
    }

    i++;
  }

  return { staged, unstaged, untracked };
}
