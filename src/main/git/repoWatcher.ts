/**
 * Native Node.js Real-Time Repository Watcher (Method B) for DevPilot AI.
 * Uses built-in `fs.watch` to detect working tree edits and Git branch/index mutations
 * in real-time with zero external dependencies and zero CPU polling.
 */

import fs from 'node:fs';
import path from 'node:path';

let activeWatchers: fs.FSWatcher[] = [];
let debounceTimer: NodeJS.Timeout | null = null;
let currentWatchedRepo: string | null = null;

const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git[/\\]objects/,
  /\.git[/\\]logs/,
  /\.git[/\\]hooks/,
  /\.git[/\\]info/,
  /\.git[/\\]COMMIT_EDITMSG/,
  /\.git[/\\]index\.lock/,
  /dist/,
  /release/,
  /vendor/,
  /\.next/,
  /\.cache/,
  /\.DS_Store/,
  /\.swp$/,
  /~$/,
];

/**
 * Stops any active filesystem watchers cleanly.
 */
export function stopWatchingRepo(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  for (const w of activeWatchers) {
    try {
      w.close();
    } catch {
      // ignore
    }
  }
  activeWatchers = [];
  currentWatchedRepo = null;
}

/**
 * Starts watching a Git repository for real-time changes (file edits, branch changes, staging).
 *
 * @param repoPath Absolute path to the Git repository
 * @param onChange Callback fired when changes are detected (debounced 250ms)
 */
export function startWatchingRepo(
  repoPath: string,
  onChange: (changedRepo: string) => void
): void {
  if (!repoPath || typeof repoPath !== 'string') return;
  if (currentWatchedRepo === repoPath) return;

  stopWatchingRepo();
  currentWatchedRepo = repoPath;

  const triggerChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      onChange(repoPath);
    }, 350);
  };

  const watchSafe = (targetPath: string, isRecursive = false) => {
    try {
      if (!fs.existsSync(targetPath)) return;
      const watcher = fs.watch(
        targetPath,
        { recursive: isRecursive },
        (_eventType, filename) => {
          if (filename) {
            const fnStr = String(filename);
            if (IGNORED_PATTERNS.some((pat) => pat.test(fnStr))) {
              return;
            }
          }
          triggerChange();
        }
      );
      watcher.on('error', () => {
        // gracefully handle watcher errors (e.g. file deletion)
      });
      activeWatchers.push(watcher);
    } catch {
      // non-fatal if path cannot be watched
    }
  };

  // 1. Watch .git internals: HEAD, index, and refs
  const gitDir = path.join(repoPath, '.git');
  if (fs.existsSync(gitDir)) {
    watchSafe(path.join(gitDir, 'HEAD'));
    watchSafe(path.join(gitDir, 'index'));
    watchSafe(path.join(gitDir, 'refs'), true);
  }

  // 2. Watch working tree directory (top-level and subdirectories)
  watchSafe(repoPath, true);
}
