/**
 * Shared Type Definitions for DevPilot AI.
 * Strict interface contracts shared across Electron Main, Preload bridge, and React Renderer.
 */

/**
 * A user-defined workspace grouping multiple local Git repositories.
 */
export interface Workspace {
  /** Unique workspace identifier */
  id: string;
  /** Human-readable workspace name */
  name: string;
  /** Timestamp when created */
  createdAt: number;
  /** List of absolute directory paths to Git repositories in this workspace */
  repoPaths: string[];
}

/**
 * Valid Git file change categories as defined in PROJECT.md.
 */
export type GitFileChangeType =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked';

/**
 * Status information for a single file in the Git repository.
 */
export interface GitFileStatus {
  /** Relative path of the file from repository root */
  path: string;
  /** Original path if the file was renamed or copied */
  oldPath?: string;
  /** High-level categorized change type */
  changeType: GitFileChangeType;
  /** Raw 2-character porcelain status code (e.g. 'M ', ' M', '??', 'A ') */
  statusCode: string;
}

/**
 * Comprehensive working tree status of a repository.
 */
export interface GitStatusResult {
  /** Absolute path to the opened repository */
  repoPath: string;
  /** Current branch name (e.g. 'main', or short SHA if detached) */
  branch: string;
  /** Whether repository is in a detached HEAD state */
  isDetached: boolean;
  /** Files with staged changes (ready to commit) */
  staged: GitFileStatus[];
  /** Files with unstaged changes in the working tree */
  unstaged: GitFileStatus[];
  /** Untracked files */
  untracked: GitFileStatus[];
}

/**
 * A single line within a unified diff hunk.
 */
export interface GitDiffHunkLine {
  /** Line type: added line, deleted line, context line, or hunk metadata */
  type: 'add' | 'delete' | 'context' | 'meta';
  /** Verbatim line text content */
  content: string;
  /** Line number in the original (old) file */
  oldLineNumber?: number;
  /** Line number in the modified (new) file */
  newLineNumber?: number;
}

/**
 * A unified diff hunk representation (e.g., @@ -1,5 +1,6 @@).
 */
export interface GitDiffHunk {
  /** Hunk header string */
  header: string;
  /** Starting line number in old file */
  oldStart: number;
  /** Line count in old file */
  oldLines: number;
  /** Starting line number in new file */
  newStart: number;
  /** Line count in new file */
  newLines: number;
  /** Parsed lines within this hunk */
  lines: GitDiffHunkLine[];
}

/**
 * Structured result of querying a staged file diff.
 */
export interface GitDiffResult {
  /** Absolute path to the repository */
  repoPath: string;
  /** Relative file path */
  filePath: string;
  /** Raw unified diff output from git diff --staged */
  rawDiff: string;
  /** Indicates whether Git treated this file as binary */
  isBinary: boolean;
  /** Indicates whether the diff is empty (0 modifications or 0-byte added file) */
  isEmpty: boolean;
  /** Parsed diff hunks for syntax-highlighted rendering */
  hunks: GitDiffHunk[];
}

/**
 * Standardized IPC response wrapper for all asynchronous operations.
 */
export interface IPCResult<T> {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Payload returned on success */
  data?: T;
  /** Human-readable error message on failure */
  error?: string;
}

/**
 * Payload parameter for git:get-staged-diff IPC requests.
 */
export interface GetStagedDiffParams {
  repoPath: string;
  filePath: string;
  oldPath?: string;
  scope?: 'staged' | 'unstaged' | 'untracked';
}

/**
 * Safe, read-only API exposed to the Renderer window via Preload contextBridge.
 */
export interface DevPilotAPI {
  /**
   * Prompts the native OS directory selection dialog.
   * @returns Absolute path of selected directory, or null if canceled.
   */
  openDirectory: () => Promise<string | null>;

  /**
   * Queries real Git repository working tree status.
   * @param repoPath Absolute path to repository
   */
  getStatus: (repoPath: string) => Promise<IPCResult<GitStatusResult>>;

  /**
   * Queries real staged or file diff for a specific file.
   * @param repoPath Absolute path to repository
   * @param filePath Relative path to file
   * @param oldPath Optional old path if file was renamed
   * @param scope Optional diff scope: staged, unstaged, or untracked
   */
  getStagedDiff: (
    repoPath: string,
    filePath: string,
    oldPath?: string,
    scope?: 'staged' | 'unstaged' | 'untracked'
  ) => Promise<IPCResult<GitDiffResult>>;
}

/**
 * Global Window interface augmentation for typed Electron Preload bridge.
 */
declare global {
  interface Window {
    devPilot: DevPilotAPI;
  }
}
