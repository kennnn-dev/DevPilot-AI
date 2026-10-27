/**
 * Google Gemini REST API Client.
 * Communicates with generativelanguage.googleapis.com using x-goog-api-key header authentication.
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

export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';

/**
 * Resolves Gemini configuration merging options with environment defaults.
 */
export function resolveGeminiConfig(options?: Partial<GenerateCommitOptions>): {
  apiKey: string;
  model: string;
  baseUrl: string;
} {
  const apiKey =
    (options?.geminiApiKey && options.geminiApiKey.trim()) ||
    process.env.DEVPILOT_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    '';

  const rawModel =
    (options?.geminiModel && options.geminiModel.trim()) ||
    process.env.DEVPILOT_GEMINI_MODEL ||
    process.env.GEMINI_MODEL ||
    DEFAULT_GEMINI_MODEL;

  // Normalize model name (remove 'models/' prefix if supplied)
  const model = rawModel.replace(/^models\//, '');
  const baseUrl = DEFAULT_GEMINI_BASE_URL;

  return { apiKey, model, baseUrl };
}

/**
 * Generates Conventional Commit message using Google Gemini REST API.
 */
export async function generateGeminiCommit(
  options: Partial<GenerateCommitOptions>,
  repoContext: WebhookRepositoryContext,
  diffData: GitAllStagedDiffResult
): Promise<IPCResult<GeneratedCommitResult>> {
  const { apiKey, model, baseUrl } = resolveGeminiConfig(options);

  if (!apiKey) {
    return {
      success: false,
      error: 'Google Gemini API key is not configured. Please set your API key in Settings or define DEVPILOT_GEMINI_API_KEY in .env.',
    };
  }

  const endpoint = `${baseUrl}/models/${model}:generateContent`;
  const userPrompt = buildUserPrompt(repoContext, diffData, options.customPrompt);

  const payload = {
    systemInstruction: {
      parts: [{ text: CONVENTIONAL_COMMIT_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 500,
    },
  };

  try {
    const response = await executeFetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
      'Gemini',
      30000
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 400 || response.status === 403) {
        if (errText.includes('PERMISSION_DENIED') && !errText.includes('API_KEY_INVALID')) {
          return {
            success: false,
            error: 'Gemini API access denied. Please ensure the Generative Language API is enabled in your Google Cloud / AI Studio project.',
          };
        }
        return {
          success: false,
          error: 'Google Gemini API key is invalid or unauthorized. Please check your API key in Settings.',
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          error: `Google Gemini model '${model}' not found for API version v1beta.`,
        };
      }
      if (response.status === 429) {
        return {
          success: false,
          error: 'Google Gemini rate limit or quota exceeded. Please wait a moment or check your AI Studio quota.',
        };
      }

      return {
        success: false,
        error: sanitizeErrorMessage(`Gemini returned HTTP ${response.status}: ${errText.slice(0, 150)}`, apiKey),
      };
    }

    const resJson = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    if (resJson?.candidates?.[0]?.finishReason === 'SAFETY') {
      return {
        success: false,
        error: 'Gemini response blocked by content safety filters.',
      };
    }

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
