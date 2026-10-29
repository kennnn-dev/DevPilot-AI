import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import type {
  DevPilotAPI,
  GitStatusResult,
  GitDiffResult,
  GitAllStagedDiffResult,
  GenerateCommitOptions,
  GeneratedCommitResult,
  IPCResult,
  ResolvedWebhookConfig,
  ResolvedAIConfig,
  WorkspaceReviewOptions,
  WorkspaceReviewResult,
  WorkspaceService,
  ServiceLogEntry,
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
   * Dispatches staged changes to an AI provider or webhook endpoint to generate a Conventional Commit message.
   */
  generateCommitMessage: async (
    options: GenerateCommitOptions
  ): Promise<IPCResult<GeneratedCommitResult>> => {
    if (!options || typeof options !== 'object') {
      return {
        success: false,
        error: 'Options must be an object.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_COMMIT, options);
  },

  /**
   * Queries environment-configured webhook defaults and active resolution from Main process.
   */
  getWebhookConfig: async (): Promise<IPCResult<ResolvedWebhookConfig>> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.GET_WEBHOOK_CONFIG);
  },

  /**
   * Queries multi-provider AI configuration and environment defaults from Main process.
   */
  getAIConfig: async (): Promise<IPCResult<ResolvedAIConfig>> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_AI_CONFIG);
  },

  /**
   * Analyzes active repository changes for cross-repository workspace impact and plain-English review.
   */
  reviewWorkspaceChanges: async (
    options: WorkspaceReviewOptions
  ): Promise<IPCResult<WorkspaceReviewResult>> => {
    if (!options || typeof options !== 'object') {
      return {
        success: false,
        error: 'Options must be an object.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.AI_REVIEW_WORKSPACE, options);
  },

  /**
   * Opens the OS native terminal emulator at the specified directory path.
   */
  openTerminal: async (targetPath: string): Promise<IPCResult<boolean>> => {
    if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
      return {
        success: false,
        error: 'Target directory path must be a non-empty string.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_TERMINAL, targetPath.trim());
  },

  /**
   * Discovers runnable services across the active workspace repositories or directory path.
   */
  discoverServices: async (target: string | string[]): Promise<IPCResult<WorkspaceService[]>> => {
    if (
      (!target || (typeof target !== 'string' && !Array.isArray(target))) ||
      (typeof target === 'string' && target.trim().length === 0) ||
      (Array.isArray(target) && target.length === 0)
    ) {
      return {
        success: false,
        error: 'Target must be a non-empty path string or array of repository paths.',
      };
    }
    const cleanTarget = typeof target === 'string' ? target.trim() : target.map((p) => p.trim()).filter(Boolean);
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_DISCOVER, cleanTarget);
  },

  /**
   * Starts a service by ID.
   */
  startService: async (serviceId: string): Promise<IPCResult<WorkspaceService>> => {
    if (typeof serviceId !== 'string' || serviceId.trim().length === 0) {
      return {
        success: false,
        error: 'Service ID must be a non-empty string.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_START, serviceId.trim());
  },

  /**
   * Stops a running service by ID.
   */
  stopService: async (serviceId: string): Promise<IPCResult<WorkspaceService>> => {
    if (typeof serviceId !== 'string' || serviceId.trim().length === 0) {
      return {
        success: false,
        error: 'Service ID must be a non-empty string.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_STOP, serviceId.trim());
  },

  /**
   * Restarts a service by ID.
   */
  restartService: async (serviceId: string): Promise<IPCResult<WorkspaceService>> => {
    if (typeof serviceId !== 'string' || serviceId.trim().length === 0) {
      return {
        success: false,
        error: 'Service ID must be a non-empty string.',
      };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_RESTART, serviceId.trim());
  },

  /**
   * Starts all discovered services.
   */
  startAllServices: async (): Promise<IPCResult<WorkspaceService[]>> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_START_ALL);
  },

  /**
   * Gracefully stops all active services.
   */
  stopAllServices: async (): Promise<IPCResult<WorkspaceService[]>> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_STOP_ALL);
  },

  /**
   * Queries buffered output logs for a service or all services.
   */
  getServiceLogs: async (serviceId?: string): Promise<IPCResult<ServiceLogEntry[]>> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_GET_LOGS, serviceId);
  },

  /**
   * Clears buffered logs for a service or all services.
   */
  clearServiceLogs: async (serviceId?: string): Promise<IPCResult<boolean>> => {
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_CLEAR_LOGS, serviceId);
  },

  /**
   * Dynamically updates the runtime port or command configuration for a service.
   */
  updateServiceConfig: async (
    serviceId: string,
    updates: { port?: number | string; command?: string }
  ): Promise<IPCResult<WorkspaceService>> => {
    if (typeof serviceId !== 'string' || !serviceId.trim()) {
      return { success: false, error: 'Service ID must be a non-empty string.' };
    }
    return await ipcRenderer.invoke(IPC_CHANNELS.SERVICES_UPDATE_CONFIG, { serviceId, updates });
  },

  /**
   * Subscribes to real-time service status changes.
   */
  onServiceStatusChanged: (callback: (service: WorkspaceService) => void): (() => void) => {
    if (typeof ipcRenderer?.on !== 'function') return () => {};
    const listener = (_event: unknown, service: WorkspaceService) => callback(service);
    ipcRenderer.on('services:status-changed', listener);
    return () => {
      ipcRenderer.removeListener('services:status-changed', listener);
    };
  },

  /**
   * Subscribes to real-time service log output.
   */
  onServiceLog: (callback: (log: ServiceLogEntry) => void): (() => void) => {
    if (typeof ipcRenderer?.on !== 'function') return () => {};
    const listener = (_event: unknown, log: ServiceLogEntry) => callback(log);
    ipcRenderer.on('services:log-append', listener);
    return () => {
      ipcRenderer.removeListener('services:log-append', listener);
    };
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
