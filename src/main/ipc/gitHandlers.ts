import { ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import type { GitStatusResult, GitDiffResult, GitAllStagedDiffResult, IPCResult } from '../../shared/types';
import { gitService } from '../git/gitService';
import { startWatchingRepo } from '../git/repoWatcher';

/**
 * Validates a repository path string.
 * Ensures it is non-empty, contains no null bytes, and resolves to an absolute path.
 */
export function validateRepoPathInput(repoPath: unknown): {
  isValid: boolean;
  resolvedPath?: string;
  error?: string;
} {
  if (typeof repoPath !== 'string' || repoPath.trim().length === 0) {
    return {
      isValid: false,
      error: 'Repository path must be a non-empty string.',
    };
  }

  if (repoPath.includes('\0')) {
    return {
      isValid: false,
      error: 'Repository path must not contain null bytes.',
    };
  }

  const resolved = path.resolve(repoPath.trim());
  return { isValid: true, resolvedPath: resolved };
}

/**
 * Validates parameters for staged diff inspection.
 */
export function validateStagedDiffInput(payload: unknown): {
  isValid: boolean;
  repoPath?: string;
  filePath?: string;
  oldPath?: string;
  scope?: 'staged' | 'unstaged' | 'untracked';
  error?: string;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      isValid: false,
      error: 'Invalid diff parameters provided: payload must be an object with repoPath and filePath.',
    };
  }

  const { repoPath, filePath, oldPath } = payload as Record<string, unknown>;

  if (typeof repoPath !== 'string' || repoPath.trim().length === 0) {
    return {
      isValid: false,
      error: 'Invalid diff parameters provided: repoPath must be a non-empty string.',
    };
  }

  if (repoPath.includes('\0')) {
    return {
      isValid: false,
      error: 'Invalid diff parameters provided: repoPath must not contain null bytes.',
    };
  }

  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return {
      isValid: false,
      error: 'Invalid diff parameters provided: filePath must be a non-empty string.',
    };
  }

  if (filePath.includes('\0')) {
    return {
      isValid: false,
      error: 'Invalid diff parameters provided: filePath must not contain null bytes.',
    };
  }

  if (oldPath !== undefined) {
    if (typeof oldPath !== 'string' || oldPath.trim().length === 0) {
      return {
        isValid: false,
        error: 'Invalid diff parameters provided: oldPath must be a non-empty string when provided.',
      };
    }
    if (oldPath.includes('\0')) {
      return {
        isValid: false,
        error: 'Invalid diff parameters provided: oldPath must not contain null bytes.',
      };
    }
  }

  const resolvedRepo = path.resolve(repoPath.trim());
  const { scope } = payload as Record<string, unknown>;
  let validScope: 'staged' | 'unstaged' | 'untracked' | undefined = undefined;
  if (scope === 'staged' || scope === 'unstaged' || scope === 'untracked') {
    validScope = scope;
  }

  return {
    isValid: true,
    repoPath: resolvedRepo,
    filePath: filePath.trim(),
    oldPath: typeof oldPath === 'string' ? oldPath.trim() : undefined,
    scope: validScope,
  };
}

/**
 * Registers safe read-only Git IPC handlers.
 */
export function registerGitHandlers(): void {
  // Clear any existing handlers to allow clean hot-reloading / testing
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.GIT_GET_STATUS);
    ipcMain.removeHandler(IPC_CHANNELS.GIT_GET_STAGED_DIFF);
    ipcMain.removeHandler(IPC_CHANNELS.GIT_GET_ALL_STAGED_DIFF);
  }

  // 1. git:get-status
  ipcMain.handle(
    IPC_CHANNELS.GIT_GET_STATUS,
    async (_event, repoPath: unknown): Promise<IPCResult<GitStatusResult>> => {
      const validation = validateRepoPathInput(repoPath);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      try {
        const result = await gitService.getStatus(validation.resolvedPath!);
        if (result.success) {
          startWatchingRepo(validation.resolvedPath!, (changedRepo) => {
            const windows = BrowserWindow?.getAllWindows?.() ?? [];
            for (const win of windows) {
              if (!win.isDestroyed()) {
                win.webContents.send('git:repo-changed', { repoPath: changedRepo });
              }
            }
          });
        }
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[GitHandlers] getStatus unexpected error:', message);
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  // 2. git:get-staged-diff
  ipcMain.handle(
    IPC_CHANNELS.GIT_GET_STAGED_DIFF,
    async (_event, payload: unknown): Promise<IPCResult<GitDiffResult>> => {
      const validation = validateStagedDiffInput(payload);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      try {
        return await gitService.getStagedDiff(
          validation.repoPath!,
          validation.filePath!,
          validation.oldPath,
          validation.scope
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[GitHandlers] getStagedDiff unexpected error:', message);
        return {
          success: false,
          error: message,
        };
      }
    }
  );

  // 3. git:get-all-staged-diff
  ipcMain.handle(
    IPC_CHANNELS.GIT_GET_ALL_STAGED_DIFF,
    async (_event, payload: unknown): Promise<IPCResult<GitAllStagedDiffResult>> => {
      const rawPath = typeof payload === 'object' && payload !== null && 'repoPath' in payload
        ? (payload as { repoPath: unknown }).repoPath
        : payload;
      const validation = validateRepoPathInput(rawPath);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }
      return await gitService.getAllStagedDiff(validation.resolvedPath!);
    }
  );
}
