import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import {
  launchTerminal,
  resolveTerminalCommand,
  canFindExecutable,
  resolveLinuxTerminal,
} from '../../src/main/services/system/terminalLauncher';

describe('terminalLauncher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveTerminalCommand', () => {
    it('resolves macOS terminal command', () => {
      const config = resolveTerminalCommand('/dummy/path', 'darwin');
      expect(config.command).toBe('open');
      expect(config.args).toEqual(['-a', 'Terminal', '/dummy/path']);
    });

    it('resolves Windows command using wt.exe or cmd.exe', () => {
      const config = resolveTerminalCommand('/dummy/path', 'win32');
      expect(['wt.exe', 'cmd.exe']).toContain(config.command);
    });

    it('resolves Linux terminal with custom TERMINAL env var if set', () => {
      const original = process.env.TERMINAL;
      process.env.TERMINAL = 'my-cool-term';
      try {
        const config = resolveLinuxTerminal('/test/repo');
        expect(config.command).toBe('my-cool-term');
        expect(config.args).toContain('/test/repo');
      } finally {
        if (original) {
          process.env.TERMINAL = original;
        } else {
          delete process.env.TERMINAL;
        }
      }
    });
  });

  describe('canFindExecutable', () => {
    it('returns false for nonexistent binary', () => {
      expect(canFindExecutable('this-binary-definitely-does-not-exist-xyz123')).toBe(false);
    });
  });

  describe('launchTerminal', () => {
    it('fails when rawTargetPath is empty or not a string', async () => {
      const res1 = await launchTerminal('');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Target directory path must be a non-empty string');

      const res2 = await launchTerminal('   ');
      expect(res2.success).toBe(false);

      const res3 = await launchTerminal(null as any);
      expect(res3.success).toBe(false);
    });

    it('fails when target path does not exist on disk', async () => {
      const nonExistent = path.join(process.cwd(), 'non-existent-subfolder-12345');
      const res = await launchTerminal(nonExistent);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Target path does not exist on disk');
    });

    it('spawns terminal successfully for existing directory', async () => {
      const mockUnref = vi.fn();
      const mockSpawn = vi.fn().mockReturnValue({
        unref: mockUnref,
      } as any);

      const res = await launchTerminal(process.cwd(), mockSpawn as any);
      expect(res.success).toBe(true);
      expect(res.data).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
      expect(mockUnref).toHaveBeenCalled();
    });

    it('handles spawn exception gracefully', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => {
        throw new Error('OS spawn permission denied');
      });

      const res = await launchTerminal(process.cwd(), mockSpawn as any);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to launch native terminal');
      expect(res.error).toContain('OS spawn permission denied');
    });
  });
});
