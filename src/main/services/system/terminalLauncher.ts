import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { IPCResult } from '../../../shared/types';

export interface TerminalSpawnConfig {
  command: string;
  args: string[];
}

/**
 * Finds the first available terminal executable on Linux by testing PATH or known binaries.
 */
export function resolveLinuxTerminal(targetDir: string): TerminalSpawnConfig {
  const customTerminal = process.env.TERMINAL;
  if (customTerminal) {
    return {
      command: customTerminal,
      args: ['-d', targetDir],
    };
  }

  // Known candidate list ordered by modern desktop popularity
  const candidates = [
    { binary: 'ptyxis', args: ['-d', targetDir] },
    { binary: 'gnome-terminal', args: ['--working-directory', targetDir] },
    { binary: 'konsole', args: ['--workdir', targetDir] },
    { binary: 'xfce4-terminal', args: ['--working-directory', targetDir] },
    { binary: 'alacritty', args: ['--working-directory', targetDir] },
    { binary: 'kitty', args: ['--directory', targetDir] },
    { binary: 'x-terminal-emulator', args: ['-d', targetDir] },
    { binary: 'xterm', args: ['-e', `bash -c "cd '${targetDir.replace(/'/g, "'\\''")}' && exec bash"`] },
  ];

  for (const candidate of candidates) {
    try {
      if (canFindExecutable(candidate.binary)) {
        return {
          command: candidate.binary,
          args: candidate.args,
        };
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Default fallback to x-terminal-emulator or ptyxis
  return {
    command: 'x-terminal-emulator',
    args: ['-d', targetDir],
  };
}

/**
 * Tests whether an executable exists in the system PATH.
 */
export function canFindExecutable(binaryName: string): boolean {
  if (path.isAbsolute(binaryName)) {
    return fs.existsSync(binaryName);
  }

  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);

  for (const dir of pathDirs) {
    if (!dir) continue;
    const fullPath = path.join(dir, binaryName);
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        // Check execute permission (non-zero mode on POSIX or file existence on Windows)
        if (stats.isFile() && (process.platform === 'win32' || (stats.mode & 0o111) !== 0)) {
          return true;
        }
      }
    } catch {
      // Ignore directory read/stat errors
    }
  }

  return false;
}

/**
 * Resolves the appropriate command and arguments to launch a native terminal
 * in the specified target directory based on the host operating system.
 */
export function resolveTerminalCommand(
  targetDir: string,
  platform: NodeJS.Platform = process.platform
): TerminalSpawnConfig {
  switch (platform) {
    case 'darwin':
      // macOS uses AppleScript or open -a Terminal
      return {
        command: 'open',
        args: ['-a', 'Terminal', targetDir],
      };

    case 'win32': {
      // Windows Terminal if available, otherwise cmd.exe
      const hasWindowsTerminal = canFindExecutable('wt.exe');
      if (hasWindowsTerminal) {
        return {
          command: 'wt.exe',
          args: ['-d', targetDir],
        };
      }
      return {
        command: 'cmd.exe',
        args: ['/k', `cd /d "${targetDir}"`],
      };
    }

    case 'linux':
    default:
      return resolveLinuxTerminal(targetDir);
  }
}

export type SpawnFunction = typeof spawn;

/**
 * Opens the OS native terminal emulator at the specified directory path.
 *
 * @param rawTargetPath Absolute directory or file path within the repository
 * @param spawnFn Injectable child_process.spawn for unit testing
 * @returns IPCResult<boolean> indicating whether the terminal process was successfully spawned
 */
export async function launchTerminal(
  rawTargetPath: string,
  spawnFn: SpawnFunction = spawn
): Promise<IPCResult<boolean>> {
  try {
    if (typeof rawTargetPath !== 'string' || !rawTargetPath.trim()) {
      return {
        success: false,
        error: 'Target directory path must be a non-empty string.',
      };
    }

    const trimmedPath = rawTargetPath.trim();
    const resolvedPath = path.resolve(trimmedPath);

    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        error: `Target path does not exist on disk: ${resolvedPath}`,
      };
    }

    const stats = fs.statSync(resolvedPath);
    const targetDir = stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath);

    const { command, args } = resolveTerminalCommand(targetDir);

    const child = spawnFn(command, args, {
      cwd: targetDir,
      detached: true,
      stdio: 'ignore',
      shell: false,
    });

    if (child && typeof child.unref === 'function') {
      child.unref();
    }

    return {
      success: true,
      data: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to launch native terminal: ${message}`,
    };
  }
}
