/**
 * Workspace Review & Impact Analysis Service for DevPilot AI.
 * Orchestrates multi-repo scanning, prompt formulation (Non-Dev vs Technical),
 * and multi-provider AI dispatch.
 */

import { executeGit } from '../../git/executor';
import { parseStatusOutput } from '../../git/statusParser';
import { getAllStagedDiff } from '../../git/diffService';
import { validateGitRepository } from '../../git/repoValidator';
import {
  extractChangeContext,
  resolveRepoName,
  scanWorkspaceSiblingRepos,
} from './workspaceScanner';
import {
  buildWorkspaceReviewSystemPrompt,
  buildWorkspaceReviewUserPrompt,
  parseWorkspaceReviewResponse,
} from '../ai/promptBuilder';
import { resolveActiveProvider } from '../ai/aiService';
import { resolveOllamaConfig } from '../ai/ollamaClient';
import { resolveOpenAIConfig } from '../ai/openaiClient';
import { resolveGeminiConfig } from '../ai/geminiClient';
import { getEnvWebhookUrl, getEnvWebhookToken } from '../ai/webhookClient';
import { executeFetchWithTimeout, sanitizeErrorMessage } from '../ai/aiUtils';
import type {
  GitAllStagedDiffResult,
  IPCResult,
  ReviewAudienceMode,
  SiblingRepoImpact,
  WorkspaceReviewOptions,
  WorkspaceReviewResult,
} from '../../../shared/types';

/**
 * Retrieves comprehensive changes (staged or unstaged working tree) for review analysis.
 */
export async function getRepoChangesForReview(
  repoPath: string
): Promise<GitAllStagedDiffResult> {
  const cleanRepo = repoPath.trim();
  const stagedResult = await getAllStagedDiff({ repoPath: cleanRepo });

  if (!stagedResult.isEmpty && stagedResult.stagedFiles.length > 0) {
    return stagedResult;
  }

  // Fallback to unstaged and untracked changes if no files are staged yet
  const statusExec = await executeGit(['status', '--porcelain=v1', '-z', '-uall'], {
    cwd: cleanRepo,
  });
  const parsedStatus = parseStatusOutput(statusExec.stdout);
  const activeChanges = [
    ...parsedStatus.staged,
    ...parsedStatus.unstaged,
    ...parsedStatus.untracked,
  ];

  if (activeChanges.length === 0) {
    return stagedResult;
  }

  const unstagedDiffExec = await executeGit(['diff', '-M'], { cwd: cleanRepo });
  const rawDiff = unstagedDiffExec.stdout;

  let insertions = 0;
  let deletions = 0;
  for (const line of rawDiff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) insertions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  return {
    repoPath: cleanRepo,
    rawDiff,
    stagedFiles: activeChanges,
    summary: {
      filesChanged: activeChanges.length,
      insertions,
      deletions,
    },
    isEmpty: false,
  };
}

/**
 * Dispatches the review prompt to the configured AI provider and extracts the raw response string.
 */
async function dispatchReviewToProvider(
  provider: string,
  options: WorkspaceReviewOptions,
  systemPrompt: string,
  userPrompt: string,
  baselineImpacts: SiblingRepoImpact[],
  diffData: GitAllStagedDiffResult,
  activeRepoName: string
): Promise<string> {
  if (provider === 'ollama') {
    const { baseUrl, model } = resolveOllamaConfig(options as any);
    const endpoint = `${baseUrl}/api/chat`;
    const response = await executeFetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          options: { temperature: 0.2 },
        }),
      },
      'Ollama',
      30000
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama error (${response.status}): ${errText.slice(0, 150)}`);
    }

    const resJson = await response.json();
    return resJson.message?.content || resJson.response || '';
  }

  if (provider === 'openai') {
    const { apiKey, model, baseUrl } = resolveOpenAIConfig(options as any);
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is not configured. Please set your API key in Settings or define DEVPILOT_OPENAI_API_KEY in .env.'
      );
    }
    const endpoint = `${baseUrl}/chat/completions`;
    const response = await executeFetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      },
      'OpenAI',
      30000
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI error (${response.status}): ${errText.slice(0, 150)}`);
    }

    const resJson = await response.json();
    return resJson.choices?.[0]?.message?.content || '';
  }

  if (provider === 'gemini') {
    const { apiKey, model, baseUrl } = resolveGeminiConfig(options as any);
    if (!apiKey) {
      throw new Error(
        'Google Gemini API key is not configured. Please set your API key in Settings or define DEVPILOT_GEMINI_API_KEY in .env.'
      );
    }
    const endpoint = `${baseUrl}/models/${model}:generateContent`;
    const response = await executeFetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
        }),
      },
      'Gemini',
      30000
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini error (${response.status}): ${errText.slice(0, 150)}`);
    }

    const resJson = await response.json();
    return resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Webhook provider fallback
  const rawUrl = options.webhookUrl || getEnvWebhookUrl();
  const token = options.webhookToken || getEnvWebhookToken();

  if (!rawUrl) {
    throw new Error(
      'Webhook URL is not configured. Please set the endpoint in Settings or define DEVPILOT_WEBHOOK_URL in .env.'
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-API-Key'] = token;
  }

  const payload = {
    action: 'workspace_review',
    mode: options.mode || 'plain',
    activeRepo: {
      path: options.activeRepoPath,
      name: activeRepoName,
    },
    siblingImpacts: baselineImpacts,
    diffSummary: diffData.summary,
    changedFiles: diffData.stagedFiles,
    diff: diffData.rawDiff,
    customPrompt: options.customPrompt,
    prompt: userPrompt,
    systemPrompt,
  };

  const response = await executeFetchWithTimeout(
    rawUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    'Webhook',
    30000
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Webhook error (${response.status}): ${errText.slice(0, 150)}`);
  }

  const resText = await response.text();
  try {
    const resJson = JSON.parse(resText);
    return resJson.review || resJson.message || resJson.response || resText;
  } catch {
    return resText;
  }
}

/**
 * Executes a full Workspace Review and Cross-Repository Impact Analysis.
 */
export async function reviewWorkspaceChanges(
  options: WorkspaceReviewOptions
): Promise<IPCResult<WorkspaceReviewResult>> {
  if (!options || typeof options !== 'object') {
    return { success: false, error: 'Options must be an object.' };
  }

  const activeRepoPath = (options.activeRepoPath || '').trim();
  if (!activeRepoPath) {
    return { success: false, error: 'Active repository path must be provided.' };
  }

  // 1. Validate active repository
  const validation = await validateGitRepository(activeRepoPath);
  if (!validation.isGitRepo) {
    return { success: false, error: validation.error || 'Not a valid Git repository.' };
  }

  try {
    // 2. Query changes in active repo
    const diffData = await getRepoChangesForReview(activeRepoPath);
    if (diffData.isEmpty || diffData.stagedFiles.length === 0) {
      return {
        success: false,
        error: 'No changes found in repository to review. Working tree is clean.',
      };
    }

    const activeRepoName = await resolveRepoName(activeRepoPath);
    const mode: ReviewAudienceMode = options.mode === 'technical' ? 'technical' : 'plain';

    // 3. Scan sibling repositories in workspace
    const changeContext = extractChangeContext(diffData.rawDiff, diffData.stagedFiles);
    const baselineImpacts = await scanWorkspaceSiblingRepos(
      activeRepoPath,
      options.workspaceRepoPaths || [],
      changeContext
    );

    // 4. Formulate prompts
    const systemPrompt = buildWorkspaceReviewSystemPrompt(mode);
    const userPrompt = buildWorkspaceReviewUserPrompt(
      activeRepoPath,
      activeRepoName,
      baselineImpacts,
      diffData,
      mode,
      options.customPrompt
    );

    // 5. Dispatch to configured AI provider
    const provider = resolveActiveProvider(options as any);
    const rawResponse = await dispatchReviewToProvider(
      provider,
      options,
      systemPrompt,
      userPrompt,
      baselineImpacts,
      diffData,
      activeRepoName
    );

    // 6. Parse structured result
    const reviewResult = parseWorkspaceReviewResponse(
      rawResponse,
      activeRepoPath,
      activeRepoName,
      baselineImpacts,
      mode
    );

    return {
      success: true,
      data: reviewResult,
    };
  } catch (err: unknown) {
    const rawMsg = (err as Error)?.message || String(err);
    return {
      success: false,
      error: sanitizeErrorMessage(rawMsg),
    };
  }
}
