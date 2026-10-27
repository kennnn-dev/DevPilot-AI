/**
 * Local Ollama AI Client.
 * Communicates with local Ollama REST API (/api/chat, /api/generate) with offline detection.
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

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'llama3.2';

/**
 * Resolves Ollama configuration merging options with environment defaults.
 */
export function resolveOllamaConfig(options?: Partial<GenerateCommitOptions>): { baseUrl: string; model: string } {
  let baseUrl =
    (options?.ollamaBaseUrl && options.ollamaBaseUrl.trim()) ||
    process.env.DEVPILOT_OLLAMA_URL ||
    process.env.OLLAMA_HOST ||
    process.env.OLLAMA_BASE_URL ||
    DEFAULT_OLLAMA_BASE_URL;

  baseUrl = baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `http://${baseUrl}`;
  }

  const model =
    (options?.ollamaModel && options.ollamaModel.trim()) ||
    process.env.DEVPILOT_OLLAMA_MODEL ||
    process.env.OLLAMA_MODEL ||
    DEFAULT_OLLAMA_MODEL;

  return { baseUrl, model };
}

/**
 * Generates Conventional Commit message using local Ollama daemon.
 */
export async function generateOllamaCommit(
  options: Partial<GenerateCommitOptions>,
  repoContext: WebhookRepositoryContext,
  diffData: GitAllStagedDiffResult
): Promise<IPCResult<GeneratedCommitResult>> {
  const { baseUrl, model } = resolveOllamaConfig(options);
  const endpoint = `${baseUrl}/api/chat`;

  const userPrompt = buildUserPrompt(repoContext, diffData, options.customPrompt);
  const payload = {
    model,
    messages: [
      { role: 'system', content: CONVENTIONAL_COMMIT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    options: {
      temperature: 0.2,
    },
  };

  try {
    const response = await executeFetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
      'Ollama',
      30000
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 404) {
        return {
          success: false,
          error: `Ollama model '${model}' not found. Run 'ollama pull ${model}' in your terminal to download it.`,
        };
      }
      if (response.status === 400) {
        return {
          success: false,
          error: `Ollama request failed: model name is required or invalid (${errText.slice(0, 100)}).`,
        };
      }
      const preview = errText.trim() ? `: ${errText.trim().slice(0, 150)}` : '';
      return {
        success: false,
        error: `Ollama returned HTTP ${response.status}${preview}`,
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
    const errorObj = err as { code?: string; message?: string; cause?: { code?: string } };
    const code = errorObj?.code || errorObj?.cause?.code;
    const msg = errorObj?.message || String(err);

    if (
      code === 'ECONNREFUSED' ||
      msg.includes('ECONNREFUSED') ||
      msg.toLowerCase().includes('connection refused')
    ) {
      return {
        success: false,
        error: `Local Ollama is offline or unreachable at ${baseUrl}. Please ensure Ollama is running ('ollama serve').`,
      };
    }

    return {
      success: false,
      error: sanitizeErrorMessage(msg),
    };
  }
}
