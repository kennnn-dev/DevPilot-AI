import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Workspace } from '../../shared/types';

const STORAGE_KEY_WORKSPACES = 'devpilot_workspaces_v1';
const STORAGE_KEY_ACTIVE_WS = 'devpilot_active_workspace_id_v1';
const STORAGE_KEY_ACTIVE_REPO = 'devpilot_active_repo_path_v1';

export const DEFAULT_WORKSPACE: Workspace = {
  id: 'default',
  name: 'Default Workspace',
  createdAt: Date.now(),
  repoPaths: [],
};

export interface UseWorkspacesReturn {
  /** All workspaces */
  workspaces: Workspace[];
  /** ID of the currently active workspace */
  activeWorkspaceId: string;
  /** Active workspace object */
  activeWorkspace: Workspace;
  /** Absolute path of currently active repository in current workspace, or null */
  activeRepoPath: string | null;
  /** List of repository paths belonging to active workspace */
  currentRepoPaths: string[];
  /** Switch active workspace */
  selectWorkspace: (id: string) => void;
  /** Create a new workspace */
  createWorkspace: (name: string) => Workspace;
  /** Rename an existing workspace */
  renameWorkspace: (id: string, newName: string) => void;
  /** Delete a workspace (cannot delete if it's the last one) */
  deleteWorkspace: (id: string) => void;
  /** Add a local repository path to active workspace */
  addRepoToWorkspace: (repoPath: string, workspaceId?: string) => boolean;
  /** Remove a repository path from active workspace */
  removeRepoFromWorkspace: (repoPath: string, workspaceId?: string) => void;
  /** Set the currently active repository */
  setActiveRepoPath: (repoPath: string | null) => void;
  /** Reset workspaces to default (useful for testing or full reset) */
  resetWorkspaces: () => void;
}

export function useWorkspaces(): UseWorkspacesReturn {
  // Load initial workspaces from localStorage
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY_WORKSPACES);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {
      // Fallback on error
    }
    return [DEFAULT_WORKSPACE];
  });

  // Active workspace ID
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedId = window.localStorage.getItem(STORAGE_KEY_ACTIVE_WS);
        if (storedId) return storedId;
      }
    } catch {
      // Fallback
    }
    return 'default';
  });

  // Active repository path
  const [activeRepoPath, setActiveRepoPathState] = useState<string | null>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(STORAGE_KEY_ACTIVE_REPO);
      }
    } catch {
      // Fallback
    }
    return null;
  });

  // Keep active workspace valid
  const activeWorkspace = useMemo(() => {
    const found = workspaces.find((w) => w.id === activeWorkspaceId);
    return found || workspaces[0] || DEFAULT_WORKSPACE;
  }, [workspaces, activeWorkspaceId]);

  // Sync activeWorkspaceId if current activeWorkspace changed fallback
  useEffect(() => {
    if (activeWorkspace.id !== activeWorkspaceId) {
      setActiveWorkspaceId(activeWorkspace.id);
    }
  }, [activeWorkspace.id, activeWorkspaceId]);

  // Persist workspaces to localStorage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_WORKSPACES, JSON.stringify(workspaces));
        window.localStorage.setItem(STORAGE_KEY_ACTIVE_WS, activeWorkspaceId);
        if (activeRepoPath) {
          window.localStorage.setItem(STORAGE_KEY_ACTIVE_REPO, activeRepoPath);
        } else {
          window.localStorage.removeItem(STORAGE_KEY_ACTIVE_REPO);
        }
      }
    } catch {
      // Storage unavailable or quota exceeded
    }
  }, [workspaces, activeWorkspaceId, activeRepoPath]);

  // Switch workspace
  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    // When switching workspace, default active repo to the first repo of that workspace if available
    setWorkspaces((prev) => {
      const targetWs = prev.find((w) => w.id === id);
      if (targetWs && targetWs.repoPaths.length > 0) {
        setActiveRepoPathState(targetWs.repoPaths[0]);
      } else {
        setActiveRepoPathState(null);
      }
      return prev;
    });
  }, []);

  // Create workspace
  const createWorkspace = useCallback((name: string): Workspace => {
    const trimmed = name.trim();
    const finalName = trimmed || `Workspace ${Date.now().toString().slice(-4)}`;
    const newWs: Workspace = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: finalName,
      createdAt: Date.now(),
      repoPaths: [],
    };

    setWorkspaces((prev) => [...prev, newWs]);
    setActiveWorkspaceId(newWs.id);
    setActiveRepoPathState(null);
    return newWs;
  }, []);

  // Rename workspace
  const renameWorkspace = useCallback((id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, name: trimmed } : w))
    );
  }, []);

  // Delete workspace
  const deleteWorkspace = useCallback((id: string) => {
    setWorkspaces((prev) => {
      if (prev.length <= 1) return prev; // Cannot delete the only workspace
      const filtered = prev.filter((w) => w.id !== id);
      return filtered;
    });

    setActiveWorkspaceId((prevId) => {
      if (prevId === id) {
        // Find next available workspace
        const remaining = workspaces.filter((w) => w.id !== id);
        return remaining.length > 0 ? remaining[0].id : 'default';
      }
      return prevId;
    });
  }, [workspaces]);

  // Add repository to workspace
  const addRepoToWorkspace = useCallback(
    (repoPath: string, targetWorkspaceId?: string): boolean => {
      const trimmed = repoPath.trim();
      if (!trimmed) return false;

      const wsId = targetWorkspaceId || activeWorkspaceId;
      let added = false;

      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === wsId) {
            if (w.repoPaths.includes(trimmed)) {
              // Already exists in this workspace
              return w;
            }
            added = true;
            return {
              ...w,
              repoPaths: [...w.repoPaths, trimmed],
            };
          }
          return w;
        })
      );

      // Select this repo as active
      setActiveRepoPathState(trimmed);
      return added;
    },
    [activeWorkspaceId]
  );

  // Remove repository from workspace
  const removeRepoFromWorkspace = useCallback(
    (repoPath: string, targetWorkspaceId?: string) => {
      const wsId = targetWorkspaceId || activeWorkspaceId;
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === wsId) {
            const nextRepos = w.repoPaths.filter((p) => p !== repoPath);
            return {
              ...w,
              repoPaths: nextRepos,
            };
          }
          return w;
        })
      );

      // If active repo was removed, switch to another repo or null
      setActiveRepoPathState((prevActive) => {
        if (prevActive === repoPath) {
          const ws = workspaces.find((w) => w.id === wsId);
          if (ws) {
            const nextRepos = ws.repoPaths.filter((p) => p !== repoPath);
            return nextRepos.length > 0 ? nextRepos[0] : null;
          }
          return null;
        }
        return prevActive;
      });
    },
    [activeWorkspaceId, workspaces]
  );

  // Set active repo path
  const setActiveRepoPath = useCallback((repoPath: string | null) => {
    setActiveRepoPathState(repoPath);
  }, []);

  // Reset to default
  const resetWorkspaces = useCallback(() => {
    setWorkspaces([DEFAULT_WORKSPACE]);
    setActiveWorkspaceId('default');
    setActiveRepoPathState(null);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY_WORKSPACES);
        window.localStorage.removeItem(STORAGE_KEY_ACTIVE_WS);
        window.localStorage.removeItem(STORAGE_KEY_ACTIVE_REPO);
      }
    } catch {
      // Ignore
    }
  }, []);

  return {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    activeRepoPath,
    currentRepoPaths: activeWorkspace.repoPaths,
    selectWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    addRepoToWorkspace,
    removeRepoFromWorkspace,
    setActiveRepoPath,
    resetWorkspaces,
  };
}
