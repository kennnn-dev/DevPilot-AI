# Project: DevPilot AI

## Architecture
DevPilot AI is a desktop application built with Electron, React, TypeScript, and Vite.
It functions as a safe, read-only Git status and staged diff inspector for local repositories, with an intelligent AI commit message generator supporting Multi-Provider AI integration (Local Ollama, OpenAI, Google Gemini, and Custom Webhooks).

```
+-----------------------------------------------------------------------------------------+
|                                        Renderer                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | Header: Folder Picker | Repo Path | Branch Badge | Refresh Button | Actions       |  |
|  +-----------------------------------------------------------------------------------+  |
|  | Nav Rail: Workspaces | Settings (opens SettingsModal) | About                     |  |
|  | Sidebar: Changes List (Staged, Unstaged, Untracked)                                |  |
|  | DiffViewer: Staged Diff View (Unified diff hunks, syntax highlighting)             |  |
|  | CommitGeneratorPanel: AI Commit Assistant (Active Provider Badge & Routing)       |  |
|  +-----------------------------------------------------------------------------------+  |
|  | Overlay: SettingsModal (Dynamic Provider Selector: Webhook | Ollama | OpenAI |    |  |
|  |          Gemini, Fieldsets, Source Indicator, Independent LocalStorage Persistence)|  |
|  +-----------------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------------+
                                    ▲
                                    │ (Typed Preload Bridge via window.devPilot)
                                    ▼
+-----------------------------------------------------------------------------------------+
|                                 Electron Preload Bridge                                 |
|  - contextBridge.exposeInMainWorld('devPilot', api)                                     |
|  - contextIsolation: true, nodeIntegration: false, sandbox: true                       |
|  - Read-only Git APIs: openDirectory, getStatus, getStagedDiff, getAllStagedDiff       |
|  - AI APIs: generateCommitMessage(options), getAIConfig(), getWebhookConfig()           |
+-----------------------------------------------------------------------------------------+
                                    ▲
                                    │ (IPC Channels)
                                    ▼
+-----------------------------------------------------------------------------------------+
|                                      Main Process                                       |
|  - Security & Lifecycle: BrowserWindow with contextIsolation & production CSP           |
|    (connect-src 'none' strictly enforced; all network requests in main process)         |
|  - Env Loader: reads .env and ~/.devpilot.env at startup (Ollama, OpenAI, Gemini, etc.) |
|  - Read-Only Git IPC Handlers ('git:get-status', 'git:get-staged-diff', etc.)           |
|  - AI & Settings IPC Handlers:                                                          |
|      * 'ai:generate-commit' / 'webhook:generate-commit'                                 |
|      * 'settings:get-ai-config' / 'settings:get-webhook-config'                         |
|  - Modular AI Service Layer (`src/main/services/ai/`):                                  |
|      * AIService: routes commit requests to active provider                             |
|      * OllamaClient: Local REST API (/api/chat, http://localhost:11434, offline check) |
|      * OpenAIClient: Cloud REST API (/v1/chat/completions, Bearer auth, sanitized)      |
|      * GeminiClient: Cloud REST API (v1beta generateContent, x-goog-api-key, sanitized) |
|      * WebhookClient: Structured diff payload to custom endpoints (n8n, etc.)           |
|      * PromptBuilder: Conventional Commits v1.0.0 prompt engineering & diff budgeting   |
|      * 30s AbortController timeout & safe secret masking across all clients             |
+-----------------------------------------------------------------------------------------+
                                    ▲
                                    │
                                    ▼
+-----------------------------------------------------------------------------------------+
|                Local Git CLI, Ollama Daemon & Cloud AI Endpoints                        |
+-----------------------------------------------------------------------------------------+
```

## Feature Inventory
Every feature from initial and follow-up survey phases is enumerated here with its assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1: Native Directory Picker Dialog | Native directory selection dialog via IPC (`dialog:open-directory`) | M2 | Survey (spec_miner #1) |
| 2 | F2: Git Repository Validation | Verifies valid Git worktree, returns clear error on non-git directory | M2 | Survey (spec_miner #2) |
| 3 | F3: Active Branch Resolution | Queries active branch (`git branch --show-current`, handles unborn & detached HEAD) | M2 | Survey (spec_miner #3) |
| 4 | F4: Repository Path & Name Display | Prominently displays opened repo directory and breadcrumb in header | M3 | Survey (spec_miner #4) |
| 5 | F5: Staged Changes Extraction | Parses index status `X` into staged changes (`M`, `A`, `D`, `R`, `C`) | M2 | Survey (spec_miner #5) |
| 6 | F6: Unstaged Changes Extraction | Parses worktree status `Y` into unstaged changes (`M`, `D`, `T`) | M2 | Survey (spec_miner #6) |
| 7 | F7: Untracked Files Extraction | Parses untracked files (`??`) using `-uall` recursion | M2 | Survey (spec_miner #7) |
| 8 | F8: Partially Staged Changes | Accurately assigns files with dual modifications (`MM`, `AM`) to both sections | M2 | Survey (spec_miner #8) |
| 9 | F9: Manual Refresh Trigger | Refresh button in header re-queries Git status and updates views | M3 | Survey (spec_miner #9) |
| 10 | F10: Clean Repository State | Displays clear "Working tree clean" state when no changes exist | M3 | Survey (spec_miner #10) |
| 11 | F11: Staged File Diff Retrieval | Queries `git diff --staged -M -- <filePath>` safely | M2 | Survey (spec_miner #11) |
| 12 | F12: Unified Diff Viewer & Highlighting | Parses diff into hunks, lines, additions (green), deletions (red) | M3 | Survey (spec_miner #12) |
| 13 | F13: Binary File Diff Handling | Detects and safely renders placeholder notice for binary files | M2 | Survey (spec_miner #13) |
| 14 | F14: Empty & Edge Case Diffs | Handles 0-byte added files, deletions, and EOF missing newline | M2 | Survey (spec_miner #14) |
| 15 | F15: File Selection / Deselection | Handles selection state and empty selection placeholder | M3 | Survey (spec_miner #15) |
| 16 | F16: Electron Security Hardening | Enables `contextIsolation`, disables `nodeIntegration`, enables sandbox | M1 | Survey (spec_miner #16) |
| 17 | F17: Preload Script Safe Bridge | Safe typed bridge exposing only whitelisted read-only methods | M1 | Survey (spec_miner #17) |
| 18 | F18: Read-Only IPC Whitelist | Main process implements strictly read-only IPC handlers (no mutative ops) | M2 | Survey (spec_miner #18) |
| 19 | F19: Argument Injection Protection | Uses `child_process.execFile` with array args and `--` path delimiter | M2 | Survey (spec_miner #19) |
| 20 | F20: Automated TypeScript Typecheck | `tsc --noEmit` completes with 0 compiler errors | M1 | Survey (spec_miner #21) |
| 21 | F21: Production Build Pipeline | `npm run build` compiles main, preload, and renderer into `dist/` | M1 | Survey (spec_miner #22) |
| 22 | F22: Unit & Integration Test Suite | Automated Vitest test suite verifying status parsing, diff, and non-git handling | M4 | Survey (spec_miner #23) |
| 23 | F23: Complete Documentation | `README.md` with install, test run, dev instructions, and architecture | M4 | Survey (ORIGINAL_REQUEST § 44) |
| 24 | F24: Centralized Settings Modal | Dedicated modal accessible from Navigation Sidebar "Settings" action | M7 | Follow-up Survey R1 |
| 25 | F25: Settings Form & Actions | Webhook URL & token inputs, Save, Reset/Clear, error & success alerts | M7 | Follow-up Survey R1 |
| 26 | F26: Configuration Persistence | Persists user webhook settings across application restarts | M7 | Follow-up Survey R1 |
| 27 | F27: Hybrid Precedence Resolver | Precedence: User Settings (`localStorage`) > `.env` variables > Unconfigured | M6, M7 | Follow-up Survey R2 |
| 28 | F28: IPC Query for Env Defaults | `settings:get-webhook-config` exposes `.env` fallback values & status to renderer | M6 | Follow-up Survey R2 |
| 29 | F29: Main Process Webhook URL Fallback | `handleWebhookGenerateCommit` falls back to `process.env.DEVPILOT_WEBHOOK_URL` | M6 | Follow-up Survey R2 |
| 30 | F30: Webhook Custom Prompt Forwarding | Forward `customPrompt: options.customPrompt` in dynamic webhook payload | M6 | Follow-up Survey R3 |
| 31 | F31: Commit Generator Panel Refactor | Seamlessly consumes resolved config without redundant inline prompt drawers | M8 | Follow-up Survey R3 |
| 32 | F32: Robust Error & Timeout Handling | User-facing messaging for connection errors, timeouts, invalid URLs, and auth failures | M8 | Follow-up Survey R3 |
| 33 | F33: Refactor Test Coverage | Unit & integration tests for settings modal, resolver, handlers, and commit generator | M6, M7, M8 | Follow-up Survey R4 |
| 34 | F34: Shared Multi-Provider Types & IPC Channels | `AIProvider` enum, provider configs (`WebhookConfig`, `OllamaConfig`, `OpenAIConfig`, `GeminiConfig`), unified `GenerateCommitOptions`, IPC aliases | M9 | Survey (spec_miner #1 & #2) |
| 35 | F35: Modular AI Dispatch Router | Main process router `AIService` routing commit generation to active configured provider | M9 | Survey (spec_miner #1) |
| 36 | F36: Local Ollama Client | Ollama REST API dispatcher (`/api/chat` / `/api/generate`), default `http://localhost:11434`, default `llama3.2`, offline error detection | M9 | Survey (spec_miner #2) |
| 37 | F37: OpenAI Cloud Client | OpenAI Chat Completions dispatcher (`/v1/chat/completions`), Bearer auth, default `gpt-4o-mini`, 401/404/429 error mapping | M9 | Survey (spec_miner #2) |
| 38 | F38: Google Gemini Cloud Client | Gemini REST API dispatcher (`v1beta/models/...:generateContent`), header `x-goog-api-key`, default `gemini-1.5-flash`, 400/403/404/429 mapping | M9 | Survey (spec_miner #2) |
| 39 | F39: Custom Webhook Client Preservation | Webhook dispatcher preserving existing structured diff payload format and backward compatibility | M9 | Survey (spec_miner #1) |
| 40 | F40: 30-Second Timeout Abort Protection | Guaranteed 30s `AbortController` timeout handling with `clearTimeout` cleanup across all providers | M9 | Survey (explorer #3) |
| 41 | F41: Safe Secret Masking & Error Sanitization | Sanitizes error strings to mask `sk-...`, `AIza...`, and bearer tokens; protects against key leakage in logs and UI alerts | M9 | Survey (explorer #3) |
| 42 | F42: Conventional Commit Prompt Engineering | `promptBuilder` formulating system instructions for Conventional Commits v1.0.0 and safe diff token budgeting (20k-40k char caps) | M9 | Survey (spec_miner #2) |
| 43 | F43: Multi-Provider Settings Modal UI | SettingsModal dropdown selector (`data-testid="settings-provider-select"`) supporting Custom Webhook, Local Ollama, OpenAI, Google Gemini | M10 | Survey (explorer #3) |
| 44 | F44: Dynamic Settings Form Fields | Form dynamically renders fields for active provider (Webhook: URL+Token; Ollama: Base URL+Model; OpenAI: API Key+Model; Gemini: API Key+Model) | M10 | Survey (explorer #3) |
| 45 | F45: Independent Credential Persistence | Persists credentials for each provider independently in `localStorage`, maintaining configuration across provider switches and app restarts | M10 | Survey (explorer #3) |
| 46 | F46: Multi-Provider Env Fallback Resolution | Configuration resolver with user precedence and `.env` fallback for all providers (`aiConfig.ts` & `settings:get-ai-config`) | M10 | Survey (spec_miner #1) |
| 47 | F47: Active Source Indicator per Provider | Status badge per provider reflecting "User Settings", ".env Fallback", or "Unconfigured" | M10 | Survey (spec_miner #1) |
| 48 | F48: Reset to Defaults for Multi-Provider | Reverts active provider credentials to environment defaults and clears localStorage keys | M10 | Survey (spec_miner #1) |
| 49 | F49: Preload Bridge Multi-Provider API | Updates `window.devPilot.generateCommitMessage` and adds `getAIConfig` while maintaining backward compatibility | M10 | Survey (spec_miner #1) |
| 50 | F50: Active Provider & Model Indicator Badge | Prominently displays active provider and model (e.g. `Ollama (llama3.2)` or `OpenAI (gpt-4o-mini)`) in Commit Generator header | M11 | Survey (spec_miner #1) |
| 51 | F51: Transparent Commit Generator Dispatch | `useCommitGenerator.ts` routes generation requests to active provider dynamically without requiring inline reconfiguration | M11 | Survey (spec_miner #1) |
| 52 | F52: Dynamic Unconfigured Warning Banner | Displays contextual warning in Commit Generator when active provider lacks required configuration, with "Open Settings" link | M11 | Survey (spec_miner #1) |
| 53 | F53: Actionable Provider-Tailored Error Alerts | Actionable error messages tailored to provider failures (Ollama offline `ollama serve`, invalid API keys, rate limits, timeouts) with retry | M11 | Survey (spec_miner #1 & #2) |
| 54 | F54: Multi-Provider Unit Test Suite | Comprehensive unit tests for AI clients (Ollama, OpenAI, Gemini, Webhook), error handling, secret masking, resolvers, and UI components | M12 | Survey (explorer #3) |
| 55 | F55: Multi-Provider Integration Dispatch Test Suite | Automated integration tests with mock HTTP endpoints for all 4 providers executing real Git staged diff generation | M12 | Survey (spec_miner #1) |
| 56 | F56: Zero-Regression Test & Typecheck Verification | 100% test pass on Vitest test suite (`npm test`) and 0 compiler errors (`npm run typecheck`) | M12 | Survey (spec_miner #1) |
| 57 | F57: Workspace Sibling Repository Scanner | Scans sibling repos in active workspace for modified endpoints, symbols, and env vars | M13 | User Request |
| 58 | F58: Plain English Non-Dev Review Prompt | AI prompt formulating simple, jargon-free explanations, business impact, and QA verification | M13 | User Request |
| 59 | F59: Workspace Review Modal & UI | Interactive review modal with Audience Switcher (Non-Dev vs Technical), Sibling Impact Matrix, and Markdown export | M13 | User Request |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation, Tooling & Security | Project setup, Vite + Electron configs, TS, shared types, main window security, preload bridge scaffold, React foundation | None | DONE |
| M2 | Core Git Service & Read-Only IPC | Safe Git executor (`execFile`), repo validator, branch resolver, porcelain `-z` status parser, staged diff parser, read-only IPC handlers, unit & integration tests | M1 | DONE |
| M3 | Interactive UI & Diff Viewer | Header (picker, path, branch, refresh), Sidebar (staged, unstaged, untracked), DiffViewer (syntax highlighting, binary notice), empty/error states, useGitRepo hook | M2 | DONE |
| M4 | Documentation & Verification | README.md, end-to-end integration tests, type checking validation, production build verification | M3 | DONE |
| M5 | Final E2E Test Pass (Initial) | Initial E2E pass for Git status and diff viewer | M4 | DONE |
| M6 | Hybrid Config Resolution & Main Webhook Dispatch | IPC `settings:get-webhook-config`, fallback resolution in `webhookHandlers.ts`, forward `customPrompt`, preload bridge typing, resolver unit tests | M4 | DONE |
| M7 | Centralized Settings Modal & Navigation Integration | `SettingsModal.tsx`, NavigationSidebar `data-testid="nav-settings-btn"`, `App.tsx` modal state, `webhookConfig.ts` resolver helpers, modal unit tests | M6 | DONE |
| M8 | Dynamic Commit Generator Dispatch & Final Verification | Refactor `CommitGeneratorPanel.tsx` & `useCommitGenerator.ts` to consume resolved config, remove redundant drawer, handle errors, full `npm test` & `npm run typecheck` verification | M6, M7 | DONE |
| M9 | Multi-Provider Shared Contracts & Modular Main Process AI Dispatch Architecture | Shared types (`AIProvider`, configs, `GenerateCommitOptions`), IPC channels, `src/main/services/ai/` (`aiService.ts`, `ollamaClient.ts`, `openaiClient.ts`, `geminiClient.ts`, `webhookClient.ts`, `promptBuilder.ts`), 30s timeouts, secret masking, env fallback integration, client unit tests | M8 | DONE |
| M10 | Multi-Provider Settings Modal & Dynamic Configuration Resolution | Provider selector dropdown (`settings-provider-select`), dynamic fieldset rendering (Webhook, Ollama, OpenAI, Gemini), independent `localStorage` persistence, `.env` fallback resolution, preload bridge typing (`getAIConfig`), SettingsModal unit tests | M9 | DONE |
| M11 | Transparent Commit Generator Integration & Dynamic Provider Routing | CommitGeneratorPanel active provider badge, unconfigured warning banner, transparent dispatch in `useCommitGenerator.ts`, actionable error presentation (Ollama offline, auth, quota) with retry, UI unit tests | M9, M10 | DONE |
| M12 | Multi-Provider Integration Testing & Final E2E Verification | End-to-end integration test suite (`tests/integration/multiProviderDispatch.test.ts`) with mock HTTP servers for all 4 providers, full Vitest test pass (`npm test`), zero TypeScript compiler errors (`npm run typecheck`) | M9, M10, M11 | DONE |
| M13 | Workspace Change Explainer & Cross-Repository Impact Review | Workspace sibling repo scanner, plain-English non-dev prompt engineering, cross-repo impact matrix, audience mode switcher, full unit test suite | M9, M10 | DONE |

## Interface Contracts

### Shared Types (`src/shared/types.ts`)
```typescript
export type AIProvider = 'webhook' | 'ollama' | 'openai' | 'gemini';

export interface WebhookConfig {
  webhookUrl: string;
  webhookToken?: string;
}

export interface OllamaConfig {
  baseUrl: string; // default: 'http://localhost:11434'
  model: string;   // default: 'llama3.2'
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;   // default: 'gpt-4o-mini'
  baseUrl?: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;   // default: 'gemini-1.5-flash'
}

export interface AISettings {
  activeProvider: AIProvider;
  webhook: WebhookConfig;
  ollama: OllamaConfig;
  openai: OpenAIConfig;
  gemini: GeminiConfig;
}

export interface ResolvedAIConfig {
  activeProvider: AIProvider;
  providerConfigs: {
    webhook: WebhookConfig;
    ollama: OllamaConfig;
    openai: OpenAIConfig;
    gemini: GeminiConfig;
  };
  sources: Record<AIProvider, ConfigSource>;
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

export interface GenerateCommitOptions {
  repoPath: string;
  provider?: AIProvider;
  webhookUrl?: string;
  webhookToken?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  customPrompt?: string;
}

export type WebhookGenerateCommitOptions = GenerateCommitOptions;

export interface DevPilotAPI {
  openDirectory: () => Promise<string | null>;
  getStatus: (repoPath: string) => Promise<IPCResult<GitStatusResult>>;
  getStagedDiff: (repoPath: string, filePath: string, oldPath?: string) => Promise<IPCResult<GitDiffResult>>;
  getAllStagedDiff: (repoPath: string) => Promise<IPCResult<AllStagedDiffResult>>;
  generateCommitMessage: (options: GenerateCommitOptions) => Promise<IPCResult<GenerateCommitResult>>;
  getAIConfig?: () => Promise<IPCResult<ResolvedAIConfig>>;
  getWebhookConfig?: () => Promise<IPCResult<ResolvedWebhookConfig>>;
}
```

### Preload ↔ Main IPC Channels (`src/shared/ipcChannels.ts`)
- `dialog:open-directory`: Invoked with no arguments. Returns `string | null`.
- `git:get-status`: Invoked with `(repoPath: string)`. Returns `IPCResult<GitStatusResult>`.
- `git:get-staged-diff`: Invoked with `({ repoPath: string, filePath: string, oldPath?: string })`. Returns `IPCResult<GitDiffResult>`.
- `git:get-all-staged-diff`: Invoked with `(repoPath: string)`. Returns `IPCResult<AllStagedDiffResult>`.
- `ai:generate-commit` / `webhook:generate-commit`: Invoked with `(options: GenerateCommitOptions)`. Returns `IPCResult<GenerateCommitResult>`.
- `settings:get-ai-config`: Invoked with no arguments. Returns `IPCResult<ResolvedAIConfig>`.
- `settings:get-webhook-config`: Invoked with no arguments. Returns `IPCResult<ResolvedWebhookConfig>`.

## Code Layout
```
/home/wks-dev-17/Desktop/DevPilot/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── index.html
├── README.md
├── src/
│   ├── shared/
│   │   ├── types.ts                    # Owned by M9
│   │   └── ipcChannels.ts              # Owned by M9
│   ├── main/
│   │   ├── index.ts                    # Owned by M9
│   │   ├── services/
│   │   │   └── ai/                     # Owned by M9
│   │   │       ├── aiService.ts
│   │   │       ├── ollamaClient.ts
│   │   │       ├── openaiClient.ts
│   │   │       ├── geminiClient.ts
│   │   │       ├── webhookClient.ts
│   │   │       └── promptBuilder.ts
│   │   ├── ipc/
│   │   │   ├── dialogHandlers.ts
│   │   │   ├── gitHandlers.ts
│   │   │   └── webhookHandlers.ts      # Owned by M9 (delegates to aiService)
│   │   └── utils/
│   │       └── envLoader.ts            # Owned by M9
│   ├── preload/
│   │   └── index.ts                    # Owned by M10
│   └── renderer/
│       ├── main.tsx
│       ├── App.tsx                     # Owned by M10
│       ├── components/
│       │   ├── NavigationSidebar.tsx   # Owned by M10
│       │   ├── SettingsModal/          # Owned by M10
│       │   │   └── SettingsModal.tsx
│       │   └── CommitGenerator/        # Owned by M11
│       │       └── CommitGeneratorPanel.tsx
│       ├── hooks/
│       │       └── useCommitGenerator.ts # Owned by M11
│       ├── services/
│       │   ├── aiConfig.ts             # Owned by M10
│       │   └── webhookConfig.ts        # Owned by M10 (re-exports backward-compatible helpers)
│       └── styles/
│           └── index.css               # Owned by M10
└── tests/
    ├── setup.ts
    ├── unit/
    │   ├── aiClients.test.ts           # Owned by M9 & M12
    │   ├── aiConfigResolver.test.ts    # Owned by M10 & M12
    │   ├── webhookConfigResolver.test.ts
    │   ├── webhookHandlers.test.ts     # Owned by M9
    │   ├── settingsModal.test.tsx      # Owned by M10
    │   ├── settingsModalMultiProvider.test.tsx # Owned by M10 & M12
    │   ├── navigationSidebar.test.tsx
    │   ├── commitGeneratorUI.test.tsx  # Owned by M11
    │   └── commitGeneratorMultiProvider.test.tsx # Owned by M11 & M12
    └── integration/
        ├── commitGeneratorDynamicDispatch.test.ts
        └── multiProviderDispatch.test.ts # Owned by M12
```
