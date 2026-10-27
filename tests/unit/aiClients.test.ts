import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCommitSystemPrompt,
  buildCommitUserPrompt,
  buildUserPrompt,
  cleanRawResponse,
  extractCommitText,
  parseConventionalCommit,
  truncateDiff,
  MAX_DIFF_CHAR_BUDGET,
} from '../../src/main/services/ai/promptBuilder';
import {
  sanitizeErrorMessage,
  executeFetchWithTimeout,
} from '../../src/main/services/ai/aiUtils';
import {
  generateOllamaCommit,
  resolveOllamaConfig,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from '../../src/main/services/ai/ollamaClient';
import {
  generateOpenAICommit,
  resolveOpenAIConfig,
} from '../../src/main/services/ai/openaiClient';
import {
  generateGeminiCommit,
  resolveGeminiConfig,
} from '../../src/main/services/ai/geminiClient';
import {
  generateWebhookCommit,
  validateWebhookUrl,
} from '../../src/main/services/ai/webhookClient';
import {
  generateCommitMessage,
  getResolvedAIConfig,
  resolveActiveProvider,
} from '../../src/main/services/ai/aiService';
import { gitService } from '../../src/main/git/gitService';
import type {
  GitAllStagedDiffResult,
  WebhookRepositoryContext,
} from '../../src/shared/types';

function createMockResponse(
  body: unknown,
  init: { status?: number; ok?: boolean; statusText?: string } = {}
): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const textContent = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    ok,
    status,
    statusText: init.statusText ?? (ok ? 'OK' : 'Error'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => textContent,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  } as unknown as Response;
}

const mockRepoContext: WebhookRepositoryContext = {
  repoPath: '/workspace/project',
  branch: 'main',
  isDetached: false,
};

const mockDiffData: GitAllStagedDiffResult = {
  repoPath: '/workspace/project',
  rawDiff: 'diff --git a/file.ts b/file.ts\n+console.log("hello");\n',
  stagedFiles: [
    {
      path: 'file.ts',
      changeType: 'modified',
      statusCode: 'M ',
    },
  ],
  summary: {
    filesChanged: 1,
    insertions: 1,
    deletions: 0,
  },
  isEmpty: false,
};

describe('Multi-Provider AI Clients & Infrastructure (tests/unit/aiClients.test.ts)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. Prompt Builder & Diff Budgeting
  // =========================================================================
  describe('PromptBuilder & Diff Budgeting', () => {
    it('enforces strict Conventional Commits v1.0.0 in system prompt', () => {
      const prompt = buildCommitSystemPrompt();
      expect(prompt).toContain('Conventional Commits');
      expect(prompt).toContain('feat');
      expect(prompt).toContain('fix');
      expect(prompt).toContain('docs');
      expect(prompt).toContain('imperative mood');
      expect(prompt).toContain('Do NOT wrap your output in markdown code blocks');
      expect(prompt).toContain('Output ONLY the raw commit message text');
    });

    it('builds comprehensive user prompt with repository and diff details', () => {
      const userPrompt = buildUserPrompt(mockRepoContext, mockDiffData, 'Focus on accessibility');
      expect(userPrompt).toContain('Repository: /workspace/project');
      expect(userPrompt).toContain('Active Branch: main');
      expect(userPrompt).toContain('Staged Files (1 files, +1 -0):');
      expect(userPrompt).toContain('- [modified] file.ts');
      expect(userPrompt).toContain('User Instructions / Hint:');
      expect(userPrompt).toContain('Focus on accessibility');
      expect(userPrompt).toContain('```diff');
      expect(userPrompt).toContain('console.log("hello");');
    });

    it('indicates detached HEAD state in user prompt', () => {
      const userPrompt = buildUserPrompt(
        { repoPath: '/repo', branch: '431fd27', isDetached: true },
        mockDiffData
      );
      expect(userPrompt).toContain('Active Branch: 431fd27 (detached HEAD)');
    });

    it('buildCommitUserPrompt convenience helper formats correctly', () => {
      const userPrompt = buildCommitUserPrompt({
        repoPath: '/repo',
        branch: 'develop',
        stagedFiles: mockDiffData.stagedFiles,
        summary: mockDiffData.summary,
        rawDiff: mockDiffData.rawDiff,
        customPrompt: 'Refactor auth',
      });
      expect(userPrompt).toContain('Repository: /repo');
      expect(userPrompt).toContain('Active Branch: develop');
      expect(userPrompt).toContain('Files changed: 1');
      expect(userPrompt).toContain('Diff summary: +1 -0');
      expect(userPrompt).toContain('Refactor auth');
    });

    it('safely truncates large diffs exceeding character budget at line boundaries', () => {
      const bigLine = 'a'.repeat(50) + '\n';
      const bigDiff = bigLine.repeat(600); // ~30,600 characters
      expect(bigDiff.length).toBeGreaterThan(MAX_DIFF_CHAR_BUDGET);

      const truncated = truncateDiff(bigDiff, 20000, 3);
      expect(truncated.length).toBeLessThan(bigDiff.length);
      expect(truncated).toContain('... [staged diff truncated for length; 3 files changed in total]');
    });

    it('does not truncate diffs within character budget', () => {
      const shortDiff = 'diff --git a/a b/a\n+1\n';
      expect(truncateDiff(shortDiff, 20000)).toBe(shortDiff);
    });

    it('cleanRawResponse cleans markdown fences, quotes, and conversational filler', () => {
      expect(cleanRawResponse('```commit\nfeat(core): new engine\n```')).toBe('feat(core): new engine');
      expect(cleanRawResponse('"fix(ui): button alignment"')).toBe('fix(ui): button alignment');
      expect(cleanRawResponse("'chore(deps): bump vite'")).toBe('chore(deps): bump vite');
      expect(cleanRawResponse('Here is the commit message: feat: add modal')).toBe('feat: add modal');
      expect(cleanRawResponse('Suggested commit message: fix: null reference')).toBe('fix: null reference');
      expect(cleanRawResponse("Here's your commit message:\nfeat: dynamic routes")).toBe('feat: dynamic routes');
      expect(cleanRawResponse('')).toBe('');
      expect(cleanRawResponse(null as any)).toBe('');
    });

    it('extractCommitText extracts from varied object structures', () => {
      expect(extractCommitText('feat: direct string')).toBe('feat: direct string');
      expect(extractCommitText({ message: 'feat: from message' })).toBe('feat: from message');
      expect(extractCommitText({ commitMessage: 'fix: from commitMessage' })).toBe('fix: from commitMessage');
      expect(extractCommitText({ commit: 'refactor: from commit' })).toBe('refactor: from commit');
      expect(extractCommitText({ text: 'docs: from text' })).toBe('docs: from text');
      expect(extractCommitText({ output: 'perf: from output' })).toBe('perf: from output');
      expect(extractCommitText({ response: 'chore: from response' })).toBe('chore: from response');
      expect(extractCommitText({ data: { message: 'feat: nested data' } })).toBe('feat: nested data');
      expect(
        extractCommitText({
          choices: [{ message: { content: 'feat(openai): chat completion' } }],
        })
      ).toBe('feat(openai): chat completion');
      expect(
        extractCommitText({
          candidates: [{ content: { parts: [{ text: 'feat(gemini): parts completion' }] } }],
        })
      ).toBe('feat(gemini): parts completion');
    });

    it('parseConventionalCommit parses type, scope, breaking marker, subject, and body', () => {
      const parsed = parseConventionalCommit('feat(api)!: migrate to v2\n\nBREAKING CHANGE: v1 removed');
      expect(parsed.isValid).toBe(true);
      expect(parsed.type).toBe('feat');
      expect(parsed.scope).toBe('api');
      expect(parsed.isBreaking).toBe(true);
      expect(parsed.subject).toBe('migrate to v2');
      expect(parsed.body).toBe('BREAKING CHANGE: v1 removed');

      const nonConventional = parseConventionalCommit('just a regular message');
      expect(nonConventional.isValid).toBe(false);
      expect(nonConventional.type).toBe('chore');
      expect(nonConventional.subject).toBe('just a regular message');
    });
  });

  // =========================================================================
  // 2. Secret Masking & Safe Error Sanitization
  // =========================================================================
  describe('Secret Masking & Sanitization (aiUtils.ts)', () => {
    it('masks OpenAI standard and project API keys', () => {
      const msg = 'Failed with key sk-proj-1234567890abcdef1234567890 in header';
      expect(sanitizeErrorMessage(msg)).toBe('Failed with key [REDACTED_OPENAI_KEY] in header');

      const legacyMsg = 'Invalid key sk-abcdef1234567890abcdef12 rejected';
      expect(sanitizeErrorMessage(legacyMsg)).toBe('Invalid key [REDACTED_OPENAI_KEY] rejected');
    });

    it('masks Google Gemini API keys', () => {
      const msg = 'Upstream error: AIzaSyD94JkLmnOpQrStUvWxYz0123456789ABC rejected';
      expect(sanitizeErrorMessage(msg)).toBe('Upstream error: [REDACTED_GEMINI_KEY] rejected');
    });

    it('masks Bearer authorization tokens without redacting the English phrase bearer token', () => {
      const msg = 'Unauthorized: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
      expect(sanitizeErrorMessage(msg)).toBe('Unauthorized: Bearer [REDACTED_TOKEN]');

      // Guardrail test: should NOT corrupt user-facing instructions
      const instructions = 'Please check your API/bearer token in Settings.';
      expect(sanitizeErrorMessage(instructions)).toBe('Please check your API/bearer token in Settings.');
    });

    it('masks URL query string credentials', () => {
      const msg = 'Fetch failed to https://api.example.com/v1?key=AIzaSyABC123&token=secret-xyz&other=1';
      expect(sanitizeErrorMessage(msg)).toBe(
        'Fetch failed to https://api.example.com/v1?key=[REDACTED]&token=[REDACTED]&other=1'
      );
    });

    it('masks explicitly passed extra secrets', () => {
      const customSecret = 'my-super-secret-passphrase';
      const msg = `Connection failed using ${customSecret} on server.`;
      expect(sanitizeErrorMessage(msg, customSecret)).toBe('Connection failed using [REDACTED] on server.');
    });

    it('handles non-string, null, or undefined values gracefully', () => {
      expect(sanitizeErrorMessage(null)).toBe('');
      expect(sanitizeErrorMessage(undefined)).toBe('');
      expect(sanitizeErrorMessage('')).toBe('');
      expect(sanitizeErrorMessage(12345 as any)).toBe('12345');
    });
  });

  // =========================================================================
  // 3. 30-Second Timeout Helper (executeFetchWithTimeout)
  // =========================================================================
  describe('executeFetchWithTimeout', () => {
    it('passes signal to fetch and returns response on success', async () => {
      const mockResp = createMockResponse({ ok: true });
      const fetchSpy = vi.fn().mockResolvedValueOnce(mockResp);
      globalThis.fetch = fetchSpy;

      const resp = await executeFetchWithTimeout('https://api.test', { method: 'GET' }, 'TestProvider', 5000);
      expect(resp).toBe(mockResp);
      expect(fetchSpy).toHaveBeenCalledWith('https://api.test', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    it('translates AbortError into friendly provider timeout message', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr);

      await expect(
        executeFetchWithTimeout('https://api.test', {}, 'Ollama', 30000)
      ).rejects.toThrow('Ollama request timed out after 30 seconds.');
    });
  });

  // =========================================================================
  // 4. Local Ollama Client
  // =========================================================================
  describe('Local Ollama Client (ollamaClient.ts)', () => {
    it('successfully queries /api/chat and parses Conventional Commit', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          model: 'llama3.2',
          message: { role: 'assistant', content: 'feat(ui): add model badge' },
          done: true,
        })
      );

      const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
      expect(result.success).toBe(true);
      expect(result.data?.commitMessage).toBe('feat(ui): add model badge');
      expect(result.data?.parsed.type).toBe('feat');
      expect(result.data?.parsed.scope).toBe('ui');
    });

    it('supports fallback to /api/generate response structure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          response: 'fix: resolve race condition',
          done: true,
        })
      );

      const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
      expect(result.success).toBe(true);
      expect(result.data?.commitMessage).toBe('fix: resolve race condition');
    });

    it('normalizes base URL by stripping trailing slashes and ensuring protocol', () => {
      const config1 = resolveOllamaConfig({ ollamaBaseUrl: 'http://localhost:11434/' });
      expect(config1.baseUrl).toBe('http://localhost:11434');

      const config2 = resolveOllamaConfig({ ollamaBaseUrl: 'localhost:11434' });
      expect(config2.baseUrl).toBe('http://localhost:11434');
    });

    it('defaults to http://localhost:11434 and llama3.2', () => {
      const config = resolveOllamaConfig({});
      expect(config.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
      expect(config.model).toBe(DEFAULT_OLLAMA_MODEL);
    });

    it('detects offline daemon (ECONNREFUSED) with actionable instructions', async () => {
      const connErr = new TypeError('fetch failed');
      (connErr as any).cause = { code: 'ECONNREFUSED' };
      globalThis.fetch = vi.fn().mockRejectedValueOnce(connErr);

      const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Local Ollama is offline or unreachable at http://localhost:11434');
      expect(result.error).toContain("ollama serve");
    });

    it('handles 404 model not found with download guidance', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: "model 'codellama' not found" }, { status: 404 })
      );

      const result = await generateOllamaCommit({ ollamaModel: 'codellama' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ollama model 'codellama' not found");
      expect(result.error).toContain("ollama pull codellama");
    });

    it('handles HTTP 500 error from Ollama server', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse('Internal Server Error: CUDA out of memory', { status: 500 })
      );

      const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ollama returned HTTP 500');
    });

    it('handles 30-second timeout abort', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr);

      const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ollama request timed out after 30 seconds.');
    });
  });

  // =========================================================================
  // 5. OpenAI Cloud Client
  // =========================================================================
  describe('OpenAI Cloud Client (openaiClient.ts)', () => {
    it('returns error if API key is not configured', async () => {
      delete process.env.DEVPILOT_OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const result = await generateOpenAICommit({ openaiApiKey: '' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenAI API key is not configured');
      expect(result.error).toContain('Settings');
    });

    it('successfully queries OpenAI chat completion and parses Conventional Commit', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          choices: [{ message: { role: 'assistant', content: 'feat(auth): add OAuth2 provider' } }],
        })
      );
      globalThis.fetch = fetchSpy;

      const result = await generateOpenAICommit({ openaiApiKey: 'sk-test-valid-key-12345' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(true);
      expect(result.data?.commitMessage).toBe('feat(auth): add OAuth2 provider');
      expect(result.data?.parsed.type).toBe('feat');
      expect(result.data?.parsed.scope).toBe('auth');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-valid-key-12345',
          }),
        })
      );
    });

    it('strips redundant Bearer prefix and whitespace from user-entered key', () => {
      const config = resolveOpenAIConfig({ openaiApiKey: '  Bearer sk-test-key-1234567890  ' });
      expect(config.apiKey).toBe('sk-test-key-1234567890');
    });

    it('supports custom base URL for OpenAI-compatible proxies', () => {
      const config = resolveOpenAIConfig({ openaiBaseUrl: 'https://openrouter.ai/api/v1/' });
      expect(config.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('translates HTTP 401 into actionable invalid key notice', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Incorrect API key provided' } }, { status: 401 })
      );

      const result = await generateOpenAICommit({ openaiApiKey: 'sk-invalid' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid OpenAI API key');
      expect(result.error).toContain('Settings');
    });

    it('translates HTTP 429 into quota or rate limit notice', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: { message: 'You exceeded your current quota' } }, { status: 429 })
      );

      const result = await generateOpenAICommit({ openaiApiKey: 'sk-valid' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenAI quota or rate limit exceeded');
      expect(result.error).toContain('billing');
    });

    it('translates HTTP 404 into model not found notice', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Model does not exist' } }, { status: 404 })
      );

      const result = await generateOpenAICommit(
        { openaiApiKey: 'sk-valid', openaiModel: 'gpt-fake' },
        mockRepoContext,
        mockDiffData
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("OpenAI model 'gpt-fake' not found");
    });

    it('translates HTTP 400 context length error into actionable notice', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse('Error: context_length_exceeded in prompt', { status: 400 })
      );

      const result = await generateOpenAICommit({ openaiApiKey: 'sk-valid' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Staged diff exceeds the OpenAI model's maximum context length");
    });

    it('masks raw API keys reflected in server error messages', async () => {
      const rawKey = 'sk-proj-supersecretkey1234567890abcdef';
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse(`Error: provided key ${rawKey} is expired`, { status: 500 })
      );

      const result = await generateOpenAICommit({ openaiApiKey: rawKey }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).not.toContain(rawKey);
      expect(result.error).toContain('[REDACTED_OPENAI_KEY]');
    });

    it('handles 30-second timeout abort', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr);

      const result = await generateOpenAICommit({ openaiApiKey: 'sk-valid' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenAI request timed out after 30 seconds.');
    });
  });

  // =========================================================================
  // 6. Google Gemini Client
  // =========================================================================
  describe('Google Gemini Client (geminiClient.ts)', () => {
    it('returns error if API key is not configured', async () => {
      delete process.env.DEVPILOT_GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const result = await generateGeminiCommit({ geminiApiKey: '' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Google Gemini API key is not configured');
      expect(result.error).toContain('Settings');
    });

    it('authenticates via x-goog-api-key header and avoids query parameter leak', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          candidates: [{ content: { parts: [{ text: 'docs(readme): update setup instructions' }], role: 'model' } }],
        })
      );
      globalThis.fetch = fetchSpy;

      const result = await generateGeminiCommit(
        { geminiApiKey: 'AIzaSySecretGeminiKey123456789012345' },
        mockRepoContext,
        mockDiffData
      );

      expect(result.success).toBe(true);
      expect(result.data?.commitMessage).toBe('docs(readme): update setup instructions');
      expect(result.data?.parsed.type).toBe('docs');

      const calledUrl = fetchSpy.mock.calls[0][0];
      const calledOptions = fetchSpy.mock.calls[0][1];

      expect(calledUrl).not.toContain('?key=');
      expect(calledOptions.headers).toMatchObject({
        'x-goog-api-key': 'AIzaSySecretGeminiKey123456789012345',
      });
    });

    it('normalizes model name by removing duplicate models/ prefix', () => {
      const config = resolveGeminiConfig({ geminiModel: 'models/gemini-1.5-flash' });
      expect(config.model).toBe('gemini-1.5-flash');
    });

    it('translates HTTP 400 and 403 API key invalid into actionable notice', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: { message: 'API key not valid. Please pass a valid API key.' } }, { status: 400 })
      );

      const result = await generateGeminiCommit({ geminiApiKey: 'AIzaSyBad' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Google Gemini API key is invalid or unauthorized');
      expect(result.error).toContain('Settings');
    });

    it('translates HTTP 403 PERMISSION_DENIED into API enablement notice', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: { status: 'PERMISSION_DENIED', message: 'API not enabled' } }, { status: 403 })
      );

      const result = await generateGeminiCommit({ geminiApiKey: 'AIzaSyKey' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Gemini API access denied');
      expect(result.error).toContain('Generative Language API');
    });

    it('translates HTTP 404 into model not found notice for v1beta', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: { message: 'models/gemini-fake not found' } }, { status: 404 })
      );

      const result = await generateGeminiCommit(
        { geminiApiKey: 'AIzaSyKey', geminiModel: 'gemini-fake' },
        mockRepoContext,
        mockDiffData
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Google Gemini model 'gemini-fake' not found");
      expect(result.error).toContain('v1beta');
    });

    it('translates HTTP 429 into rate limit / quota exceeded notice', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Resource exhausted' } }, { status: 429 })
      );

      const result = await generateGeminiCommit({ geminiApiKey: 'AIzaSyKey' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Google Gemini rate limit or quota exceeded');
    });

    it('detects SAFETY finishReason blocks gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({
          candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
        })
      );

      const result = await generateGeminiCommit({ geminiApiKey: 'AIzaSyKey' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Gemini response blocked by content safety filters.');
    });

    it('masks Gemini keys reflected in body or URL query errors', async () => {
      const rawKey = 'AIzaSySecretGeminiKey123456789012345';
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse(`Error: failed request at https://api.google.com?key=${rawKey}: key ${rawKey} is invalid`, { status: 500 })
      );

      const result = await generateGeminiCommit({ geminiApiKey: rawKey }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).not.toContain(rawKey);
      expect(result.error).toContain('[REDACTED_GEMINI_KEY]');
      expect(result.error).toContain('?key=[REDACTED]');
    });

    it('handles 30-second timeout abort', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr);

      const result = await generateGeminiCommit({ geminiApiKey: 'AIzaSyKey' }, mockRepoContext, mockDiffData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Gemini request timed out after 30 seconds.');
    });
  });

  // =========================================================================
  // 7. Custom Webhook Client
  // =========================================================================
  describe('Custom Webhook Client (webhookClient.ts)', () => {
    it('successfully posts structured diff payload and parses Conventional Commit', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        createMockResponse({ message: 'feat(core): update dispatch router' })
      );
      globalThis.fetch = fetchSpy;

      const result = await generateWebhookCommit(
        { webhookUrl: 'https://webhook.n8n.cloud/webhook/test' },
        mockRepoContext,
        mockDiffData
      );

      expect(result.success).toBe(true);
      expect(result.data?.commitMessage).toBe('feat(core): update dispatch router');
      expect(result.data?.parsed.type).toBe('feat');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://webhook.n8n.cloud/webhook/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('attaches dual Authorization Bearer and X-API-KEY headers when token is provided', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        createMockResponse({ message: 'chore: updated deps' })
      );
      globalThis.fetch = fetchSpy;

      await generateWebhookCommit(
        { webhookUrl: 'https://example.com/webhook', webhookToken: 'secret-token-123' },
        mockRepoContext,
        mockDiffData
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-token-123',
            'X-API-KEY': 'secret-token-123',
          }),
        })
      );
    });

    it('forwards customPrompt in webhook payload body', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        createMockResponse({ message: 'feat: with prompt' })
      );
      globalThis.fetch = fetchSpy;

      await generateWebhookCommit(
        { webhookUrl: 'https://example.com/webhook', customPrompt: 'Focus on performance' },
        mockRepoContext,
        mockDiffData
      );

      const bodyStr = fetchSpy.mock.calls[0][1].body;
      const parsedBody = JSON.parse(bodyStr);
      expect(parsedBody.customPrompt).toBe('Focus on performance');
    });

    it('translates HTTP 401 into actionable message mentioning Settings', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse('Unauthorized', { status: 401 })
      );

      const result = await generateWebhookCommit(
        { webhookUrl: 'https://example.com/webhook' },
        mockRepoContext,
        mockDiffData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Webhook returned HTTP 401: Unauthorized');
      expect(result.error).toContain('Settings');
    });

    it('translates HTTP 403 into actionable message mentioning Settings', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse('Forbidden', { status: 403 })
      );

      const result = await generateWebhookCommit(
        { webhookUrl: 'https://example.com/webhook' },
        mockRepoContext,
        mockDiffData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Webhook returned HTTP 403: Forbidden');
      expect(result.error).toContain('Settings');
    });

    it('handles connection refused (ECONNREFUSED) with actionable server status notice', async () => {
      const connErr = new TypeError('fetch failed');
      (connErr as any).cause = { code: 'ECONNREFUSED' };
      globalThis.fetch = vi.fn().mockRejectedValueOnce(connErr);

      const result = await generateWebhookCommit(
        { webhookUrl: 'http://localhost:5678/webhook' },
        mockRepoContext,
        mockDiffData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('handles DNS resolution failure (ENOTFOUND) with host not found notice', async () => {
      const dnsErr = new TypeError('fetch failed');
      (dnsErr as any).cause = { code: 'ENOTFOUND' };
      globalThis.fetch = vi.fn().mockRejectedValueOnce(dnsErr);

      const result = await generateWebhookCommit(
        { webhookUrl: 'https://nonexistent-domain-xyz.org/webhook' },
        mockRepoContext,
        mockDiffData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('DNS resolution error');
    });

    it('handles 30-second timeout abort', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr);

      const result = await generateWebhookCommit(
        { webhookUrl: 'https://example.com/slow' },
        mockRepoContext,
        mockDiffData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook request timed out after 30 seconds.');
    });

    it('validates invalid URL formats and unsupported protocols', () => {
      expect(validateWebhookUrl('').isValid).toBe(false);
      expect(validateWebhookUrl('invalid-url').isValid).toBe(false);
      expect(validateWebhookUrl('ftp://example.com').isValid).toBe(false);
      expect(validateWebhookUrl('https://example.com').isValid).toBe(true);
    });
  });

  // =========================================================================
  // 8. AIService Coordinator & Provider Routing
  // =========================================================================
  describe('Central AIService Coordinator (aiService.ts)', () => {
    it('returns error if options is not an object or repoPath is empty', async () => {
      const res1 = await generateCommitMessage(null as any);
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Options must be an object');

      const res2 = await generateCommitMessage({ repoPath: '' });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Repository path must be a non-empty string');
    });

    it('returns error if gitService.getAllStagedDiff fails', async () => {
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValueOnce({
        success: false,
        error: 'Git execution failed',
      });

      const res = await generateCommitMessage({ repoPath: '/repo' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Git execution failed');
    });

    it('short-circuits immediately if staged changes are empty without executing fetch', async () => {
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

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const res = await generateCommitMessage({ repoPath: '/repo' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('No staged changes found in repository.');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('routes correctly based on options.provider override', async () => {
      vi.spyOn(gitService, 'getAllStagedDiff').mockResolvedValue({
        success: true,
        data: mockDiffData,
      });
      vi.spyOn(gitService, 'getStatus').mockResolvedValue({
        success: true,
        data: { repoPath: '/repo', branch: 'main', isDetached: false, staged: [], unstaged: [], untracked: [] },
      });

      // 1. Ollama route
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ message: { content: 'feat: routed to ollama' } })
      );
      const resOllama = await generateCommitMessage({ repoPath: '/repo', provider: 'ollama' });
      expect(resOllama.success).toBe(true);
      expect(resOllama.data?.commitMessage).toBe('feat: routed to ollama');

      // 2. OpenAI route
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ choices: [{ message: { content: 'feat: routed to openai' } }] })
      );
      const resOpenAI = await generateCommitMessage({
        repoPath: '/repo',
        provider: 'openai',
        openaiApiKey: 'sk-test-key-1234567890',
      });
      expect(resOpenAI.success).toBe(true);
      expect(resOpenAI.data?.commitMessage).toBe('feat: routed to openai');

      // 3. Gemini route
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ candidates: [{ content: { parts: [{ text: 'feat: routed to gemini' }] } }] })
      );
      const resGemini = await generateCommitMessage({
        repoPath: '/repo',
        provider: 'gemini',
        geminiApiKey: 'AIzaSyTest1234567890',
      });
      expect(resGemini.success).toBe(true);
      expect(resGemini.data?.commitMessage).toBe('feat: routed to gemini');

      // 4. Webhook route
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        createMockResponse({ message: 'feat: routed to webhook' })
      );
      const resWebhook = await generateCommitMessage({
        repoPath: '/repo',
        provider: 'webhook',
        webhookUrl: 'https://example.com/webhook',
      });
      expect(resWebhook.success).toBe(true);
      expect(resWebhook.data?.commitMessage).toBe('feat: routed to webhook');
    });

    it('resolves active provider from process.env.DEVPILOT_AI_PROVIDER', () => {
      process.env.DEVPILOT_AI_PROVIDER = 'ollama';
      expect(resolveActiveProvider()).toBe('ollama');

      process.env.DEVPILOT_AI_PROVIDER = 'openai';
      expect(resolveActiveProvider()).toBe('openai');

      delete process.env.DEVPILOT_AI_PROVIDER;
      expect(resolveActiveProvider()).toBe('webhook');
    });

    it('getResolvedAIConfig returns complete configuration without exposing secrets in cleartext', () => {
      process.env.DEVPILOT_WEBHOOK_URL = 'https://webhook.env/api';
      process.env.DEVPILOT_WEBHOOK_TOKEN = 'secret-webhook-token';
      process.env.DEVPILOT_OPENAI_API_KEY = 'sk-proj-secretopenaitoken12345';
      process.env.DEVPILOT_GEMINI_API_KEY = 'AIzaSySecretGeminiKey12345';
      process.env.DEVPILOT_AI_PROVIDER = 'openai';

      const configResult = getResolvedAIConfig();
      expect(configResult.success).toBe(true);

      const config = configResult.data!;
      expect(config.activeProvider).toBe('openai');

      // Masking verification
      expect(config.providerConfigs.webhook.webhookToken).toBe('••••••••');
      expect(config.providerConfigs.openai.apiKey).toBe('••••••••');
      expect(config.providerConfigs.gemini.apiKey).toBe('••••••••');

      // Env defaults boolean flags
      expect(config.envDefaults.hasWebhookToken).toBe(true);
      expect(config.envDefaults.hasOpenAiKey).toBe(true);
      expect(config.envDefaults.hasGeminiKey).toBe(true);
      expect(config.envDefaults.webhookUrl).toBe('https://webhook.env/api');

      // Sources verification
      expect(config.sources.webhook).toBe('env');
      expect(config.sources.openai).toBe('env');
      expect(config.sources.gemini).toBe('env');
    });
  });
});
