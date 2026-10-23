/**
 * Unified Diff Parser for DevPilot AI.
 * Parses raw unified diff output from `git diff --staged` into structured hunks and lines.
 */

import type { GitDiffResult, GitDiffHunk } from '../../shared/types';

/** Regex matching unified diff hunk headers (e.g. @@ -1,5 +1,6 @@ or @@ -1 +1 @@) */
const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?$/;

/** Regex matching Git binary diff indicators */
const BINARY_DIFF_REGEX = /Binary files .* differ/;
const GIT_BINARY_PATCH_REGEX = /^GIT binary patch/m;

/**
 * Parses raw unified diff output into structured GitDiffResult.
 *
 * @param rawDiff Raw output string from `git diff --staged`
 * @param repoPath Absolute path to the inspected repository
 * @param filePath Relative path to the inspected file
 * @returns Fully populated GitDiffResult with hunks, line numbers, and binary/empty flags
 */
export function parseDiffOutput(
  rawDiff: string,
  repoPath = '',
  filePath = ''
): GitDiffResult {
  if (!rawDiff || rawDiff.trim().length === 0) {
    return {
      repoPath,
      filePath,
      rawDiff: rawDiff ?? '',
      isBinary: false,
      isEmpty: true,
      hunks: [],
    };
  }

  // Detect binary files
  const isBinary = BINARY_DIFF_REGEX.test(rawDiff) || GIT_BINARY_PATCH_REGEX.test(rawDiff);
  if (isBinary) {
    return {
      repoPath,
      filePath,
      rawDiff,
      isBinary: true,
      isEmpty: false,
      hunks: [],
    };
  }

  const rawLines = rawDiff.split(/\r?\n/);
  const hunks: GitDiffHunk[] = [];

  let currentHunk: GitDiffHunk | null = null;
  let currentOldLine = 0;
  let currentNewLine = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const headerMatch = line.match(HUNK_HEADER_REGEX);

    if (headerMatch) {
      const oldStart = parseInt(headerMatch[1], 10);
      const oldLines = headerMatch[2] !== undefined ? parseInt(headerMatch[2], 10) : 1;
      const newStart = parseInt(headerMatch[3], 10);
      const newLines = headerMatch[4] !== undefined ? parseInt(headerMatch[4], 10) : 1;

      currentHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };
      hunks.push(currentHunk);

      currentOldLine = oldStart;
      currentNewLine = newStart;
      continue;
    }

    // Skip diff headers before the first hunk (diff --git, index, ---, +++)
    if (!currentHunk) {
      continue;
    }

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line,
        newLineNumber: currentNewLine,
      });
      currentNewLine++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'delete',
        content: line,
        oldLineNumber: currentOldLine,
      });
      currentOldLine++;
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        content: line,
        oldLineNumber: currentOldLine,
        newLineNumber: currentNewLine,
      });
      currentOldLine++;
      currentNewLine++;
    } else if (line.startsWith('\\')) {
      // e.g. "\ No newline at end of file"
      currentHunk.lines.push({
        type: 'meta',
        content: line,
      });
    } else if (line.length === 0 && i === rawLines.length - 1) {
      // Trailing empty newline from diff termination; skip cleanly
      continue;
    }
  }

  // An empty diff has no hunks (e.g. 0-byte added file or rename without content edits)
  const isEmpty = hunks.length === 0;

  return {
    repoPath,
    filePath,
    rawDiff,
    isBinary: false,
    isEmpty,
    hunks,
  };
}
