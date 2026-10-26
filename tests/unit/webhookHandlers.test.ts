import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanRawResponse,
  extractCommitText,
  parseConventionalCommit,
  validateWebhookOptions,
  handleWebhookGenerateCommit,
  registerWebhookHandlers,
  getEnvWebhookUrl,
  getEnvWebhookToken,
  handleGetWebhookConfig,
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

    it('validates successfully when webhookUrl is omitted but DEVPILOT_WEBHOOK_URL is set in env', () => {
      const orig = process.env.DEVPILOT_WEBHOOK_URL;
      process.env.DEVPILOT_WEBHOOK_URL = 'https://env-endpoint.example.com/webhook';
      const res = validateWebhookOptions({ repoPath: '/path' });
      expect(res.isValid).toBe(true);
      expect(res.resolvedUrl).toBe('https://env-endpoint.example.com/webhook');
      if (orig) process.env.DEVPILOT_WEBHOOK_URL = orig;
      else delete process.env.DEVPILOT_WEBHOOK_URL;
    });

    it('returns actionable error when neither options nor .env URL are set', () => {
      const orig1 = process.env.DEVPILOT_WEBHOOK_URL;
      const orig2 = process.env.N8N_WEBHOOK_URL;
      const orig3 = process.env.WEBHOOK_URL;
      delete process.env.DEVPILOT_WEBHOOK_URL;
      delete process.env.N8N_WEBHOOK_URL;
      delete process.env.WEBHOOK_URL;

      const res = validateWebhookOptions({ repoPath: '/path' });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Webhook URL is not configured');

      if (orig1) process.env.DEVPILOT_WEBHOOK_URL = orig1;
      if (orig2) process.env.N8N_WEBHOOK_URL = orig2;
      if (orig3) process.env.WEBHOOK_URL = orig3;
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

    it('falls back to process.env.DEVPILOT_WEBHOOK_URL when webhookUrl is not provided', async () => {
      process.env.DEVPILOT_WEBHOOK_URL = 'https://env.n8n.cloud/webhook/commit';
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/repo',
          rawDiff: 'diff --git a/a.ts b/a.ts\n+hello',
          stagedFiles: [{ path: 'a.ts', changeType: 'added', statusCode: 'A ' }],
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
        text: async () => JSON.stringify({ commitMessage: 'feat: resolved from env url' }),
      });
      global.fetch = fetchSpy as any;

      const res = await handleWebhookGenerateCommit({ repoPath: '/repo' });
      expect(res.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith('https://env.n8n.cloud/webhook/commit', expect.any(Object));
      delete process.env.DEVPILOT_WEBHOOK_URL;
    });

    it('forwards customPrompt in webhook payload when provided', async () => {
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: '/repo',
          rawDiff: 'diff --git a/a.ts b/a.ts\n+hello',
          stagedFiles: [{ path: 'a.ts', changeType: 'added', statusCode: 'A ' }],
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
        text: async () => JSON.stringify({ commitMessage: 'feat: with prompt' }),
      });
      global.fetch = fetchSpy as any;

      await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/webhook',
        customPrompt: 'Focus on accessibility improvements',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('"customPrompt":"Focus on accessibility improvements"'),
        })
      );
    });

    it('translates HTTP 401 into actionable Unauthorized message', async () => {
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
        status: 401,
        text: async () => 'Unauthorized',
      } as any);

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('HTTP 401: Unauthorized');
      expect(res.error).toContain('Settings');
    });

    it('translates HTTP 403 into actionable Forbidden message', async () => {
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
        status: 403,
        text: async () => 'Forbidden',
      } as any);

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('HTTP 403: Forbidden');
      expect(res.error).toContain('Settings');
    });

    it('handles ECONNREFUSED with connection refused message', async () => {
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

      const connErr = new TypeError('fetch failed');
      (connErr as any).cause = { code: 'ECONNREFUSED' };
      global.fetch = vi.fn().mockRejectedValueOnce(connErr);

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'http://localhost:9999/webhook',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Connection refused');
    });

    it('handles ENOTFOUND with DNS resolution failure message', async () => {
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

      const dnsErr = new TypeError('fetch failed');
      (dnsErr as any).cause = { code: 'ENOTFOUND' };
      global.fetch = vi.fn().mockRejectedValueOnce(dnsErr);

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://nonexistent-host-12345.xyz/webhook',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('DNS resolution error');
    });

    it('handles 30-second AbortError with timeout message', async () => {
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

      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      global.fetch = vi.fn().mockRejectedValueOnce(abortErr);

      const res = await handleWebhookGenerateCommit({
        repoPath: '/repo',
        webhookUrl: 'https://example.com/slow',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Webhook request timed out after 30 seconds.');
    });
  });

  describe('registerWebhookHandlers', () => {
    it('registers WEBHOOK_GENERATE_COMMIT and SETTINGS_GET_WEBHOOK_CONFIG handlers on ipcMain', () => {
      const handleSpy = vi.spyOn(ipcMain, 'handle');
      registerWebhookHandlers();
      expect(handleSpy).toHaveBeenCalledWith(
        IPC_CHANNELS.WEBHOOK_GENERATE_COMMIT,
        expect.any(Function)
      );
      expect(handleSpy).toHaveBeenCalledWith(
        IPC_CHANNELS.SETTINGS_GET_WEBHOOK_CONFIG,
        expect.any(Function)
      );
    });
  });

  describe('getEnvWebhookUrl & getEnvWebhookToken', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('resolves URL from DEVPILOT_WEBHOOK_URL', () => {
      process.env.DEVPILOT_WEBHOOK_URL = 'http://localhost:5678/webhook/test';
      expect(getEnvWebhookUrl()).toBe('http://localhost:5678/webhook/test');
    });

    it('resolves URL from N8N_WEBHOOK_URL alias when DEVPILOT_WEBHOOK_URL is unset', () => {
      delete process.env.DEVPILOT_WEBHOOK_URL;
      process.env.N8N_WEBHOOK_URL = 'https://n8n.cloud/webhook/alias';
      expect(getEnvWebhookUrl()).toBe('https://n8n.cloud/webhook/alias');
    });

    it('resolves URL from WEBHOOK_URL alias when others are unset', () => {
      delete process.env.DEVPILOT_WEBHOOK_URL;
      delete process.env.N8N_WEBHOOK_URL;
      process.env.WEBHOOK_URL = 'https://generic.webhook.org';
      expect(getEnvWebhookUrl()).toBe('https://generic.webhook.org');
    });

    it('resolves token with correct precedence (DEVPILOT_WEBHOOK_TOKEN > DEVPILOT_API_KEY > X_API_KEY > N8N_WEBHOOK_TOKEN)', () => {
      process.env.DEVPILOT_WEBHOOK_TOKEN = 'token-1';
      process.env.DEVPILOT_API_KEY = 'token-2';
      expect(getEnvWebhookToken()).toBe('token-1');

      delete process.env.DEVPILOT_WEBHOOK_TOKEN;
      expect(getEnvWebhookToken()).toBe('token-2');

      delete process.env.DEVPILOT_API_KEY;
      process.env.X_API_KEY = 'token-3';
      expect(getEnvWebhookToken()).toBe('token-3');

      delete process.env.X_API_KEY;
      process.env.N8N_WEBHOOK_TOKEN = 'token-4';
      expect(getEnvWebhookToken()).toBe('token-4');
    });
  });

  describe('handleGetWebhookConfig', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns resolved envWebhookUrl and hasEnvToken: false when no token exists', () => {
      delete process.env.DEVPILOT_WEBHOOK_TOKEN;
      delete process.env.DEVPILOT_API_KEY;
      delete process.env.X_API_KEY;
      delete process.env.N8N_WEBHOOK_TOKEN;
      process.env.DEVPILOT_WEBHOOK_URL = 'http://example.com/webhook';

      const res = handleGetWebhookConfig();
      expect(res.success).toBe(true);
      expect(res.data?.envWebhookUrl).toBe('http://example.com/webhook');
      expect(res.data?.hasEnvToken).toBe(false);
      expect(res.data?.source).toBe('env');
    });

    it('returns hasEnvToken: true when environment token is populated', () => {
      process.env.DEVPILOT_WEBHOOK_TOKEN = 'secret-token';
      const res = handleGetWebhookConfig();
      expect(res.data?.hasEnvToken).toBe(true);
    });
  });
});
