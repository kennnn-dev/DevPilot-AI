/**
 * OpenAI Cloud REST API Client.
 * Communicates with /v1/chat/completions with Bearer authentication and secret masking.
 */

import {
  CONVENTIONAL_COMMIT_SYSTEM_PROMPT,
  buildUserPrompt,
  extractCommitText,
  parseConventionalCommit,
} from './promptBuilder';
import { executeFetchWithTimeout, sanitizeErrorMessage } from './aiUtils';
import type {
  GenerateCommitOptions,
  GeneratedCommitResult,
  GitAllStagedDiffResult,
  IPCResult,
  WebhookRepositoryContext,
} from '../../../shared/types';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

/**
 * Resolves OpenAI configuration merging options with environment defaults.
 */
export function resolveOpenAIConfig(options?: Partial<GenerateCommitOptions>): {
  apiKey: string;
  model: string;
  baseUrl: string;
} {
  let rawKey =
    (options?.openaiApiKey && options.openaiApiKey.trim()) ||
    process.env.DEVPILOT_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';

  // Strip redundant leading "Bearer " prefix and whitespace
  const apiKey = rawKey.replace(/^Bearer\s+/i, '').trim();

  const model =
    (options?.openaiModel && options.openaiModel.trim()) ||
    process.env.DEVPILOT_OPENAI_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_OPENAI_MODEL;

  let baseUrl =
    (options?.openaiBaseUrl && options.openaiBaseUrl.trim()) ||
    process.env.DEVPILOT_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    DEFAULT_OPENAI_BASE_URL;

  baseUrl = baseUrl.trim().replace(/\/+$/, '');

  return { apiKey, model, baseUrl };
}

/**
 * Generates Conventional Commit message using OpenAI Chat Completions API.
 */
export async function generateOpenAICommit(
  options: Partial<GenerateCommitOptions>,
  repoContext: WebhookRepositoryContext,
  diffData: GitAllStagedDiffResult
): Promise<IPCResult<GeneratedCommitResult>> {
  const { apiKey, model, baseUrl } = resolveOpenAIConfig(options);

  if (!apiKey) {
    return {
      success: false,
      error: 'OpenAI API key is not configured. Please set your API key in Settings or define DEVPILOT_OPENAI_API_KEY in .env.',
    };
  }

  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const userPrompt = buildUserPrompt(repoContext, diffData, options.customPrompt);

  const payload = {
    model,
    messages: [
      { role: 'system', content: CONVENTIONAL_COMMIT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 500,
  };

  try {
    const response = await executeFetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
      'OpenAI',
      30000
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 401) {
        return {
          success: false,
          error: 'Invalid OpenAI API key. Please check and update your API key in Settings.',
        };
      }
      if (response.status === 429) {
        return {
          success: false,
          error: 'OpenAI quota or rate limit exceeded. Please check your OpenAI billing plan and account limits.',
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          error: `OpenAI model '${model}' not found or your API key does not have access to it.`,
        };
      }
      if (response.status === 400 && errText.toLowerCase().includes('context_length')) {
        return {
          success: false,
          error: "Staged diff exceeds the OpenAI model's maximum context length. Try staging fewer changes.",
        };
      }

      return {
        success: false,
        error: sanitizeErrorMessage(`OpenAI returned HTTP ${response.status}: ${errText.slice(0, 150)}`, apiKey),
      };
    }

    const resJson = await response.json();
    const commitMessage = extractCommitText(resJson);
    const parsed = parseConventionalCommit(commitMessage);

    return {
      success: true,
      data: {
        commitMessage,
        parsed,
        rawResponse: resJson,
      },
    };
  } catch (err: unknown) {
    const msg = (err as Error)?.message || String(err);
    return {
      success: false,
      error: sanitizeErrorMessage(msg, apiKey),
    };
  }
}
