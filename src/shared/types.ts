/**
 * Shared Type Definitions for DevPilot AI.
 * Strict interface contracts shared across Electron Main, Preload bridge, and React Renderer.
 */

/**
 * A user-defined workspace grouping multiple local Git repositories.
 */
export interface Workspace {
  /** Unique workspace identifier */
  id: string;
  /** Human-readable workspace name */
  name: string;
  /** Timestamp when created */
  createdAt: number;
  /** List of absolute directory paths to Git repositories in this workspace */
  repoPaths: string[];
}

/**
 * Valid Git file change categories as defined in PROJECT.md.
 */
export type GitFileChangeType =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked';

/**
 * Status information for a single file in the Git repository.
 */
export interface GitFileStatus {
  /** Relative path of the file from repository root */
  path: string;
  /** Original path if the file was renamed or copied */
  oldPath?: string;
  /** High-level categorized change type */
  changeType: GitFileChangeType;
  /** Raw 2-character porcelain status code (e.g. 'M ', ' M', '??', 'A ') */
  statusCode: string;
}

/**
 * Comprehensive working tree status of a repository.
 */
export interface GitStatusResult {
  /** Absolute path to the opened repository */
  repoPath: string;
  /** Current branch name (e.g. 'main', or short SHA if detached) */
  branch: string;
  /** Whether repository is in a detached HEAD state */
  isDetached: boolean;
  /** Files with staged changes (ready to commit) */
  staged: GitFileStatus[];
  /** Files with unstaged changes in the working tree */
  unstaged: GitFileStatus[];
  /** Untracked files */
  untracked: GitFileStatus[];
}

/**
 * A single line within a unified diff hunk.
 */
export interface GitDiffHunkLine {
  /** Line type: added line, deleted line, context line, or hunk metadata */
  type: 'add' | 'delete' | 'context' | 'meta';
  /** Verbatim line text content */
  content: string;
  /** Line number in the original (old) file */
  oldLineNumber?: number;
  /** Line number in the modified (new) file */
  newLineNumber?: number;
}

/**
 * A unified diff hunk representation (e.g., @@ -1,5 +1,6 @@).
 */
export interface GitDiffHunk {
  /** Hunk header string */
  header: string;
  /** Starting line number in old file */
  oldStart: number;
  /** Line count in old file */
  oldLines: number;
  /** Starting line number in new file */
  newStart: number;
  /** Line count in new file */
  newLines: number;
  /** Parsed lines within this hunk */
  lines: GitDiffHunkLine[];
}

/**
 * Structured result of querying a staged file diff.
 */
export interface GitDiffResult {
  /** Absolute path to the repository */
  repoPath: string;
  /** Relative file path */
  filePath: string;
  /** Raw unified diff output from git diff --staged */
  rawDiff: string;
  /** Indicates whether Git treated this file as binary */
  isBinary: boolean;
  /** Indicates whether the diff is empty (0 modifications or 0-byte added file) */
  isEmpty: boolean;
  /** Parsed diff hunks for syntax-highlighted rendering */
  hunks: GitDiffHunk[];
}

/**
 * Standardized IPC response wrapper for all asynchronous operations.
 */
export interface IPCResult<T> {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Payload returned on success */
  data?: T;
  /** Human-readable error message on failure */
  error?: string;
}

/**
 * Payload parameter for git:get-staged-diff IPC requests.
 */
export interface GetStagedDiffParams {
  repoPath: string;
  filePath: string;
  oldPath?: string;
  scope?: 'staged' | 'unstaged' | 'untracked';
}

/**
 * Repository context information sent to the webhook.
 */
export interface WebhookRepositoryContext {
  repoPath: string;
  branch: string;
  isDetached: boolean;
}

/**
 * Representation of a staged file sent to the webhook.
 */
export interface WebhookStagedFile {
  path: string;
  oldPath?: string;
  changeType: GitFileChangeType;
  statusCode: string;
}

/**
 * Summary metrics of staged changes.
 */
export interface WebhookDiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export type ConfigSource = 'user' | 'env' | 'none';

/**
 * Supported AI provider backends for commit message generation.
 */
export type AIProvider = 'webhook' | 'ollama' | 'openai' | 'gemini';

export const AI_PROVIDERS: readonly AIProvider[] = [
  'webhook',
  'ollama',
  'openai',
  'gemini',
] as const;

/**
 * Configuration options for generic / n8n HTTP webhooks.
 */
export interface WebhookConfig {
  webhookUrl: string;
  webhookToken?: string;
}

/**
 * Configuration options for Local Ollama daemon.
 */
export interface OllamaConfig {
  baseUrl: string; // Defaults to 'http://localhost:11434'
  model: string;   // Defaults to 'llama3.2'
}

/**
 * Configuration options for OpenAI Chat Completions API.
 */
export interface OpenAIConfig {
  apiKey: string;
  model: string;   // Defaults to 'gpt-4o-mini'
  baseUrl?: string; // Optional custom endpoint, defaults to 'https://api.openai.com/v1'
}

/**
 * Configuration options for Google Gemini REST API.
 */
export interface GeminiConfig {
  apiKey: string;
  model: string;   // Defaults to 'gemini-1.5-flash'
}

/**
 * Unified user settings stored in client localStorage.
 * Maintains independent configuration per provider.
 */
export interface AISettings {
  activeProvider: AIProvider;
  webhook: WebhookConfig;
  ollama: OllamaConfig;
  openai: OpenAIConfig;
  gemini: GeminiConfig;
}

/**
 * Complete resolved AI configuration merging user settings with environment defaults.
 */
export interface ResolvedAIConfig {
  activeProvider: AIProvider;
  providerConfigs: {
    webhook: WebhookConfig;
    ollama: OllamaConfig;
    openai: OpenAIConfig;
    gemini: GeminiConfig;
  };
  sources: Record<AIProvider, ConfigSource>;
  source?: Record<AIProvider, ConfigSource>; // Backward-compatible alias
  envDefaults: {
    activeProvider?: AIProvider;
    webhookUrl?: string;
    hasWebhookToken?: boolean;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
    hasOpenAiKey?: boolean;
    openAiModel?: string;
    hasGeminiKey?: boolean;
    geminiModel?: string;
  };
}

/**
 * Snapshot of environment variable defaults detected by the Main process.
 */
export interface WebhookConfigDefaults {
  envWebhookUrl: string;
  hasEnvToken: boolean;
  activeSource?: ConfigSource;
}

/**
 * Resolved webhook configuration payload returned across Electron IPC.
 */
export interface ResolvedWebhookConfig {
  webhookUrl: string;
  webhookToken?: string;
  source: ConfigSource;
  envDefaults: {
    webhookUrl: string;
    hasToken: boolean;
  };
  url?: string;
  token?: string;
}

/**
 * Complete structured payload dispatched to the n8n webhook.
 */
export interface WebhookCommitPayload {
  repository: WebhookRepositoryContext;
  repoPath?: string;
  branch?: string;
  isDetached?: boolean;
  stagedFiles: WebhookStagedFile[];
  diffSummary: WebhookDiffSummary;
  diff: string;
  stagedDiff?: string;
  customPrompt?: string;
}

/**
 * Combined diff and status result for all staged changes in a repository.
 */
export interface GitAllStagedDiffResult {
  repoPath: string;
  rawDiff: string;
  stagedFiles: GitFileStatus[];
  summary: WebhookDiffSummary;
  isEmpty: boolean;
}

/**
 * Alias for GitAllStagedDiffResult matching PROJECT.md interface contract.
 */
export type AllStagedDiffResult = GitAllStagedDiffResult;

/**
 * Options provided when requesting commit message generation across any provider.
 */
export interface GenerateCommitOptions {
  repoPath: string;
  provider?: AIProvider;
  // Webhook-specific overrides
  webhookUrl?: string;
  webhookToken?: string;
  // Ollama-specific overrides
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  // OpenAI-specific overrides
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
  // Gemini-specific overrides
  geminiApiKey?: string;
  geminiModel?: string;
  // Common prompt override / user instructions
  customPrompt?: string;
}

/**
 * Backward compatibility alias for legacy webhook callers.
 */
export type WebhookGenerateCommitOptions = GenerateCommitOptions;

/**
 * Structured Conventional Commit parsed conforming to specification v1.0.0.
 */
export interface ParsedConventionalCommit {
  raw: string;
  type: string;
  scope?: string;
  isBreaking: boolean;
  subject: string;
  body?: string;
  isValid: boolean;
}

/**
 * Final result returned from commit message generation.
 */
export interface GeneratedCommitResult {
  commitMessage: string;
  parsed: ParsedConventionalCommit;
  rawResponse?: unknown;
}

/**
 * Backward compatibility alias matching PROJECT.md interface contract.
 */
export type GenerateCommitResult = GeneratedCommitResult;

/**
 * Safe, read-only API exposed to the Renderer window via Preload contextBridge.
 */
export interface DevPilotAPI {
  /**
   * Prompts the native OS directory selection dialog.
   * @returns Absolute path of selected directory, or null if canceled.
   */
  openDirectory: () => Promise<string | null>;

  /**
   * Queries real Git repository working tree status.
   * @param repoPath Absolute path to repository
   */
  getStatus: (repoPath: string) => Promise<IPCResult<GitStatusResult>>;

  /**
   * Queries real staged or file diff for a specific file.
   * @param repoPath Absolute path to repository
   * @param filePath Relative path to file
   * @param oldPath Optional old path if file was renamed
   * @param scope Optional diff scope: staged, unstaged, or untracked
   */
  getStagedDiff: (
    repoPath: string,
    filePath: string,
    oldPath?: string,
    scope?: 'staged' | 'unstaged' | 'untracked'
  ) => Promise<IPCResult<GitDiffResult>>;

  /**
   * Retrieves complete unified diff and status for all staged files in the repository.
   * @param repoPath Absolute path to repository
   */
  getAllStagedDiff: (repoPath: string) => Promise<IPCResult<GitAllStagedDiffResult>>;

  /**
   * Dispatches staged changes to an AI provider or webhook endpoint to generate a Conventional Commit message.
   * @param options Target repository and provider configuration
   */
  generateCommitMessage: (options: GenerateCommitOptions) => Promise<IPCResult<GeneratedCommitResult>>;

  /**
   * Queries environment-configured webhook defaults and active resolution from Main process.
   */
  getWebhookConfig?: () => Promise<IPCResult<ResolvedWebhookConfig>>;

  /**
   * Queries multi-provider AI configuration and environment defaults from Main process.
   */
  getAIConfig?: () => Promise<IPCResult<ResolvedAIConfig>>;
}

/**
 * Global Window interface augmentation for typed Electron Preload bridge.
 */
declare global {
  interface Window {
    devPilot: DevPilotAPI;
  }
}

