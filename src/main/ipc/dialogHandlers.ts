import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';

/**
 * Registers native folder picker dialog IPC handler.
 * @param getMainWindow Optional getter function to resolve the active BrowserWindow.
 */
export function registerDialogHandlers(getMainWindow?: () => BrowserWindow | null): void {
  // Remove existing handler if previously registered (prevents registration collisions in tests/reloads)
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY);
  }

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, async (): Promise<string | null> => {
    try {
      const parentWindow = getMainWindow ? getMainWindow() : BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(
        parentWindow ?? (undefined as unknown as BrowserWindow),
        {
          title: 'Select Local Git Repository',
          properties: ['openDirectory', 'dontAddToRecent'],
        }
      );

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('[DialogHandlers] Error opening directory dialog:', error);
      return null;
    }
  });
}
