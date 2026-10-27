/**
 * Central AI Service Coordinator for DevPilot AI.
 * Orchestrates Git diff queries, provider resolution, and AI client dispatch.
 */

import { gitService } from '../../git/gitService';
import { generateWebhookCommit, getEnvWebhookToken, getEnvWebhookUrl } from './webhookClient';
import { generateOllamaCommit, resolveOllamaConfig } from './ollamaClient';
import { generateOpenAICommit, resolveOpenAIConfig } from './openaiClient';
import { generateGeminiCommit, resolveGeminiConfig } from './geminiClient';
import { sanitizeErrorMessage } from './aiUtils';
import type {
  AIProvider,
  GenerateCommitOptions,
  GeneratedCommitResult,
  IPCResult,
  ResolvedAIConfig,
  WebhookRepositoryContext,
} from '../../../shared/types';

/**
 * Resolves the active AI provider based on options override or environment configuration.
 */
export function resolveActiveProvider(options?: GenerateCommitOptions): AIProvider {
  if (options?.provider) {
    return options.provider;
  }
  const envProvider = (process.env.DEVPILOT_AI_PROVIDER || process.env.AI_PROVIDER || '').toLowerCase().trim();
  if (envProvider === 'ollama' || envProvider === 'openai' || envProvider === 'gemini' || envProvider === 'webhook') {
    return envProvider as AIProvider;
  }
  return 'webhook';
}

/**
 * Resolves configuration across all AI providers merging environment defaults with safe secret masking.
 */
export function getResolvedAIConfig(): IPCResult<ResolvedAIConfig> {
  const envWebhookUrl = getEnvWebhookUrl();
  const envWebhookToken = getEnvWebhookToken();
  const ollama = resolveOllamaConfig({});
  const openai = resolveOpenAIConfig({});
  const gemini = resolveGeminiConfig({});
  const activeProvider = resolveActiveProvider();

  const sources = {
    webhook: envWebhookUrl ? ('env' as const) : ('none' as const),
    ollama:
      process.env.DEVPILOT_OLLAMA_URL || process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL
        ? ('env' as const)
        : ('none' as const),
    openai: openai.apiKey ? ('env' as const) : ('none' as const),
    gemini: gemini.apiKey ? ('env' as const) : ('none' as const),
  };

  return {
    success: true,
    data: {
      activeProvider,
      providerConfigs: {
        webhook: {
          webhookUrl: envWebhookUrl,
          webhookToken: envWebhookToken ? '••••••••' : '',
        },
        ollama: {
          baseUrl: ollama.baseUrl,
          model: ollama.model,
        },
        openai: {
          apiKey: openai.apiKey ? '••••••••' : '',
          model: openai.model,
          baseUrl: openai.baseUrl,
        },
        gemini: {
          apiKey: gemini.apiKey ? '••••••••' : '',
          model: gemini.model,
        },
      },
      sources,
      source: sources,
      envDefaults: {
        activeProvider,
        webhookUrl: envWebhookUrl,
        hasWebhookToken: Boolean(envWebhookToken),
        ollamaBaseUrl: ollama.baseUrl,
        ollamaModel: ollama.model,
        hasOpenAiKey: Boolean(openai.apiKey),
        openAiModel: openai.model,
        hasGeminiKey: Boolean(gemini.apiKey),
        geminiModel: gemini.model,
      },
    },
  };
}

/**
 * Main process commit message generator orchestrating Git staging check and provider dispatch.
 */
export async function generateCommitMessage(
  options: GenerateCommitOptions
): Promise<IPCResult<GeneratedCommitResult>> {
  if (!options || typeof options !== 'object') {
    return { success: false, error: 'Options must be an object.' };
  }

  const repoPath = (options.repoPath || '').trim();
  if (!repoPath) {
    return { success: false, error: 'Repository path must be a non-empty string.' };
  }

  // Retrieve staged diff via gitService
  const diffResult = await gitService.getAllStagedDiff(repoPath);
  if (!diffResult.success || !diffResult.data) {
    return { success: false, error: diffResult.error || 'Failed to query staged diff.' };
  }

  const diffData = diffResult.data;
  if (diffData.isEmpty && diffData.stagedFiles.length === 0) {
    return { success: false, error: 'No staged changes found in repository.' };
  }

  // Retrieve branch & status context
  const statusResult = await gitService.getStatus(repoPath);
  const branch = statusResult.data?.branch || 'main';
  const isDetached = statusResult.data?.isDetached || false;
  const repoContext: WebhookRepositoryContext = { repoPath, branch, isDetached };

  const provider = resolveActiveProvider(options);

  try {
    let result: IPCResult<GeneratedCommitResult>;
    switch (provider) {
      case 'webhook':
        result = await generateWebhookCommit(options, repoContext, diffData);
        break;
      case 'ollama':
        result = await generateOllamaCommit(options, repoContext, diffData);
        break;
      case 'openai':
        result = await generateOpenAICommit(options, repoContext, diffData);
        break;
      case 'gemini':
        result = await generateGeminiCommit(options, repoContext, diffData);
        break;
      default:
        result = { success: false, error: `Unsupported AI provider: ${String(provider)}` };
        break;
    }

    if (!result.success && result.error) {
      result.error = sanitizeErrorMessage(result.error);
    }
    return result;
  } catch (err: unknown) {
    const rawMsg = (err as Error)?.message || String(err);
    return { success: false, error: sanitizeErrorMessage(rawMsg) };
  }
}

export const aiService = {
  generateCommitMessage,
  getResolvedAIConfig,
  resolveActiveProvider,
};
