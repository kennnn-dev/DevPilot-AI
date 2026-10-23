import { useState, useCallback, useRef } from 'react';
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
   * Selects a staged file and queries its staged diff.
   */
  const handleSelectFile = useCallback(
    async (file: GitFileStatus) => {
      const currentRepo = repoPathRef.current;
      if (!currentRepo || !checkApiAvailable()) return;

      setSelectedFile(file);
      activeDiffFileRef.current = file.path;
      setDiffLoading(true);

      try {
        const res = await window.devPilot.getStagedDiff(currentRepo, file.path, file.oldPath);

        // Guard against race conditions: verify this request matches latest selected file
        if (activeDiffFileRef.current === file.path) {
          if (res.success && res.data) {
            setDiffResult(res.data);
          } else {
            setError(res.error || `Failed to fetch staged diff for ${file.path}`);
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
   * Refreshes repository status and synchronizes the active staged diff.
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
        setStaged(newStaged);
        setUnstaged(res.data.unstaged ?? []);
        setUntracked(res.data.untracked ?? []);

        // Check if currently selected staged file still exists in refreshed staged list
        const currentPath = selectedFileRef.current?.path;
        if (currentPath) {
          const matchingFile = newStaged.find((f) => f.path === currentPath);
          if (matchingFile) {
            // Update selected file reference with fresh status
            setSelectedFile(matchingFile);
            // Re-fetch staged diff
            activeDiffFileRef.current = matchingFile.path;
            setDiffLoading(true);
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
   * Clears active error notification.
   */
  const handleDismissError = useCallback(() => {
    setError(null);
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
  };
}
