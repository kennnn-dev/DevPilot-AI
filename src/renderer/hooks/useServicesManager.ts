import { useState, useEffect, useCallback, useMemo } from 'react';
import type { WorkspaceService, ServiceLogEntry } from '../../shared/types';

export interface UseServicesManagerOptions {
  workspaceId?: string;
  workspaceName?: string;
  workspaceRepoPaths?: string[];
  activeWorkspacePath?: string | null;
}

/**
 * Resolves the common root directory across multiple repository paths in a workspace.
 * Avoids resolving to generic system locations like Desktop, home, or root.
 */
export function resolveWorkspaceRoot(repoPaths: string[]): string | null {
  if (!repoPaths || repoPaths.length === 0) return null;
  if (repoPaths.length === 1) return repoPaths[0];

  const splitPaths = repoPaths.map((p) => p.split(/[/\\]/).filter(Boolean));
  const first = splitPaths[0];
  let commonLen = 0;

  for (let i = 0; i < first.length; i++) {
    const segment = first[i];
    if (splitPaths.every((p) => p[i] === segment)) {
      commonLen++;
    } else {
      break;
    }
  }

  if (commonLen > 0) {
    const lastSegment = first[commonLen - 1]?.toLowerCase();
    const genericFolders = ['desktop', 'downloads', 'documents', 'home', 'users', 'var', 'tmp'];
    // Avoid returning generic personal top-level directories like /home/user/Desktop or /home/user
    if (genericFolders.includes(lastSegment) || commonLen <= 3) {
      return null;
    }
    const prefix = repoPaths[0].startsWith('/') ? '/' : '';
    return prefix + first.slice(0, commonLen).join('/');
  }

  return null;
}

export function useServicesManager({
  workspaceId,
  workspaceName,
  workspaceRepoPaths = [],
  activeWorkspacePath,
}: UseServicesManagerOptions = {}) {
  const [services, setServices] = useState<WorkspaceService[]>([]);
  const [logs, setLogs] = useState<ServiceLogEntry[]>([]);
  const [activeLogServiceId, setActiveLogServiceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Compute effective root path for the current workspace
  const computedRoot = useMemo(() => {
    if (workspaceRepoPaths && workspaceRepoPaths.length > 0) {
      return resolveWorkspaceRoot(workspaceRepoPaths);
    }
    return activeWorkspacePath || null;
  }, [workspaceRepoPaths, activeWorkspacePath]);

  const [scannedPath, setScannedPath] = useState<string | null>(computedRoot);

  // Discover services when active workspace changes or on demand
  const discover = useCallback(async (customTarget?: string | string[] | null) => {
    let target = customTarget;
    if (!target) {
      if (workspaceRepoPaths && workspaceRepoPaths.length > 0) {
        target = workspaceRepoPaths;
      } else if (scannedPath) {
        target = scannedPath;
      } else if (computedRoot) {
        target = computedRoot;
      }
    }

    if (!target || (Array.isArray(target) && target.length === 0)) {
      setServices([]);
      return;
    }

    if (!window.devPilot || typeof window.devPilot.discoverServices !== 'function') {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await window.devPilot.discoverServices(target);
      if (res.success && res.data) {
        setServices(res.data);
        if (typeof target === 'string') {
          setScannedPath(target);
        } else if (Array.isArray(target)) {
          setScannedPath(computedRoot || `${workspaceName || 'Workspace'} (${target.length} repositories)`);
        }
      } else if (!res.success) {
        setError(res.error || 'Failed to discover services');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error discovering services');
    } finally {
      setLoading(false);
    }
  }, [workspaceRepoPaths, scannedPath, computedRoot, workspaceName]);

  // Re-discover whenever workspaceId or workspace repositories change (strict per-workspace scoping)
  const reposKey = workspaceRepoPaths.join(',');
  useEffect(() => {
    if (workspaceRepoPaths && workspaceRepoPaths.length > 0) {
      setScannedPath(computedRoot || `${workspaceName || 'Workspace'} (${workspaceRepoPaths.length} repositories)`);
      discover(workspaceRepoPaths);
    } else if (computedRoot) {
      setScannedPath(computedRoot);
      discover(computedRoot);
    } else {
      setServices([]);
      setScannedPath(null);
    }
  }, [workspaceId, reposKey, computedRoot]);

  // Folder picker to manually select any directory to scan
  const selectFolder = useCallback(async () => {
    if (!window.devPilot || typeof window.devPilot.openDirectory !== 'function') return;
    try {
      const selected = await window.devPilot.openDirectory();
      if (selected) {
        setScannedPath(selected);
        await discover(selected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error selecting directory');
    }
  }, [discover]);

  // Subscribe to real-time events from Main process
  useEffect(() => {
    if (!window.devPilot) return;

    let unsubStatus: (() => void) | undefined;
    let unsubLog: (() => void) | undefined;

    if (typeof window.devPilot.onServiceStatusChanged === 'function') {
      unsubStatus = window.devPilot.onServiceStatusChanged((updatedService) => {
        setServices((prev) => {
          const index = prev.findIndex((s) => s.id === updatedService.id);
          if (index === -1) {
            return [...prev, updatedService];
          }
          const next = [...prev];
          next[index] = updatedService;
          return next;
        });
      });
    }

    if (typeof window.devPilot.onServiceLog === 'function') {
      unsubLog = window.devPilot.onServiceLog((entry) => {
        setLogs((prev) => {
          const next = [...prev, entry];
          if (next.length > 2000) {
            return next.slice(-1500);
          }
          return next;
        });
      });
    }

    return () => {
      if (unsubStatus) unsubStatus();
      if (unsubLog) unsubLog();
    };
  }, []);

  // Fetch initial logs when modal opens
  const refreshLogs = useCallback(async (serviceId?: string) => {
    if (!window.devPilot || typeof window.devPilot.getServiceLogs !== 'function') return;
    try {
      const res = await window.devPilot.getServiceLogs(serviceId);
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch {
      // Ignore initial log fetch error
    }
  }, []);

  const startService = useCallback(async (serviceId: string) => {
    if (!window.devPilot || typeof window.devPilot.startService !== 'function') return;
    setActionLoadingId(serviceId);
    setError(null);
    try {
      const res = await window.devPilot.startService(serviceId);
      if (res.success && res.data) {
        setServices((prev) => prev.map((s) => (s.id === serviceId ? res.data! : s)));
      } else if (!res.success) {
        setError(res.error || 'Failed to start service');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error starting service');
    } finally {
      setActionLoadingId(null);
    }
  }, []);

  const stopService = useCallback(async (serviceId: string) => {
    if (!window.devPilot || typeof window.devPilot.stopService !== 'function') return;
    setActionLoadingId(serviceId);
    setError(null);
    try {
      const res = await window.devPilot.stopService(serviceId);
      if (res.success && res.data) {
        setServices((prev) => prev.map((s) => (s.id === serviceId ? res.data! : s)));
      } else if (!res.success) {
        setError(res.error || 'Failed to stop service');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error stopping service');
    } finally {
      setActionLoadingId(null);
    }
  }, []);

  const restartService = useCallback(async (serviceId: string) => {
    if (!window.devPilot || typeof window.devPilot.restartService !== 'function') return;
    setActionLoadingId(serviceId);
    setError(null);
    try {
      const res = await window.devPilot.restartService(serviceId);
      if (res.success && res.data) {
        setServices((prev) => prev.map((s) => (s.id === serviceId ? res.data! : s)));
      } else if (!res.success) {
        setError(res.error || 'Failed to restart service');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error restarting service');
    } finally {
      setActionLoadingId(null);
    }
  }, []);

  const startAll = useCallback(async () => {
    if (!window.devPilot || typeof window.devPilot.startAllServices !== 'function') return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.devPilot.startAllServices();
      if (res.success && res.data) {
        setServices(res.data);
      } else if (!res.success) {
        setError(res.error || 'Failed to start all services');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error starting all services');
    } finally {
      setLoading(false);
    }
  }, []);

  const stopAll = useCallback(async () => {
    if (!window.devPilot || typeof window.devPilot.stopAllServices !== 'function') return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.devPilot.stopAllServices();
      if (res.success && res.data) {
        setServices(res.data);
      } else if (!res.success) {
        setError(res.error || 'Failed to stop all services');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error stopping all services');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLogs = useCallback(async (serviceId?: string) => {
    if (!window.devPilot || typeof window.devPilot.clearServiceLogs !== 'function') {
      setLogs([]);
      return;
    }
    try {
      await window.devPilot.clearServiceLogs(serviceId);
      setLogs((prev) => (serviceId ? prev.filter((l) => l.serviceId !== serviceId) : []));
    } catch {
      setLogs([]);
    }
  }, []);

  const openTerminalForService = useCallback(async (service: WorkspaceService) => {
    if (!window.devPilot || typeof window.devPilot.openTerminal !== 'function') return;
    try {
      await window.devPilot.openTerminal(service.cwd);
    } catch (err) {
      console.error('[Services] Failed to open terminal:', err);
    }
  }, []);

  const updateServicePort = useCallback(
    async (serviceId: string, newPort: number | string) => {
      if (!window.devPilot || typeof window.devPilot.updateServiceConfig !== 'function') return;
      try {
        const res = await window.devPilot.updateServiceConfig(serviceId, { port: newPort });
        if (res.success && res.data) {
          setServices((prev) => prev.map((s) => (s.id === serviceId ? res.data! : s)));
        }
      } catch (err) {
        console.error('[Services] Failed to update service port:', err);
      }
    },
    []
  );

  const runningCount = useMemo(() => {
    return services.filter((s) => s.status === 'running' || s.status === 'starting').length;
  }, [services]);

  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) return services;
    const query = searchQuery.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.command.toLowerCase().includes(query) ||
        s.type.toLowerCase().includes(query) ||
        (s.detectedPort && String(s.detectedPort).includes(query))
    );
  }, [services, searchQuery]);

  const filteredLogs = useMemo(() => {
    if (!activeLogServiceId) return logs;
    return logs.filter((l) => l.serviceId === activeLogServiceId);
  }, [logs, activeLogServiceId]);

  return {
    services,
    filteredServices,
    runningCount,
    logs: filteredLogs,
    allLogs: logs,
    activeLogServiceId,
    setActiveLogServiceId,
    searchQuery,
    setSearchQuery,
    scannedPath,
    workspaceName,
    workspaceId,
    loading,
    actionLoadingId,
    error,
    isOpen,
    openModal: () => {
      setIsOpen(true);
      refreshLogs();
    },
    closeModal: () => setIsOpen(false),
    discover,
    selectFolder,
    startService,
    stopService,
    restartService,
    updateServicePort,
    startAll,
    stopAll,
    clearLogs,
    openTerminalForService,
  };
}
