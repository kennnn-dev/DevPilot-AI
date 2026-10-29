import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import { serviceManager } from '../services/services/serviceManager';
import type { IPCResult, WorkspaceService, ServiceLogEntry } from '../../shared/types';

/**
 * Registers all Universal Service Control Board IPC handlers.
 */
export function registerServiceHandlers(): void {
  // Clear any previous handlers before registering
  const channels = [
    IPC_CHANNELS.SERVICES_DISCOVER,
    IPC_CHANNELS.SERVICES_START,
    IPC_CHANNELS.SERVICES_STOP,
    IPC_CHANNELS.SERVICES_RESTART,
    IPC_CHANNELS.SERVICES_START_ALL,
    IPC_CHANNELS.SERVICES_STOP_ALL,
    IPC_CHANNELS.SERVICES_GET_LOGS,
    IPC_CHANNELS.SERVICES_CLEAR_LOGS,
    IPC_CHANNELS.SERVICES_UPDATE_CONFIG,
  ];

  for (const ch of channels) {
    if (typeof ipcMain.removeHandler === 'function') {
      ipcMain.removeHandler(ch);
    }
  }

  // 1. SERVICES_DISCOVER
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_DISCOVER,
    async (_event, target: unknown): Promise<IPCResult<WorkspaceService[]>> => {
      try {
        if (
          (!target || (typeof target !== 'string' && !Array.isArray(target))) ||
          (typeof target === 'string' && !target.trim()) ||
          (Array.isArray(target) && target.length === 0)
        ) {
          return { success: false, error: 'Target must be a non-empty path string or array of repository paths.' };
        }
        const services = await serviceManager.discoverServices(target as string | string[]);
        return { success: true, data: services };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to discover services.',
        };
      }
    }
  );

  // 2. SERVICES_START
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_START,
    async (_event, serviceId: unknown): Promise<IPCResult<WorkspaceService>> => {
      try {
        if (typeof serviceId !== 'string' || !serviceId.trim()) {
          return { success: false, error: 'Service ID must be a non-empty string.' };
        }
        const service = await serviceManager.startService(serviceId.trim());
        return { success: true, data: service };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to start service.',
        };
      }
    }
  );

  // 3. SERVICES_STOP
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_STOP,
    async (_event, serviceId: unknown): Promise<IPCResult<WorkspaceService>> => {
      try {
        if (typeof serviceId !== 'string' || !serviceId.trim()) {
          return { success: false, error: 'Service ID must be a non-empty string.' };
        }
        const service = await serviceManager.stopService(serviceId.trim());
        return { success: true, data: service };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to stop service.',
        };
      }
    }
  );

  // 4. SERVICES_RESTART
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_RESTART,
    async (_event, serviceId: unknown): Promise<IPCResult<WorkspaceService>> => {
      try {
        if (typeof serviceId !== 'string' || !serviceId.trim()) {
          return { success: false, error: 'Service ID must be a non-empty string.' };
        }
        const service = await serviceManager.restartService(serviceId.trim());
        return { success: true, data: service };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to restart service.',
        };
      }
    }
  );

  // 5. SERVICES_START_ALL
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_START_ALL,
    async (): Promise<IPCResult<WorkspaceService[]>> => {
      try {
        const services = await serviceManager.startAll();
        return { success: true, data: services };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to start all services.',
        };
      }
    }
  );

  // 6. SERVICES_STOP_ALL
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_STOP_ALL,
    async (): Promise<IPCResult<WorkspaceService[]>> => {
      try {
        const services = await serviceManager.stopAll();
        return { success: true, data: services };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to stop all services.',
        };
      }
    }
  );

  // 7. SERVICES_GET_LOGS
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_GET_LOGS,
    async (_event, serviceId?: unknown): Promise<IPCResult<ServiceLogEntry[]>> => {
      try {
        const id = typeof serviceId === 'string' && serviceId.trim() ? serviceId.trim() : undefined;
        const logs = serviceManager.getLogs(id);
        return { success: true, data: logs };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to query logs.',
        };
      }
    }
  );

  // 8. SERVICES_CLEAR_LOGS
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_CLEAR_LOGS,
    async (_event, serviceId?: unknown): Promise<IPCResult<boolean>> => {
      try {
        const id = typeof serviceId === 'string' && serviceId.trim() ? serviceId.trim() : undefined;
        const cleared = serviceManager.clearLogs(id);
        return { success: true, data: cleared };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to clear logs.',
        };
      }
    }
  );

  // 9. SERVICES_UPDATE_CONFIG
  ipcMain.handle(
    IPC_CHANNELS.SERVICES_UPDATE_CONFIG,
    async (
      _event,
      payload: { serviceId: string; updates: { port?: number | string; command?: string } }
    ): Promise<IPCResult<WorkspaceService>> => {
      try {
        if (!payload || !payload.serviceId || typeof payload.serviceId !== 'string') {
          return { success: false, error: 'Service ID must be provided.' };
        }
        const updated = serviceManager.updateServiceConfig(payload.serviceId, payload.updates || {});
        return { success: true, data: updated };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update service config.',
        };
      }
    }
  );

  // Wire event forwarding to all open renderer windows
  serviceManager.onStatusChange((service) => {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('services:status-changed', service);
        }
      }
    } catch {
      // Ignore if windows not ready
    }
  });

  serviceManager.onLog((log) => {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('services:log-append', log);
        }
      }
    } catch {
      // Ignore if windows not ready
    }
  });
}
