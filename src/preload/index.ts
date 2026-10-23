import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import type { DevPilotAPI, GitStatusResult, GitDiffResult, IPCResult } from '../shared/types';

/**
 * DevPilot Safe Preload Bridge
 *
 * Implements DevPilotAPI exposing strictly read-only, whitelisted
 * IPC invocations to the renderer process via Electron's contextBridge.
 *
 * Security Guarantees:
 * 1. contextIsolation is enforced.
 * 2. nodeIntegration is disabled.
 * 3. ipcRenderer is NEVER leaked to window global.
 * 4. Only whitelisted channels are invoked.
 * 5. Input parameters are validated before crossing the IPC boundary.
 */
export const api: DevPilotAPI = {
  /**
   * Opens OS native directory picker dialog.
   * Returns selected absolute path string or null if canceled.
   */
  openDirectory: async (): Promise<string | null> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY);
  },

  /**
   * Queries active branch and working tree status (staged, unstaged, untracked).
   */
  getStatus: async (repoPath: string): Promise<IPCResult<GitStatusResult>> => {
    if (typeof repoPath !== 'string' || repoPath.trim().length === 0) {
      return {
        success: false,
        error: 'Repository path must be a non-empty string.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STATUS, repoPath);
  },

  /**
   * Queries unified staged diff for a selected file.
   */
  getStagedDiff: async (
    repoPath: string,
    filePath: string,
    oldPath?: string
  ): Promise<IPCResult<GitDiffResult>> => {
    if (typeof repoPath !== 'string' || repoPath.trim().length === 0) {
      return {
        success: false,
        error: 'Repository path must be a non-empty string.',
      };
    }
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      return {
        success: false,
        error: 'File path must be a non-empty string.',
      };
    }
    if (oldPath !== undefined && (typeof oldPath !== 'string' || oldPath.trim().length === 0)) {
      return {
        success: false,
        error: 'Old file path must be a non-empty string when provided.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STAGED_DIFF, { repoPath, filePath, oldPath });
  },
};

// Expose safe typed API on window.devPilot
contextBridge.exposeInMainWorld('devPilot', api);
