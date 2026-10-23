import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  GitFileStatus,
  GitDiffResult,
} from '../../shared/types';

/**
 * State exposed by the useGitRepo hook.
 */
export interface UseGitRepoState {
  /** Absolute path to the currently opened repository root, or null if none */
  repoPath: string | null;
  /** Active branch name, short commit SHA if detached, or empty string if no repo */
  branch: string;
  /** Whether HEAD is in a detached state */
  isDetached: boolean;
  /** List of files with staged changes */
  staged: GitFileStatus[];
  /** List of files with unstaged working tree changes */
  unstaged: GitFileStatus[];
  /** List of untracked files */
  untracked: GitFileStatus[];
  /** Currently selected staged file for diff inspection */
  selectedFile: GitFileStatus | null;
  /** Parsed diff result for the selected staged file */
  diffResult: GitDiffResult | null;
  /** Indicates whether initial repository status is loading */
  loading: boolean;
  /** Indicates whether a background refresh is in progress */
  refreshing: boolean;
  /** Indicates whether staged diff content is loading */
  diffLoading: boolean;
  /** Error message to display, or null if no error */
  error: string | null;
}

/**
 * Action callbacks exposed by the useGitRepo hook.
 */
export interface UseGitRepoActions {
  /** Opens native directory dialog and loads selected Git repository */
  handleOpenDirectory: () => Promise<void>;
  /** Loads or updates repository status for a given directory path */
  loadRepoStatus: (path: string) => Promise<void>;
  /** Refreshes current working tree status and re-fetches active staged diff */
  handleRefresh: () => Promise<void>;
  /** Selects a staged file and queries its staged diff */
  handleSelectFile: (file: GitFileStatus) => Promise<void>;
  /** Clears the current error state */
  handleDismissError: () => void;
  /** Clears current repository state and resets to empty */
  clearRepo: () => void;
  /** Deselects currently selected file and closes diff viewer */
  deselectFile: () => void;
}

export type UseGitRepoReturn = UseGitRepoState & UseGitRepoActions;

/**
 * Custom React hook managing local Git repository state and read-only IPC interactions.
 */
export function useGitRepo(): UseGitRepoReturn {
  // State variables
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [branch, setBranch] = useState<string>('');
  const [isDetached, setIsDetached] = useState<boolean>(false);
  const [staged, setStaged] = useState<GitFileStatus[]>([]);
  const [unstaged, setUnstaged] = useState<GitFileStatus[]>([]);
  const [untracked, setUntracked] = useState<GitFileStatus[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null);
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [diffLoading, setDiffLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active diff request token to prevent out-of-order race conditions
  const activeDiffFileRef = useRef<string | null>(null);
  // Ref keeping track of current selected file across asynchronous closures
  const selectedFileRef = useRef<GitFileStatus | null>(null);
  selectedFileRef.current = selectedFile;
  // Ref keeping track of active diff result across asynchronous closures
  const diffResultRef = useRef<GitDiffResult | null>(null);
  diffResultRef.current = diffResult;
  // Ref keeping track of current repository path
  const repoPathRef = useRef<string | null>(null);
  repoPathRef.current = repoPath;

  /**
   * Checks whether the window.devPilot Electron preload bridge is present.
   */
  const checkApiAvailable = (): boolean => {
    return typeof window !== 'undefined' && Boolean(window.devPilot);
  };

  /**
   * Loads repository status for the specified path.
   */
  const loadRepoStatus = useCallback(
    async (targetPath: string) => {
      if (!checkApiAvailable()) {
        setError('DevPilot API not available. Preload bridge active only inside Electron.');
        return;
      }

      setLoading(true);
      setError(null);
      setRepoPath(targetPath);

      try {
        const res = await window.devPilot.getStatus(targetPath);
        if (res.success && res.data) {
          setBranch(res.data.branch);
          setIsDetached(res.data.isDetached);
          setStaged(res.data.staged ?? []);
          setUnstaged(res.data.unstaged ?? []);
          setUntracked(res.data.untracked ?? []);
        } else {
          setError(res.error || `Failed to read repository status for: ${targetPath}`);
          setBranch('');
          setIsDetached(false);
          setStaged([]);
          setUnstaged([]);
          setUntracked([]);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setBranch('');
        setIsDetached(false);
        setStaged([]);
        setUnstaged([]);
        setUntracked([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Prompts native directory selection dialog and opens chosen repository.
   */
  const handleOpenDirectory = useCallback(async () => {
    if (!checkApiAvailable()) {
      setError('DevPilot API not available. Preload bridge active only inside Electron.');
      return;
    }

    try {
      const selected = await window.devPilot.openDirectory();
      if (selected) {
        // Clear previous state and selection
        setError(null);
        setSelectedFile(null);
        setDiffResult(null);
        activeDiffFileRef.current = null;
        await loadRepoStatus(selected);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadRepoStatus]);

  /**
   * Selects a file (staged, unstaged, or untracked) and queries its diff.
   */
  const handleSelectFile = useCallback(
    async (file: GitFileStatus, scope?: 'staged' | 'unstaged' | 'untracked') => {
      const currentRepo = repoPathRef.current;
      if (!currentRepo || !checkApiAvailable()) return;

      setSelectedFile(file);
      activeDiffFileRef.current = file.path;
      setDiffLoading(true);

      const resolvedScope =
        scope ||
        (file.changeType === 'untracked' || file.statusCode === '??'
          ? 'untracked'
          : file.statusCode[0] !== ' ' && file.statusCode[0] !== '?'
          ? 'staged'
          : 'unstaged');

      try {
        const res =
          scope === undefined && resolvedScope === 'staged'
            ? await window.devPilot.getStagedDiff(currentRepo, file.path, file.oldPath)
            : await window.devPilot.getStagedDiff(
                currentRepo,
                file.path,
                file.oldPath,
                resolvedScope
              );

        // Guard against race conditions: verify this request matches latest selected file
        if (activeDiffFileRef.current === file.path) {
          if (res.success && res.data) {
            setDiffResult(res.data);
          } else {
            setError(res.error || `Failed to fetch diff for ${file.path}`);
            setDiffResult(null);
          }
        }
      } catch (err: unknown) {
        if (activeDiffFileRef.current === file.path) {
          setError(err instanceof Error ? err.message : String(err));
          setDiffResult(null);
        }
      } finally {
        if (activeDiffFileRef.current === file.path) {
          setDiffLoading(false);
        }
      }
    },
    []
  );

  /**
   * Refreshes repository status and synchronizes the active diff.
   */
  const handleRefresh = useCallback(async () => {
    const currentRepo = repoPathRef.current;
    if (!currentRepo || !checkApiAvailable() || refreshing || loading) return;

    setRefreshing(true);
    setError(null);

    try {
      const res = await window.devPilot.getStatus(currentRepo);
      if (res.success && res.data) {
        setBranch(res.data.branch);
        setIsDetached(res.data.isDetached);
        const newStaged = res.data.staged ?? [];
        const newUnstaged = res.data.unstaged ?? [];
        const newUntracked = res.data.untracked ?? [];
        setStaged(newStaged);
        setUnstaged(newUnstaged);
        setUntracked(newUntracked);

        // Check if currently selected file still exists in refreshed lists
        const currentPath = selectedFileRef.current?.path;
        if (currentPath) {
          const matchingFile =
            newStaged.find((f) => f.path === currentPath) ||
            newUnstaged.find((f) => f.path === currentPath) ||
            newUntracked.find((f) => f.path === currentPath);

          if (matchingFile) {
            // Update selected file reference with fresh status
            setSelectedFile(matchingFile);
            // Re-fetch diff in background without wiping active view (avoids flicker)
            activeDiffFileRef.current = matchingFile.path;
            if (!diffResultRef.current) {
              setDiffLoading(true);
            }
            try {
              const diffRes = await window.devPilot.getStagedDiff(
                currentRepo,
                matchingFile.path,
                matchingFile.oldPath
              );
              if (activeDiffFileRef.current === matchingFile.path) {
                if (diffRes.success && diffRes.data) {
                  setDiffResult(diffRes.data);
                } else {
                  setError(diffRes.error || `Failed to refresh diff for ${matchingFile.path}`);
                }
              }
            } catch (diffErr: unknown) {
              if (activeDiffFileRef.current === matchingFile.path) {
                setError(diffErr instanceof Error ? diffErr.message : String(diffErr));
              }
            } finally {
              if (activeDiffFileRef.current === matchingFile.path) {
                setDiffLoading(false);
              }
            }
          } else {
            // File was committed, unstaged, or discarded externally
            setSelectedFile(null);
            setDiffResult(null);
            activeDiffFileRef.current = null;
          }
        }
      } else {
        setError(res.error || 'Failed to refresh repository status.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loading]);

  /**
   * Real-time automatic tracking (Method B fs.watch + Window Focus auto-sync).
   * Automatically refreshes Git status when files are edited externally (e.g. in VS Code)
   * or when switching back to the DevPilot window.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onRepoChanged = () => {
      handleRefresh();
    };

    const onWindowFocus = () => {
      handleRefresh();
    };

    window.addEventListener('devpilot:repo-changed', onRepoChanged);
    window.addEventListener('focus', onWindowFocus);

    return () => {
      window.removeEventListener('devpilot:repo-changed', onRepoChanged);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [handleRefresh]);

  /**
   * Clears active error notification.
   */
  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clears current repository state and resets to empty.
   */
  const clearRepo = useCallback(() => {
    setRepoPath(null);
    setBranch('');
    setIsDetached(false);
    setStaged([]);
    setUnstaged([]);
    setUntracked([]);
    setSelectedFile(null);
    setDiffResult(null);
    setError(null);
    activeDiffFileRef.current = null;
  }, []);

  /**
   * Deselects currently selected file and closes diff viewer.
   */
  const deselectFile = useCallback(() => {
    setSelectedFile(null);
    setDiffResult(null);
    activeDiffFileRef.current = null;
  }, []);

  return {
    repoPath,
    branch,
    isDetached,
    staged,
    unstaged,
    untracked,
    selectedFile,
    diffResult,
    loading,
    refreshing,
    diffLoading,
    error,
    handleOpenDirectory,
    loadRepoStatus,
    handleRefresh,
    handleSelectFile,
    handleDismissError,
    clearRepo,
    deselectFile,
  };
}
