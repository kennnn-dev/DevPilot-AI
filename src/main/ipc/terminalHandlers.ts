import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import { launchTerminal } from '../services/system/terminalLauncher';
import type { IPCResult } from '../../shared/types';

/**
 * Registers OS native terminal launcher IPC handlers.
 */
export function registerTerminalHandlers(): void {
  // Clear any existing handler before registering
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_OPEN_TERMINAL);
  }

  const handler = async (_event: Electron.IpcMainInvokeEvent, targetPath: unknown): Promise<IPCResult<boolean>> => {
    if (typeof targetPath !== 'string') {
      return {
        success: false,
        error: 'Invalid target directory path provided.',
      };
    }
    return await launchTerminal(targetPath);
  };

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_TERMINAL, handler);
}
