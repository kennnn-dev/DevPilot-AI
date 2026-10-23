/**
 * Safe, Read-Only IPC Channel Constants for DevPilot AI.
 * Used across Main Process handlers and Preload contextBridge invocation.
 */

export const IPC_CHANNELS = {
  /**
   * Opens the OS native directory picker dialog.
   * Main handler: dialog.showOpenDialog({ properties: ['openDirectory'] })
   * Payload: none
   * Return: string | null
   */
  DIALOG_OPEN_DIRECTORY: 'dialog:open-directory',

  /**
   * Inspects repository status, active branch, and changed files.
   * Main handler: queries git rev-parse and git status --porcelain=v1 -z -uall
   * Payload: repoPath (string)
   * Return: IPCResult<GitStatusResult>
   */
  GIT_GET_STATUS: 'git:get-status',

  /**
   * Inspects staged diff for a specific file.
   * Main handler: queries git diff --staged -M -- <path>
   * Payload: GetStagedDiffParams ({ repoPath: string, filePath: string, oldPath?: string })
   * Return: IPCResult<GitDiffResult>
   */
  GIT_GET_STAGED_DIFF: 'git:get-staged-diff',

  // Convenience aliases matching shorthand conventions
  OPEN_DIRECTORY: 'dialog:open-directory',
  GET_STATUS: 'git:get-status',
  GET_STAGED_DIFF: 'git:get-staged-diff',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
