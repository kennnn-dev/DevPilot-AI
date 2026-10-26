import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import type {
  DevPilotAPI,
  GitStatusResult,
  GitDiffResult,
  GitAllStagedDiffResult,
  WebhookGenerateCommitOptions,
  GeneratedCommitResult,
  IPCResult,
  ResolvedWebhookConfig,
} from '../shared/types';

/**
 * DevPilot Safe Preload Bridge
 *
 * Implements DevPilotAPI exposing strictly read-only, whitelisted
 * IPC invocations to the renderer process via Electron's contextBridge.
 */
export const api: DevPilotAPI = {
  /**
   * Opens OS native directory picker dialog.
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
   * Queries unified staged or file diff for a selected file.
   */
  getStagedDiff: async (
    repoPath: string,
    filePath: string,
    oldPath?: string,
    scope?: 'staged' | 'unstaged' | 'untracked'
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
    const payload: {
      repoPath: string;
      filePath: string;
      oldPath?: string;
      scope?: 'staged' | 'unstaged' | 'untracked';
    } = { repoPath, filePath, oldPath };
    if (scope !== undefined) {
      payload.scope = scope;
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STAGED_DIFF, payload);
  },

  /**
   * Retrieves complete unified diff and status for all staged files in the repository.
   */
  getAllStagedDiff: async (repoPath: string): Promise<IPCResult<GitAllStagedDiffResult>> => {
    if (typeof repoPath !== 'string' || repoPath.trim().length === 0) {
      return {
        success: false,
        error: 'Repository path must be a non-empty string.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_ALL_STAGED_DIFF, repoPath);
  },

  /**
   * Dispatches staged changes to an n8n webhook endpoint to generate a Conventional Commit message.
   */
  generateCommitMessage: async (
    options: WebhookGenerateCommitOptions
  ): Promise<IPCResult<GeneratedCommitResult>> => {
    if (!options || typeof options !== 'object') {
      return {
        success: false,
        error: 'Options must be an object.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT, options);
  },

  /**
   * Queries environment-configured webhook defaults and active resolution from Main process.
   */
  getWebhookConfig: async (): Promise<IPCResult<ResolvedWebhookConfig>> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.GET_WEBHOOK_CONFIG);
  },
};

// Forward real-time repository changes from main process watcher
if (typeof ipcRenderer?.on === 'function') {
  ipcRenderer.on('git:repo-changed', (_event, payload) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('devpilot:repo-changed', { detail: payload }));
    }
  });
}

// Expose safe typed API on window.devPilot
contextBridge.exposeInMainWorld('devPilot', api);
