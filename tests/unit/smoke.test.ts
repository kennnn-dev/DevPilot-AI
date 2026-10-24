import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/ipcChannels';
import type {
  GitStatusResult,
  GitFileStatus,
  GitDiffResult,
  IPCResult,
  DevPilotAPI,
} from '../../src/shared/types';

describe('DevPilot Smoke & Contract Integrity Tests', () => {
  it('defines expected IPC channels matching PROJECT.md interface contracts', () => {
    expect(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY).toBe('dialog:open-directory');
    expect(IPC_CHANNELS.GIT_GET_STATUS).toBe('git:get-status');
    expect(IPC_CHANNELS.GIT_GET_STAGED_DIFF).toBe('git:get-staged-diff');
    expect(IPC_CHANNELS.GIT_GET_ALL_STAGED_DIFF).toBe('git:get-all-staged-diff');
    expect(IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT).toBe('webhook:generate-commit');

    // Verify aliases
    expect(IPC_CHANNELS.OPEN_DIRECTORY).toBe('dialog:open-directory');
    expect(IPC_CHANNELS.GET_STATUS).toBe('git:get-status');
    expect(IPC_CHANNELS.GET_STAGED_DIFF).toBe('git:get-staged-diff');
  });

  it('validates GitStatusResult and GitFileStatus structure', () => {
    const fileStatus: GitFileStatus = {
      path: 'src/main.ts',
      changeType: 'modified',
      statusCode: 'M ',
    };
    expect(fileStatus.path).toBe('src/main.ts');
    expect(fileStatus.changeType).toBe('modified');

    const statusResult: GitStatusResult = {
      repoPath: '/workspace/project',
      branch: 'main',
      isDetached: false,
      staged: [fileStatus],
      unstaged: [],
      untracked: [],
    };
    expect(statusResult.staged.length).toBe(1);
    expect(statusResult.unstaged.length).toBe(0);
    expect(statusResult.untracked.length).toBe(0);
  });

  it('validates GitDiffResult structure', () => {
    const diffResult: GitDiffResult = {
      repoPath: '/workspace/project',
      filePath: 'src/main.ts',
      rawDiff: 'diff --git a/src/main.ts b/src/main.ts',
      isBinary: false,
      isEmpty: false,
      hunks: [
        {
          header: '@@ -1,3 +1,4 @@',
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 4,
          lines: [
            { type: 'context', content: ' line 1', oldLineNumber: 1, newLineNumber: 1 },
            { type: 'add', content: '+line 2', newLineNumber: 2 },
          ],
        },
      ],
    };
    expect(diffResult.hunks.length).toBe(1);
    expect(diffResult.hunks[0].lines[1].type).toBe('add');
  });

  it('validates IPCResult container typing', () => {
    const successResult: IPCResult<string> = {
      success: true,
      data: '/path/to/folder',
    };
    expect(successResult.success).toBe(true);
    expect(successResult.data).toBe('/path/to/folder');

    const errorResult: IPCResult<never> = {
      success: false,
      error: 'Directory not found',
    };
    expect(errorResult.success).toBe(false);
    expect(errorResult.error).toBe('Directory not found');
  });

  it('ensures DevPilotAPI shape is sound', () => {
    const mockApi: DevPilotAPI = {
      openDirectory: async () => '/test',
      getStatus: async () => ({ success: true, data: { repoPath: '/test', branch: 'main', isDetached: false, staged: [], unstaged: [], untracked: [] } }),
      getStagedDiff: async () => ({ success: true, data: { repoPath: '/test', filePath: 'a.ts', rawDiff: '', isBinary: false, isEmpty: true, hunks: [] } }),
      getAllStagedDiff: async () => ({
        success: true,
        data: {
          repoPath: '/test',
          rawDiff: '',
          stagedFiles: [],
          summary: { filesChanged: 0, insertions: 0, deletions: 0 },
          isEmpty: true,
        },
      }),
      generateCommitMessage: async () => ({
        success: true,
        data: {
          commitMessage: 'feat: init',
          parsed: {
            raw: 'feat: init',
            type: 'feat',
            subject: 'init',
            isBreaking: false,
            isValid: true,
          },
        },
      }),
    };
    expect(typeof mockApi.openDirectory).toBe('function');
    expect(typeof mockApi.getStatus).toBe('function');
    expect(typeof mockApi.getStagedDiff).toBe('function');
    expect(typeof mockApi.getAllStagedDiff).toBe('function');
    expect(typeof mockApi.generateCommitMessage).toBe('function');
  });
});
