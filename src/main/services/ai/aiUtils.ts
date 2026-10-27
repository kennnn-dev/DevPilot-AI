/**
 * Secret Masking & Safe Network Dispatch Utilities for DevPilot AI.
 */

/**
 * Sanitizes sensitive API tokens, keys, and authorization headers from error messages and logs.
 * Redacts OpenAI keys (sk-...), Gemini keys (AIza...), Bearer tokens, and URL query secrets.
 */
export function sanitizeErrorMessage(message: unknown, ...extraSecrets: (string | undefined)[]): string {
  if (message === null || message === undefined) {
    return '';
  }
  const str = typeof message === 'string' ? message : String(message);
  if (!str) {
    return '';
  }

  let sanitized = str
    // Mask URL query string secrets (?key=..., &token=..., &apiKey=..., etc.)
    .replace(/([?&](?:key|token|api_key|apiKey)=)[^&#\s"'\`<>)}\]]+/gi, '$1[REDACTED]')
    // Mask OpenAI standard and project keys (sk-...)
    .replace(/sk-[a-zA-Z0-9_\-]{20,}/gi, '[REDACTED_OPENAI_KEY]')
    // Mask Google Gemini keys (AIza...)
    .replace(/AIza[a-zA-Z0-9_\-]{30,}/gi, '[REDACTED_GEMINI_KEY]')
    // Mask Authorization Bearer tokens (excluding the literal English words 'token' or already redacted placeholders)
    .replace(/Bearer\s+(?!token\b|\[REDACTED)[a-zA-Z0-9._\-]+/gi, 'Bearer [REDACTED_TOKEN]');

  // Redact any explicitly passed secret parameters
  for (const secret of extraSecrets) {
    if (secret && typeof secret === 'string' && secret.trim().length >= 4) {
      const trimmed = secret.trim();
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitized = sanitized.replace(new RegExp(escaped, 'gi'), '[REDACTED]');
    }
  }

  return sanitized;
}

/**
 * Executes a network fetch with guaranteed AbortController timeout and clearTimeout cleanup.
 *
 * @param url Target endpoint URL
 * @param options Fetch RequestInit options
 * @param providerLabel Display label for provider in timeout error (e.g. 'Ollama', 'OpenAI', 'Gemini', 'Webhook')
 * @param timeoutMs Timeout duration in milliseconds (default: 30000)
 */
export async function executeFetchWithTimeout(
  url: string,
  options: RequestInit,
  providerLabel: string,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let onCallerAbort: (() => void) | undefined;
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else if (typeof options.signal.addEventListener === 'function') {
      onCallerAbort = () => controller.abort(options.signal?.reason);
      options.signal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err: unknown) {
    const errObj = err as { name?: string; message?: string };
    if (errObj?.name === 'AbortError' || controller.signal.aborted) {
      if (options.signal?.aborted) {
        throw new Error(`${providerLabel} request was cancelled.`);
      }
      throw new Error(`${providerLabel} request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (options.signal && onCallerAbort && typeof options.signal.removeEventListener === 'function') {
      options.signal.removeEventListener('abort', onCallerAbort);
    }
  }
}
