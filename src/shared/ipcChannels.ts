/**
 * Safe, Read-Only IPC Channel Constants for DevPilot AI.
 * Used across Main Process handlers and Preload contextBridge invocation.
 */

export const IPC_CHANNELS = {
  /**
   * Opens the OS native directory picker dialog.
   * Main handler: dialog.showOpenDialog({ properties: ['openDirectory'] })
   * Payload: none
   * Return: string | null
   */
  DIALOG_OPEN_DIRECTORY: 'dialog:open-directory',

  /**
   * Inspects repository status, active branch, and changed files.
   * Main handler: queries git rev-parse and git status --porcelain=v1 -z -uall
   * Payload: repoPath (string)
   * Return: IPCResult<GitStatusResult>
   */
  GIT_GET_STATUS: 'git:get-status',

  /**
   * Inspects staged diff for a specific file.
   * Main handler: queries git diff --staged -M -- <path>
   * Payload: GetStagedDiffParams ({ repoPath: string, filePath: string, oldPath?: string })
   * Return: IPCResult<GitDiffResult>
   */
  GIT_GET_STAGED_DIFF: 'git:get-staged-diff',

  /**
   * Retrieves complete unified diff and status for all staged files in the repository.
   * Main handler: queries git diff --staged -M and git status --porcelain=v1 -z -uall
   * Payload: repoPath (string)
   * Return: IPCResult<GitAllStagedDiffResult>
   */
  GIT_GET_ALL_STAGED_DIFF: 'git:get-all-staged-diff',

  /**
   * Dispatches staged changes to an n8n webhook endpoint to generate Conventional Commit.
   * Main handler: handleWebhookGenerateCommit(options)
   * Payload: WebhookGenerateCommitOptions
   * Return: IPCResult<GeneratedCommitResult>
   */
  WEBHOOK_GENERATE_COMMIT: 'webhook:generate-commit',

  /**
   * Queries environment-configured webhook defaults (DEVPILOT_WEBHOOK_URL, DEVPILOT_WEBHOOK_TOKEN).
   * Main handler: handleGetWebhookConfig()
   * Payload: none
   * Return: IPCResult<ResolvedWebhookConfig>
   */
  SETTINGS_GET_WEBHOOK_CONFIG: 'settings:get-webhook-config',
  GET_WEBHOOK_CONFIG: 'settings:get-webhook-config',

  /**
   * Dispatches staged changes to active AI provider (Ollama, OpenAI, Gemini, Webhook) to generate Conventional Commit.
   * Main handler: aiService.generateCommitMessage(options)
   * Payload: GenerateCommitOptions
   * Return: IPCResult<GeneratedCommitResult>
   */
  AI_GENERATE_COMMIT: 'ai:generate-commit',

  /**
   * Queries environment-configured multi-provider defaults across Ollama, OpenAI, Gemini, Webhook.
   * Main handler: handleGetAIConfig()
   * Payload: none
   * Return: IPCResult<ResolvedAIConfig>
   */
  SETTINGS_GET_AI_CONFIG: 'settings:get-ai-config',
  GET_AI_CONFIG: 'settings:get-ai-config',

  /**
   * Analyzes active repository changes for cross-repository workspace impact and plain-English review.
   * Main handler: aiService.reviewWorkspace(options)
   * Payload: WorkspaceReviewOptions
   * Return: IPCResult<WorkspaceReviewResult>
   */
  AI_REVIEW_WORKSPACE: 'ai:review-workspace',
  REVIEW_WORKSPACE: 'ai:review-workspace',

  /**
   * Opens the OS native terminal emulator at the specified directory path.
   * Main handler: terminalLauncher.openTerminal(targetPath)
   * Payload: targetPath (string)
   * Return: IPCResult<boolean>
   */
  SYSTEM_OPEN_TERMINAL: 'system:open-terminal',
  OPEN_TERMINAL: 'system:open-terminal',

  /**
   * Universal Workspace Services & Automation channels.
   */
  SERVICES_DISCOVER: 'services:discover',
  SERVICES_START: 'services:start',
  SERVICES_STOP: 'services:stop',
  SERVICES_RESTART: 'services:restart',
  SERVICES_START_ALL: 'services:start-all',
  SERVICES_STOP_ALL: 'services:stop-all',
  SERVICES_GET_LOGS: 'services:get-logs',
  SERVICES_CLEAR_LOGS: 'services:clear-logs',
  SERVICES_UPDATE_CONFIG: 'services:update-config',

  // Convenience aliases matching shorthand conventions
  OPEN_DIRECTORY: 'dialog:open-directory',
  GET_STATUS: 'git:get-status',
  GET_STAGED_DIFF: 'git:get-staged-diff',
  GET_ALL_STAGED_DIFF: 'git:get-all-staged-diff',
  GENERATE_COMMIT: 'webhook:generate-commit',
  GET_CONFIG: 'settings:get-webhook-config',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
