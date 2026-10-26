// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  handleWebhookGenerateCommit,
  cleanRawResponse,
  extractCommitText,
  parseConventionalCommit,
} from '../../src/main/ipc/webhookHandlers';
import { gitService } from '../../src/main/git/gitService';
import { createTestGitRepo, type TestGitRepo } from '../helpers/gitRepoHelper';
import type { WebhookCommitPayload } from '../../src/shared/types';

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

describe('Commit Generator Dynamic Dispatch Integration Tests (tests/integration/commitGeneratorDynamicDispatch.test.ts)', () => {
  let testRepo: TestGitRepo;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    testRepo = await createTestGitRepo({ defaultBranch: 'feature/dynamic-dispatch', initialCommit: true });

    // Populate tracked file
    testRepo.createFile('src/auth.ts', 'export function login() { return false; }\n');
    testRepo.stageAndCommit('Initial auth scaffold', 'src/auth.ts');

    // Create real staged changes (1 modified, 1 added)
    testRepo.createFile('src/auth.ts', 'export function login() { return true; }\nexport function logout() {}\n');
    testRepo.createFile('src/token.ts', 'export const JWT_SECRET = "dev-secret";\n');
    testRepo.stage('src/auth.ts', 'src/token.ts');
  });

  afterAll(async () => {
    await testRepo.cleanup();
    process.env = originalEnv;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Dynamic Payload Construction with Real Git Repository
  // =========================================================================
  describe('Dynamic Payload Construction & Staged Diff Packaging', () => {
    let server: http.Server;
    let serverUrl: string;
    let capturedBody: WebhookCommitPayload | null = null;
    let capturedHeaders: http.IncomingHttpHeaders = {};

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        capturedHeaders = req.headers;
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
        });
        req.on('end', () => {
          try {
            capturedBody = JSON.parse(raw);
          } catch {
            capturedBody = raw as any;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              commitMessage: 'feat(auth): enable login and export JWT secret\n\n- updates auth.ts\n- adds token.ts',
            })
          );
        });
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}/webhook/dispatch`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    beforeEach(() => {
      capturedBody = null;
      capturedHeaders = {};
    });

    it('reliably packages real staged diffs, branch details, status, and custom prompt', async () => {
      const customPrompt = 'Focus on the new token export and conventional commit format';

      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
        webhookUrl: serverUrl,
        webhookToken: 'n8n-auth-token-12345',
        customPrompt,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.commitMessage).toContain('feat(auth): enable login');
      expect(result.data?.parsed.type).toBe('feat');
      expect(result.data?.parsed.scope).toBe('auth');

      // Verify Captured Webhook Payload
      expect(capturedBody).not.toBeNull();
      const payload = capturedBody!;

      // 1. Repo metadata
      expect(payload.repoPath).toBe(testRepo.repoPath);
      expect(payload.branch).toBe('feature/dynamic-dispatch');
      expect(payload.isDetached).toBe(false);
      expect(payload.repository).toEqual({
        repoPath: testRepo.repoPath,
        branch: 'feature/dynamic-dispatch',
        isDetached: false,
      });

      // 2. Staged files
      expect(Array.isArray(payload.stagedFiles)).toBe(true);
      expect(payload.stagedFiles.length).toBe(2);
      const paths = payload.stagedFiles.map((f) => f.path);
      expect(paths).toContain('src/auth.ts');
      expect(paths).toContain('src/token.ts');

      // 3. Unified Diff
      expect(payload.diff).toBeDefined();
      expect(payload.diff).toContain('diff --git');
      expect(payload.diff).toContain('+export function logout()');
      expect(payload.diff).toContain('+export const JWT_SECRET');
      expect(payload.stagedDiff).toBe(payload.diff);

      // 4. Diff Summary
      expect(payload.diffSummary).toBeDefined();
      expect(payload.diffSummary.filesChanged).toBe(2);
      expect(payload.diffSummary.insertions).toBeGreaterThanOrEqual(2);

      // 5. Custom Prompt
      expect(payload.customPrompt).toBe(customPrompt);

      // 6. Auth Headers
      expect(capturedHeaders['authorization']).toBe('Bearer n8n-auth-token-12345');
      expect(capturedHeaders['x-api-key']).toBe('n8n-auth-token-12345');
    });

    it('omits customPrompt when not specified or empty', async () => {
      await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
        webhookUrl: serverUrl,
        customPrompt: '   ',
      });

      expect(capturedBody?.customPrompt).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. Detached HEAD State Handling
  // =========================================================================
  describe('Detached HEAD Repository State Dispatch', () => {
    let detachedRepo: TestGitRepo;
    let server: http.Server;
    let serverUrl: string;
    let capturedBody: WebhookCommitPayload | null = null;

    beforeAll(async () => {
      detachedRepo = await createTestGitRepo({ defaultBranch: 'main', initialCommit: true });
      detachedRepo.createFile('file1.txt', 'v1\n');
      detachedRepo.stage('file1.txt');
      const hash = detachedRepo.commit('Add file1');
      detachedRepo.checkoutDetach(hash);

      // Staged change in detached state
      detachedRepo.createFile('file2.txt', 'staged in detached head\n');
      detachedRepo.stage('file2.txt');

      server = http.createServer((req, res) => {
        setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
        });
        req.on('end', () => {
          try {
            capturedBody = JSON.parse(raw);
          } catch {
            capturedBody = raw as any;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ commitMessage: 'chore: commit on detached HEAD' }));
        });
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}/webhook/detached`;
    });

    afterAll(async () => {
      await detachedRepo.cleanup();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('accurately sets isDetached=true and branch metadata for detached HEAD state', async () => {
      const result = await handleWebhookGenerateCommit({
        repoPath: detachedRepo.repoPath,
        webhookUrl: serverUrl,
      });

      expect(result.success).toBe(true);
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.isDetached).toBe(true);
      expect(capturedBody!.repository.isDetached).toBe(true);
      expect(capturedBody!.branch).toContain('HEAD detached');
      expect(capturedBody!.stagedFiles.map((f) => f.path)).toContain('file2.txt');
    });
  });

  // =========================================================================
  // 3. Hybrid .env Fallback Resolution
  // =========================================================================
  describe('Hybrid .env Fallback Resolution', () => {
    let server: http.Server;
    let serverUrl: string;
    let capturedHeaders: http.IncomingHttpHeaders = {};

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        capturedHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ commitMessage: 'feat(env): resolved from env fallback' }));
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}/webhook/env-fallback`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    beforeEach(() => {
      delete process.env.DEVPILOT_WEBHOOK_URL;
      delete process.env.DEVPILOT_WEBHOOK_TOKEN;
      delete process.env.N8N_WEBHOOK_URL;
      delete process.env.WEBHOOK_URL;
      delete process.env.DEVPILOT_API_KEY;
      capturedHeaders = {};
    });

    it('falls back to process.env.DEVPILOT_WEBHOOK_URL and token when options are empty', async () => {
      process.env.DEVPILOT_WEBHOOK_URL = serverUrl;
      process.env.DEVPILOT_WEBHOOK_TOKEN = 'env-fallback-token-secret';

      // Dispatch with no webhookUrl or webhookToken
      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
      });

      expect(result.success).toBe(true);
      expect(result.data?.commitMessage).toBe('feat(env): resolved from env fallback');
      expect(capturedHeaders['authorization']).toBe('Bearer env-fallback-token-secret');
      expect(capturedHeaders['x-api-key']).toBe('env-fallback-token-secret');
    });

    it('falls back across aliases: N8N_WEBHOOK_URL and DEVPILOT_API_KEY', async () => {
      process.env.N8N_WEBHOOK_URL = serverUrl;
      process.env.DEVPILOT_API_KEY = 'alias-api-key-999';

      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
      });

      expect(result.success).toBe(true);
      expect(capturedHeaders['authorization']).toBe('Bearer alias-api-key-999');
    });
  });

  // =========================================================================
  // 4. Robust Error Handling & Resilience
  // =========================================================================
  describe('Adversarial Error Handling & Resilience', () => {
    let server: http.Server;
    let serverUrl: string;
    let currentStatusCode: number = 200;
    let currentResponseBody: string = '';

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        res.writeHead(currentStatusCode, { 'Content-Type': 'application/json' });
        res.end(currentResponseBody);
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}/webhook/error-test`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('returns actionable error when neither user settings nor .env URL are defined', async () => {
      delete process.env.DEVPILOT_WEBHOOK_URL;
      delete process.env.N8N_WEBHOOK_URL;
      delete process.env.WEBHOOK_URL;

      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Webhook URL is not configured');
      expect(result.error).toContain('Settings');
    });

    it('returns error when webhook URL is malformed or uses unsupported protocol', async () => {
      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
        webhookUrl: 'ftp://not-supported.org/endpoint',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must use HTTP or HTTPS protocol');
    });

    it('returns error when repository has zero staged changes', async () => {
      const cleanRepo = await createTestGitRepo({ defaultBranch: 'main', initialCommit: true });
      try {
        const result = await handleWebhookGenerateCommit({
          repoPath: cleanRepo.repoPath,
          webhookUrl: serverUrl,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No staged changes found in repository');
      } finally {
        await cleanRepo.cleanup();
      }
    });

    it('translates HTTP 401 Unauthorized into actionable message mentioning Settings', async () => {
      currentStatusCode = 401;
      currentResponseBody = JSON.stringify({ error: 'Unauthorized' });

      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
        webhookUrl: serverUrl,
        webhookToken: 'bad-token',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 401: Unauthorized');
      expect(result.error).toContain('Please check your API/bearer token in Settings');
    });

    it('translates HTTP 403 Forbidden into actionable message mentioning Settings', async () => {
      currentStatusCode = 403;
      currentResponseBody = JSON.stringify({ error: 'Forbidden' });

      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
        webhookUrl: serverUrl,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 403: Forbidden');
      expect(result.error).toContain('Please verify endpoint permissions in Settings');
    });

    it('returns actionable connection refused message on closed port (ECONNREFUSED)', async () => {
      // Find unused port
      const dummy = http.createServer();
      await new Promise<void>((resolve) => dummy.listen(0, '127.0.0.1', resolve));
      const closedPort = (dummy.address() as AddressInfo).port;
      await new Promise<void>((resolve) => dummy.close(() => resolve()));

      const result = await handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
        webhookUrl: `http://127.0.0.1:${closedPort}/webhook`,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
      expect(result.error).toContain('Check if your webhook server is running');
    });

    it('aborts request and returns 30-second timeout message', async () => {
      vi.useFakeTimers();

      // Spy on gitService to prevent invoking real child processes under fake timers
      const diffSpy = vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: true,
        data: {
          repoPath: testRepo.repoPath,
          rawDiff: 'diff --git a/a b/a\n+line',
          stagedFiles: [{ path: 'a', changeType: 'added', statusCode: 'A ' }],
          summary: { filesChanged: 1, insertions: 1, deletions: 0 },
          isEmpty: false,
        },
      });

      const statusSpy = vi.spyOn(gitService, 'getStatus').mockResolvedValueOnce({
        success: true,
        data: { repoPath: testRepo.repoPath, branch: 'main', isDetached: false, staged: [], unstaged: [], untracked: [] },
      });

      const origFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const commitPromise = handleWebhookGenerateCommit({
        repoPath: testRepo.repoPath,
        webhookUrl: 'http://127.0.0.1:49999/slow-webhook',
      });

      // Advance 30 seconds
      await vi.advanceTimersByTimeAsync(30000);

      const result = await commitPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook request timed out after 30 seconds.');

      vi.useRealTimers();
      global.fetch = origFetch;
      diffSpy.mockRestore();
      statusSpy.mockRestore();
    });
  });

  // =========================================================================
  // 5. Response Normalization & Parsing
  // =========================================================================
  describe('Response Normalization & Conventional Commit Parsing', () => {
    it('cleans markdown codeblocks, conversational preamble, and quotes', () => {
      expect(cleanRawResponse('```commit\nfeat: add login modal\n```')).toBe('feat: add login modal');
      expect(cleanRawResponse('Here is the commit message: fix: resolve memory leak')).toBe('fix: resolve memory leak');
      expect(cleanRawResponse('"feat(api): update contract"')).toBe('feat(api): update contract');
    });

    it('extracts commit from various response shapes (string, object, choices)', () => {
      expect(extractCommitText('feat: direct text')).toBe('feat: direct text');
      expect(extractCommitText({ commitMessage: 'chore: from object' })).toBe('chore: from object');
      expect(extractCommitText({ choices: [{ message: { content: 'perf: faster build' } }] })).toBe('perf: faster build');
    });

    it('parses conventional commit tags, scopes, and breaking change flags', () => {
      const parsed = parseConventionalCommit('feat(billing)!: integrate Stripe payment gateway\n\nMigrates from PayPal.');
      expect(parsed.isValid).toBe(true);
      expect(parsed.type).toBe('feat');
      expect(parsed.scope).toBe('billing');
      expect(parsed.isBreaking).toBe(true);
      expect(parsed.subject).toBe('integrate Stripe payment gateway');
      expect(parsed.body).toBe('Migrates from PayPal.');
    });
  });
});
