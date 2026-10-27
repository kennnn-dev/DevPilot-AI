/**
 * Milestone 9 Empirical Adversarial Stress Test Suite.
 *
 * Rigorously stress-tests:
 * 1. sanitizeErrorMessage: diverse secret formats, JSON embedding, stack traces, extra secrets, regex characters, false positive resistance.
 * 2. executeFetchWithTimeout: timers, rapid abortions, hung promises, timer cleanup, AbortSignal propagation.
 * 3. Client Error Mappings:
 *    - Ollama: ECONNREFUSED, 404 missing model, 400 bad model, 500 server error, timeout.
 *    - OpenAI: 401 invalid key, 429 quota, 404 missing model, 400 context length, timeout, key reflection masking.
 *    - Gemini: 400 invalid key, 403 invalid key, 403 PERMISSION_DENIED, 404 model, 429 quota, SAFETY block, timeout.
 *    - Webhook: 401, 403, ECONNREFUSED, ENOTFOUND, ETIMEDOUT, timeout, URL validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeErrorMessage, executeFetchWithTimeout } from '../../src/main/services/ai/aiUtils';
import { generateOllamaCommit } from '../../src/main/services/ai/ollamaClient';
import { generateOpenAICommit } from '../../src/main/services/ai/openaiClient';
import { generateGeminiCommit } from '../../src/main/services/ai/geminiClient';
import { generateWebhookCommit, validateWebhookUrl } from '../../src/main/services/ai/webhookClient';
import type { GitAllStagedDiffResult, WebhookRepositoryContext } from '../../src/shared/types';

const mockRepoContext: WebhookRepositoryContext = {
  repoPath: '/workspace/test-repo',
  branch: 'main',
  isDetached: false,
};

const mockDiffData: GitAllStagedDiffResult = {
  repoPath: '/workspace/test-repo',
  rawDiff: 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n',
  stagedFiles: [{ path: 'file.ts', changeType: 'modified', statusCode: 'M' }],
  summary: { filesChanged: 1, insertions: 1, deletions: 1 },
  isEmpty: false,
};

function createMockResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  const ok = init.ok ?? (status >= 200 && status < 300);
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => bodyText,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  } as unknown as Response;
}

describe('Empirical Adversarial Stress Suite - Milestone 9', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Track 1: sanitizeErrorMessage Comprehensive Stress Testing
  // =========================================================================
  describe('Track 1: sanitizeErrorMessage Stress & Edge Cases', () => {
    describe('OpenAI Key Masking (sk-...) patterns', () => {
      it('masks standard 51-char OpenAI keys (sk-...)', () => {
        const standardKey = 'sk-abcdef1234567890abcdef1234567890abcdef1234567890';
        const msg = `API error: key ${standardKey} failed authentication`;
        const sanitized = sanitizeErrorMessage(msg);
        expect(sanitized).not.toContain(standardKey);
        expect(sanitized).toContain('[REDACTED_OPENAI_KEY]');
      });

      it('masks modern OpenAI project keys (sk-proj-...)', () => {
        const projKey = 'sk-proj-ABC123xyz456_789-00000000000000000000000000000000000000000000000000000000000000000000000000000000';
        const msg = `Error posting to /chat/completions with token: ${projKey}`;
        const sanitized = sanitizeErrorMessage(msg);
        expect(sanitized).not.toContain(projKey);
        expect(sanitized).toContain('[REDACTED_OPENAI_KEY]');
      });

      it('masks OpenAI service account / admin keys (sk-admin-...)', () => {
        const adminKey = 'sk-admin-1234567890abcdef1234567890abcdef12345678';
        const msg = `Failed admin request using key ${adminKey}`;
        const sanitized = sanitizeErrorMessage(msg);
        expect(sanitized).not.toContain(adminKey);
        expect(sanitized).toContain('[REDACTED_OPENAI_KEY]');
      });

      it('masks multiple distinct OpenAI keys in a single message', () => {
        const key1 = 'sk-proj-11111111111111111111111111111111111111111111';
        const key2 = 'sk-222222222222222222222222222222222222222222222222';
        const msg = `Rotated from ${key1} to ${key2} but both failed.`;
        const sanitized = sanitizeErrorMessage(msg);
        expect(sanitized).not.toContain(key1);
        expect(sanitized).not.toContain(key2);
        expect(sanitized).toBe('Rotated from [REDACTED_OPENAI_KEY] to [REDACTED_OPENAI_KEY] but both failed.');
      });

      it('masks OpenAI keys embedded in JSON structures', () => {
        const jsonKey = 'sk-proj-99999999999999999999999999999999999999999999';
        const jsonMsg = JSON.stringify({ error: { code: 401, key: jsonKey, details: 'Unauthorized' } });
        const sanitized = sanitizeErrorMessage(jsonMsg);
        expect(sanitized).not.toContain(jsonKey);
        expect(sanitized).toContain('[REDACTED_OPENAI_KEY]');
      });

      it('does NOT mask short benign prefixes like sk-none or task-123', () => {
        expect(sanitizeErrorMessage('sk-none')).toBe('sk-none');
        expect(sanitizeErrorMessage('task-12345')).toBe('task-12345');
        expect(sanitizeErrorMessage('task-sk-123')).toBe('task-sk-123');
      });
    });

    describe('Google Gemini Key Masking (AIza...) patterns', () => {
      it('masks standard Google API key (AIzaSy...) in text', () => {
        const geminiKey = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
        const msg = `Gemini call failed with API key: ${geminiKey}`;
        const sanitized = sanitizeErrorMessage(msg);
        expect(sanitized).not.toContain(geminiKey);
        expect(sanitized).toContain('[REDACTED_GEMINI_KEY]');
      });

      it('masks Google API key embedded in URL path or query string', () => {
        const geminiKey = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}&alt=json`;
        const sanitized = sanitizeErrorMessage(`Failed fetch: ${url}`);
        expect(sanitized).not.toContain(geminiKey);
        expect(sanitized).toContain('?key=[REDACTED]');
      });

      it('masks Google API key embedded in JSON error payload', () => {
        const geminiKey = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
        const json = `{"error":{"message":"API key ${geminiKey} expired","status":"INVALID_ARGUMENT"}}`;
        const sanitized = sanitizeErrorMessage(json);
        expect(sanitized).not.toContain(geminiKey);
        expect(sanitized).toContain('[REDACTED_GEMINI_KEY]');
      });
    });

    describe('Bearer Token Masking & False Positive Guardrails', () => {
      it('masks JWT Bearer tokens with base64 characters, dots, and hyphens', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvZSJ9.abc_XYZ-123';
        const msg = `Authorization header: Bearer ${jwt}`;
        const sanitized = sanitizeErrorMessage(msg);
        expect(sanitized).not.toContain(jwt);
        expect(sanitized).toBe('Authorization header: Bearer [REDACTED_TOKEN]');
      });

      it('masks simple alphanumeric and hex Bearer tokens', () => {
        expect(sanitizeErrorMessage('Bearer secretToken1234567890')).toBe('Bearer [REDACTED_TOKEN]');
        expect(sanitizeErrorMessage('Bearer 0123456789abcdef0123456789abcdef')).toBe('Bearer [REDACTED_TOKEN]');
        expect(sanitizeErrorMessage('Bearer    lots_of_spaces_9999')).toBe('Bearer [REDACTED_TOKEN]');
        expect(sanitizeErrorMessage('bearer lowercase_token_1234')).toBe('Bearer [REDACTED_TOKEN]');
      });

      it('does NOT corrupt already redacted tokens on repeated sanitization calls (idempotence)', () => {
        const msg = 'Authorization: Bearer [REDACTED_TOKEN]';
        expect(sanitizeErrorMessage(msg)).toBe('Authorization: Bearer [REDACTED_TOKEN]');
        const secondPass = sanitizeErrorMessage(sanitizeErrorMessage(msg));
        expect(secondPass).toBe('Authorization: Bearer [REDACTED_TOKEN]');
      });

      it('strictly preserves the user-facing instruction "Please check your API/bearer token in Settings."', () => {
        const instruction = 'Please check your API/bearer token in Settings.';
        expect(sanitizeErrorMessage(instruction)).toBe(instruction);
      });
    });

    describe('URL Query Parameter Masking', () => {
      it('masks key, token, api_key, apiKey across multiple query params', () => {
        const url = 'https://api.example.com/v1/chat?key=secretKey1&other=val&token=secretTok2&api_key=secretKey3&apiKey=secretKey4';
        const sanitized = sanitizeErrorMessage(url);
        expect(sanitized).not.toContain('secretKey1');
        expect(sanitized).not.toContain('secretTok2');
        expect(sanitized).not.toContain('secretKey3');
        expect(sanitized).not.toContain('secretKey4');
        expect(sanitized).toBe(
          'https://api.example.com/v1/chat?key=[REDACTED]&other=val&token=[REDACTED]&api_key=[REDACTED]&apiKey=[REDACTED]'
        );
      });

      it('masks tokens with dots (e.g. JWT tokens) in query strings without leaking claims or signatures', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
        const url = `https://api.example.com/webhook?token=${jwt}&other=1`;
        const sanitized = sanitizeErrorMessage(url);
        expect(sanitized).not.toContain('eyJzdWIiOiIxMjM0NTY3ODkwIn0');
        expect(sanitized).not.toContain('signature');
        expect(sanitized).toBe('https://api.example.com/webhook?token=[REDACTED]&other=1');
      });
    });

    describe('Extra Secrets & Regex Special Character Escaping', () => {
      it('properly escapes regex metacharacters in custom extraSecrets', () => {
        const specialSecret = 'pass+word*with[special].chars?and$doll^ar{123}';
        const msg = `Connected failed with secret ${specialSecret} on remote`;
        const sanitized = sanitizeErrorMessage(msg, specialSecret);
        expect(sanitized).not.toContain(specialSecret);
        expect(sanitized).toBe('Connected failed with secret [REDACTED] on remote');
      });

      it('ignores short or empty extra secrets (< 4 characters) to prevent mass redactions', () => {
        const msg = 'Here is a normal error message with the letter a';
        expect(sanitizeErrorMessage(msg, 'a')).toBe(msg);
        expect(sanitizeErrorMessage(msg, '   ')).toBe(msg);
        expect(sanitizeErrorMessage(msg, undefined)).toBe(msg);
      });
    });

    describe('Multiline Stack Traces and Complex Error Objects', () => {
      it('sanitizes keys embedded deep in multiline Error stack traces', () => {
        const secretKey = 'sk-proj-secretstackkey1234567890abcdef1234567890';
        const stack = `Error: Request failed
    at executeFetch (/app/src/main/services/ai/aiUtils.ts:60:12)
    at Object.generateOpenAICommit (url: https://api.openai.com/v1?key=${secretKey})
    at async generateCommitMessage (/app/src/main/services/ai/aiService.ts:140:16)`;

        const sanitized = sanitizeErrorMessage(stack);
        expect(sanitized).not.toContain(secretKey);
        expect(sanitized).toContain('?key=[REDACTED]');
      });
    });
  });

  // =========================================================================
  // Track 2: executeFetchWithTimeout Robustness & Signal Propagation
  // =========================================================================
  describe('Track 2: executeFetchWithTimeout Robustness', () => {
    it('guarantees clearTimeout cleanup after successful fetch execution', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const mockResp = createMockResponse({ ok: true });
      globalThis.fetch = vi.fn().mockResolvedValueOnce(mockResp);

      const resp = await executeFetchWithTimeout('https://api.example.com', { method: 'GET' }, 'TestProvider', 5000);
      expect(resp).toBe(mockResp);
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('guarantees clearTimeout cleanup when fetch fails with network error', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Network connection reset'));

      await expect(
        executeFetchWithTimeout('https://api.example.com', { method: 'GET' }, 'TestProvider', 5000)
      ).rejects.toThrow('Network connection reset');

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('translates AbortError into provider-specific timeout error', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr);

      await expect(
        executeFetchWithTimeout('https://api.example.com', {}, 'Gemini', 30000)
      ).rejects.toThrow('Gemini request timed out after 30 seconds.');
    });

    it('translates timeout when internal controller aborts', async () => {
      vi.useFakeTimers();
      try {
        globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
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

        const fetchPromise = executeFetchWithTimeout('https://api.example.com', {}, 'Ollama', 30000);
        // Advance clock by 30 seconds
        vi.advanceTimersByTime(30000);

        await expect(fetchPromise).rejects.toThrow('Ollama request timed out after 30 seconds.');
      } finally {
        vi.useRealTimers();
      }
    });

    it('investigates caller-provided options.signal behavior in executeFetchWithTimeout', async () => {
      const externalController = new AbortController();
      const mockResp = createMockResponse({ success: true });

      const fetchSpy = vi.fn().mockImplementation((_url, _options) => {
        return Promise.resolve(mockResp);
      });
      globalThis.fetch = fetchSpy;

      await executeFetchWithTimeout(
        'https://api.example.com',
        { signal: externalController.signal },
        'OpenAI',
        30000
      );

      expect(fetchSpy).toHaveBeenCalled();
      const passedSignal = fetchSpy.mock.calls[0][1].signal;
      expect(passedSignal).toBeDefined();
      expect(passedSignal).toBeInstanceOf(AbortSignal);
    });

    it('propagates caller-provided options.signal so calling abort() terminates fetch immediately without waiting for timeout', async () => {
      const callerController = new AbortController();
      let fetchAborted = false;

      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            if (options.signal.aborted) {
              fetchAborted = true;
              return reject(new DOMException('The user aborted a request.', 'AbortError'));
            }
            options.signal.addEventListener('abort', () => {
              fetchAborted = true;
              reject(new DOMException('The user aborted a request.', 'AbortError'));
            });
          }
        });
      });

      const fetchPromise = executeFetchWithTimeout(
        'https://api.example.com',
        { signal: callerController.signal },
        'OpenAI',
        2000
      );
      // Attach no-op catch to avoid unhandled rejection during the 10ms wait
      fetchPromise.catch(() => {});

      // Caller triggers abort immediately
      callerController.abort();

      // If signal was propagated, fetchAborted must be true immediately
      await new Promise((r) => setTimeout(r, 10));
      expect(fetchAborted, 'Underlying fetch should receive abort signal when callerController.abort() is called').toBe(true);

      await expect(fetchPromise).rejects.toThrow();
    });
  });

  // =========================================================================
  // Track 3: Provider Client Error Mappings
  // =========================================================================
  describe('Track 3: Provider Client Error Mappings', () => {
    describe('Ollama Client Error Mappings', () => {
      it('maps ECONNREFUSED error to actionable "ollama serve" guidance', async () => {
        const error = new TypeError('fetch failed');
        (error as any).cause = { code: 'ECONNREFUSED' };
        globalThis.fetch = vi.fn().mockRejectedValueOnce(error);

        const result = await generateOllamaCommit(
          { ollamaBaseUrl: 'http://localhost:11434' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('Local Ollama is offline or unreachable at http://localhost:11434');
        expect(result.error).toContain("ollama serve");
      });

      it('maps direct error code ECONNREFUSED', async () => {
        const error = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:11434' };
        globalThis.fetch = vi.fn().mockRejectedValueOnce(error);

        const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toContain("ollama serve");
      });

      it('maps HTTP 404 missing model to actionable "ollama pull" guidance', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse('model "qwen2.5-coder" not found, try pulling it first', { status: 404 })
        );

        const result = await generateOllamaCommit(
          { ollamaModel: 'qwen2.5-coder' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain("Ollama model 'qwen2.5-coder' not found");
        expect(result.error).toContain("ollama pull qwen2.5-coder");
      });

      it('maps HTTP 400 bad model request', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse('model name is required', { status: 400 })
        );

        const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Ollama request failed: model name is required or invalid');
      });

      it('maps HTTP 500 server internal error', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse('Internal Server Error: out of VRAM', { status: 500 })
        );

        const result = await generateOllamaCommit({}, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Ollama returned HTTP 500: Internal Server Error: out of VRAM');
      });
    });

    describe('OpenAI Client Error Mappings', () => {
      const validKey = 'sk-test-valid-key-123456789012345';

      it('maps HTTP 401 to invalid API key message directing to Settings', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { message: 'Incorrect API key provided' } }, { status: 401 })
        );

        const result = await generateOpenAICommit({ openaiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid OpenAI API key. Please check and update your API key in Settings.');
      });

      it('maps HTTP 429 to quota or rate limit exceeded message', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { message: 'You exceeded your current quota' } }, { status: 429 })
        );

        const result = await generateOpenAICommit({ openaiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe('OpenAI quota or rate limit exceeded. Please check your OpenAI billing plan and account limits.');
      });

      it('maps HTTP 404 to model not found message', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { message: 'The model `gpt-5-preview` does not exist' } }, { status: 404 })
        );

        const result = await generateOpenAICommit(
          { openaiApiKey: validKey, openaiModel: 'gpt-5-preview' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe("OpenAI model 'gpt-5-preview' not found or your API key does not have access to it.");
      });

      it('maps HTTP 400 context length exceeded to staging suggestion', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { message: "This model's maximum context length is 128000 tokens. (context_length_exceeded)" } }, { status: 400 })
        );

        const result = await generateOpenAICommit({ openaiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe("Staged diff exceeds the OpenAI model's maximum context length. Try staging fewer changes.");
      });

      it('redacts sensitive API key when reflected in custom error responses', async () => {
        const rawSecretKey = 'sk-proj-reflectedkey1234567890abcdef1234567890';
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse(`Authentication header Bearer ${rawSecretKey} was rejected by proxy`, { status: 502 })
        );

        const result = await generateOpenAICommit({ openaiApiKey: rawSecretKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).not.toContain(rawSecretKey);
        expect(result.error).toContain('Bearer [REDACTED_OPENAI_KEY]');
      });
    });

    describe('Google Gemini Client Error Mappings', () => {
      const validKey = 'AIzaSySecretValidGeminiKey123456789012';

      it('maps HTTP 400 invalid API key to actionable notice', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, { status: 400 })
        );

        const result = await generateGeminiCommit({ geminiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Google Gemini API key is invalid or unauthorized. Please check your API key in Settings.');
      });

      it('maps HTTP 403 API_KEY_INVALID to actionable notice', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { code: 403, message: 'API_KEY_INVALID: The provided API key is invalid.', status: 'PERMISSION_DENIED' } }, { status: 403 })
        );

        const result = await generateGeminiCommit({ geminiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Google Gemini API key is invalid or unauthorized. Please check your API key in Settings.');
      });

      it('maps HTTP 403 PERMISSION_DENIED (API not enabled) to enablement notice', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { code: 403, message: 'PERMISSION_DENIED: Generative Language API has not been used in project 12345.', status: 'PERMISSION_DENIED' } }, { status: 403 })
        );

        const result = await generateGeminiCommit({ geminiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Gemini API access denied');
        expect(result.error).toContain('Generative Language API is enabled');
      });

      it('maps HTTP 404 to model not found notice for v1beta', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { code: 404, message: 'models/gemini-2.0-flash is not found for API version v1beta', status: 'NOT_FOUND' } }, { status: 404 })
        );

        const result = await generateGeminiCommit({ geminiApiKey: validKey, geminiModel: 'gemini-2.0-flash' }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe("Google Gemini model 'gemini-2.0-flash' not found for API version v1beta.");
      });

      it('maps HTTP 429 to rate limit or quota notice', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }, { status: 429 })
        );

        const result = await generateGeminiCommit({ geminiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Google Gemini rate limit or quota exceeded. Please wait a moment or check your AI Studio quota.');
      });

      it('detects SAFETY blocks and returns content safety notice', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse({
            candidates: [
              {
                finishReason: 'SAFETY',
                safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH' }],
              },
            ],
          })
        );

        const result = await generateGeminiCommit({ geminiApiKey: validKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Gemini response blocked by content safety filters.');
      });

      it('redacts Gemini keys reflected in upstream 500 error messages', async () => {
        const rawGeminiKey = 'AIzaSyBadSecretKey12345678901234567890';
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse(`Upstream error for key ${rawGeminiKey}: service unavailable`, { status: 500 })
        );

        const result = await generateGeminiCommit({ geminiApiKey: rawGeminiKey }, mockRepoContext, mockDiffData);
        expect(result.success).toBe(false);
        expect(result.error).not.toContain(rawGeminiKey);
        expect(result.error).toContain('[REDACTED_GEMINI_KEY]');
      });
    });

    describe('Custom Webhook Client Error Mappings', () => {
      it('rejects invalid or missing webhook URL formats cleanly', async () => {
        expect(validateWebhookUrl('').isValid).toBe(false);
        expect(validateWebhookUrl('ftp://example.com/webhook').isValid).toBe(false);
        expect(validateWebhookUrl('invalid-url-format').isValid).toBe(false);
        expect(validateWebhookUrl('http://localhost:5678/webhook').isValid).toBe(true);
        expect(validateWebhookUrl('https://example.com/webhook').isValid).toBe(true);
      });

      it('maps HTTP 401 Unauthorized directing to Settings token', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse('Unauthorized request', { status: 401 })
        );

        const result = await generateWebhookCommit(
          { webhookUrl: 'https://example.com/webhook' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe('Webhook returned HTTP 401: Unauthorized. Please check your API/bearer token in Settings.');
      });

      it('maps HTTP 403 Forbidden directing to Settings permissions', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse('Forbidden request', { status: 403 })
        );

        const result = await generateWebhookCommit(
          { webhookUrl: 'https://example.com/webhook' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe('Webhook returned HTTP 403: Forbidden. Please verify endpoint permissions in Settings.');
      });

      it('maps ECONNREFUSED with actionable server notice', async () => {
        const error = new TypeError('fetch failed');
        (error as any).cause = { code: 'ECONNREFUSED' };
        globalThis.fetch = vi.fn().mockRejectedValueOnce(error);

        const result = await generateWebhookCommit(
          { webhookUrl: 'http://localhost:5678/webhook' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe('Webhook request failed: Connection refused. Check if your webhook server is running.');
      });

      it('maps ENOTFOUND with DNS resolution notice', async () => {
        const error = new TypeError('fetch failed');
        (error as any).cause = { code: 'ENOTFOUND' };
        globalThis.fetch = vi.fn().mockRejectedValueOnce(error);

        const result = await generateWebhookCommit(
          { webhookUrl: 'https://nonexistent-host-xyz.invalid/webhook' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe('Webhook request failed: Host not found (DNS resolution error). Check your webhook URL.');
      });

      it('maps ETIMEDOUT with server timeout notice', async () => {
        const error = new Error('connect ETIMEDOUT 10.0.0.1:443');
        (error as any).code = 'ETIMEDOUT';
        globalThis.fetch = vi.fn().mockRejectedValueOnce(error);

        const result = await generateWebhookCommit(
          { webhookUrl: 'https://10.0.0.1/webhook' },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe('Webhook request timed out connecting to server.');
      });

      it('masks custom webhook tokens reflected in 500 error messages', async () => {
        const rawToken = 'super-secret-custom-webhook-bearer-key';
        globalThis.fetch = vi.fn().mockResolvedValueOnce(
          createMockResponse(`Error: provided token ${rawToken} failed verification`, { status: 500 })
        );

        const result = await generateWebhookCommit(
          { webhookUrl: 'https://example.com/webhook', webhookToken: rawToken },
          mockRepoContext,
          mockDiffData
        );
        expect(result.success).toBe(false);
        expect(result.error).not.toContain(rawToken);
        expect(result.error).toContain('[REDACTED]');
      });
    });
  });
});
