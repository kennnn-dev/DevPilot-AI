import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanRawResponse,
  extractCommitText,
  parseConventionalCommit,
  validateWebhookOptions,
  handleWebhookGenerateCommit,
  registerWebhookHandlers,
} from '../../src/main/ipc/webhookHandlers';
import { gitService } from '../../src/main/git/gitService';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/shared/ipcChannels';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

describe('Webhook IPC Handlers (src/main/ipc/webhookHandlers.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cleanRawResponse', () => {
    it('cleans markdown codeblocks', () => {
      expect(cleanRawResponse('```commit\nfeat: add login\n```')).toBe('feat: add login');
      expect(cleanRawResponse('```\nfix: patch leak\n```')).toBe('fix: patch leak');
    });

    it('removes surrounding quotes', () => {
      expect(cleanRawResponse('"feat: new feature"')).toBe('feat: new feature');
      expect(cleanRawResponse("'fix: fix issue'")).toBe('fix: fix issue');
    });

    it('strips conversational intros from AI', () => {
      expect(cleanRawResponse('Here is the commit message: feat: add modal')).toBe('feat: add modal');
      expect(cleanRawResponse('Suggested commit message: fix: null pointer')).toBe('fix: null pointer');
      expect(cleanRawResponse("Here's your commit message:\nfeat: new style")).toBe('feat: new style');
    });

    it('handles empty or non-string input safely', () => {
      expect(cleanRawResponse('')).toBe('');
      expect(cleanRawResponse(null as any)).toBe('');
      expect(cleanRawResponse(undefined as any)).toBe('');
    });
  });

  describe('extractCommitText', () => {
    it('extracts from string directly', () => {
      expect(extractCommitText('feat: direct string')).toBe('feat: direct string');
    });

    it('extracts from object with message or commitMessage property', () => {
      expect(extractCommitText({ message: 'feat: from message' })).toBe('feat: from message');
      expect(extractCommitText({ commitMessage: 'fix: from commitMessage' })).toBe('fix: from commitMessage');
      expect(extractCommitText({ commit: 'refactor: clean up' })).toBe('refactor: clean up');
    });

    it('extracts from OpenAI-compatible choices response', () => {
      const openAiResp = {
        choices: [
          {
            message: {
              content: 'feat(auth): add OAuth2 provider',
            },
          },
        ],
      };
      expect(extractCommitText(openAiResp)).toBe('feat(auth): add OAuth2 provider');
    });

    it('extracts from nested data object', () => {
      expect(extractCommitText({ data: { message: 'chore: dependencies' } })).toBe('chore: dependencies');
    });
  });

  describe('parseConventionalCommit', () => {
    it('parses standard type and subject', () => {
      const parsed = parseConventionalCommit('feat: add user authentication');
      expect(parsed.isValid).toBe(true);
      expect(parsed.type).toBe('feat');
      expect(parsed.scope).toBeUndefined();
      expect(parsed.isBreaking).toBe(false);
      expect(parsed.subject).toBe('add user authentication');
      expect(parsed.body).toBeUndefined();
    });

    it('parses scope and breaking change indicator (!)', () => {
      const parsed = parseConventionalCommit('feat(api)!: migrate to v2 endpoints');
      expect(parsed.isValid).toBe(true);
      expect(parsed.type).toBe('feat');
      expect(parsed.scope).toBe('api');
      expect(parsed.isBreaking).toBe(true);
      expect(parsed.subject).toBe('migrate to v2 endpoints');
    });

    it('detects BREAKING CHANGE in body footer', () => {
      const commit = 'fix: prevent crash\n\nBREAKING CHANGE: changes return type to boolean';
      const parsed = parseConventionalCommit(commit);
      expect(parsed.isValid).toBe(true);
      expect(parsed.isBreaking).toBe(true);
      expect(parsed.body).toBe('BREAKING CHANGE: changes return type to boolean');
    });

    it('handles non-conventional commits gracefully', () => {
      const parsed = parseConventionalCommit('just a regular message without prefix');
      expect(parsed.isValid).toBe(false);
      expect(parsed.type).toBe('chore');
      expect(parsed.subject).toBe('just a regular message without prefix');
    });
  });

  describe('validateWebhookOptions', () => {
    it('validates options object', () => {
      expect(validateWebhookOptions(null).isValid).toBe(false);
      expect(validateWebhookOptions('string').isValid).toBe(false);
    });

    it('validates webhookUrl and protocol', () => {
      expect(validateWebhookOptions({ webhookUrl: '', repoPath: '/path' }).isValid).toBe(false);
      expect(validateWebhookOptions({ webhookUrl: 'invalid-url', repoPath: '/path' }).isValid).toBe(false);
      expect(validateWebhookOptions({ webhookUrl: 'ftp://example.com', repoPath: '/path' }).isValid).toBe(false);
      expect(validateWebhookOptions({ webhookUrl: 'https://webhook.n8n.cloud/webhook/123', repoPath: '/path' }).isValid).toBe(true);
    });

    it('validates repoPath non-empty string', () => {
      expect(validateWebhookOptions({ webhookUrl: 'https://example.com', repoPath: '' }).isValid).toBe(false);
      expect(validateWebhookOptions({ webhookUrl: 'https://example.com', repoPath: '  ' }).isValid).toBe(false);
    });
  });

  describe('handleWebhookGenerateCommit', () => {
    const origFetch = global.fetch;

    afterEach(() => {
      global.fetch = origFetch;
    });

    it('returns error if options are invalid', async () => {
      const res = await handleWebhookGenerateCommit({} as any);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('returns error if staged changes are empty', async () => {
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/repo',
          rawDiff: '',
          stagedFiles: [],
          summary: { filesChanged: 0, insertions: 0, deletions: 0 },
          isEmpty: true,
        },
      });

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('No staged changes found');
    });

    it('successfully posts to webhook and returns parsed commit', async () => {
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/repo',
          rawDiff: 'diff --git a/file b/file\n+code',
          stagedFiles: [
            { path: 'file', changeType: 'added', statusCode: 'A ' },
          ],
          summary: { filesChanged: 1, insertions: 1, deletions: 0 },
          isEmpty: false,
        },
      });

      vi.spyOn(gitService, 'getStatus').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/repo',
          branch: 'feature/auth',
          isDetached: false,
          staged: [],
          unstaged: [],
          untracked: [],
        },
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ message: 'feat(auth): implement oauth token refresh' }),
      } as any);

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(res.success).toBe(true);
      expect(res.data?.commitMessage).toBe('feat(auth): implement oauth token refresh');
      expect(res.data?.parsed.type).toBe('feat');
      expect(res.data?.parsed.scope).toBe('auth');
    });

    it('attaches token from environment variable DEVPILOT_WEBHOOK_TOKEN or X_API_KEY', async () => {
      process.env.DEVPILOT_WEBHOOK_TOKEN = 'secret-env-token-123';
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/repo',
          rawDiff: 'diff --git a/f b/f\n+hello',
          stagedFiles: [{ path: 'f', changeType: 'added', statusCode: 'A ' }],
          summary: { filesChanged: 1, insertions: 1, deletions: 0 },
          isEmpty: false,
        },
      });
      vi.spyOn(gitService, 'getStatus').mockResolvedValueOnce({
        success: true,
        data: { repoPath: '/repo', branch: 'main', isDetached: false, staged: [], unstaged: [], untracked: [] },
      });

      const fetchSpy = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ commitMessage: 'feat: env token test' }),
      });
      global.fetch = fetchSpy as any;

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(res.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-env-token-123',
            'X-API-KEY': 'secret-env-token-123',
          }),
        })
      );
      delete process.env.DEVPILOT_WEBHOOK_TOKEN;
    });

    it('handles HTTP error responses from webhook endpoint', async () => {
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/repo',
          rawDiff: 'diff',
          stagedFiles: [{ path: 'f', changeType: 'modified', statusCode: 'M ' }],
          summary: { filesChanged: 1, insertions: 1, deletions: 0 },
          isEmpty: false,
        },
      });
      vi.spyOn(gitService, 'getStatus').mockResolvedValueOnce({
        success: true,
        data: { repoPath: '/repo', branch: 'main', isDetached: false, staged: [], unstaged: [], untracked: [] },
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error in n8n workflow',
      } as any);

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Webhook returned HTTP 500');
    });
  });

  describe('registerWebhookHandlers', () => {
    it('registers WEBHOOK_GENERATE_COMMIT handler on ipcMain', () => {
      const handleSpy = vi.spyOn(ipcMain, 'handle');
      registerWebhookHandlers();
      expect(handleSpy).toHaveBeenCalledWith(
        IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT,
        expect.any(Function)
      );
    });
  });
});
