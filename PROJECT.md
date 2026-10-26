# Project: DevPilot AI

## Architecture
DevPilot AI is a desktop application built with Electron, React, TypeScript, and Vite.
It functions as a safe, read-only Git status and staged diff inspector for local repositories, with an intelligent AI commit message generator powered by an n8n webhook integration.

```
+-----------------------------------------------------------------------------------------+
|                                        Renderer                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | Header: Folder Picker | Repo Path | Branch Badge | Refresh Button | Actions       |  |
|  +-----------------------------------------------------------------------------------+  |
|  | Nav Rail: Workspaces | Settings (opens SettingsModal) | About                     |  |
|  | Sidebar: Changes List (Staged, Unstaged, Untracked)                                |  |
|  | DiffViewer: Staged Diff View (Unified diff hunks, syntax highlighting)             |  |
|  | CommitGeneratorPanel: AI Commit Assistant (Dynamic dispatch via resolved config)  |  |
|  +-----------------------------------------------------------------------------------+  |
|  | Overlay: SettingsModal (Centralized URL & Token config, .env source indicator)    |  |
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
|  - Webhook APIs: generateCommitMessage, getWebhookConfig                                |
+-----------------------------------------------------------------------------------------+
                                    ▲
                                    │ (IPC Channels)
                                    ▼
+-----------------------------------------------------------------------------------------+
|                                      Main Process                                       |
|  - Security & Lifecycle: BrowserWindow with contextIsolation & production CSP           |
|  - Env Loader: reads .env and ~/.devpilot.env at startup into process.env               |
|  - Read-Only Git IPC Handlers:                                                          |
|      * 'dialog:open-directory'                                                          |
|      * 'git:get-status'                                                                 |
|      * 'git:get-staged-diff'                                                            |
|      * 'git:get-all-staged-diff'                                                        |
|  - Webhook IPC Handlers:                                                                |
|      * 'settings:get-webhook-config' (returns .env fallback values & status)            |
|      * 'webhook:generate-commit' (dynamic payload dispatch with hybrid resolution)      |
|  - HTTP Webhook Dispatcher: Node fetch with AbortController (30s timeout)               |
+-----------------------------------------------------------------------------------------+
                                    ▲
                                    │
                                    ▼
+-----------------------------------------------------------------------------------------+
|                           Local Git CLI & n8n Webhook Host                              |
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

## Interface Contracts

### Shared Types (`src/shared/types.ts`)
```typescript
export interface WebhookConfigDefaults {
  envWebhookUrl: string;
  hasEnvToken: boolean;
  activeSource: 'user' | 'env' | 'none';
}

export interface ResolvedWebhookConfig {
  webhookUrl: string;
  webhookToken?: string;
  source: 'user' | 'env' | 'none';
  envDefaults: {
    webhookUrl: string;
    hasToken: boolean;
  };
}

export interface WebhookCommitPayload {
  repoPath: string;
  branch: string;
  isDetached: boolean;
  stagedFiles: GitFileStatus[];
  diff: string;
  diffSummary: {
    totalFiles: number;
    additions: number;
    deletions: number;
  };
  customPrompt?: string;
}

export interface DevPilotAPI {
  openDirectory: () => Promise<string | null>;
  getStatus: (repoPath: string) => Promise<IPCResult<GitStatusResult>>;
  getStagedDiff: (repoPath: string, filePath: string, oldPath?: string) => Promise<IPCResult<GitDiffResult>>;
  getAllStagedDiff: (repoPath: string) => Promise<IPCResult<AllStagedDiffResult>>;
  generateCommitMessage: (options: GenerateCommitOptions) => Promise<IPCResult<GenerateCommitResult>>;
  getWebhookConfig?: () => Promise<IPCResult<ResolvedWebhookConfig>>;
}
```

### Preload ↔ Main IPC Channels (`src/shared/ipcChannels.ts`)
- `dialog:open-directory`: Invoked with no arguments. Returns `string | null`.
- `git:get-status`: Invoked with `(repoPath: string)`. Returns `IPCResult<GitStatusResult>`.
- `git:get-staged-diff`: Invoked with `({ repoPath: string, filePath: string, oldPath?: string })`. Returns `IPCResult<GitDiffResult>`.
- `git:get-all-staged-diff`: Invoked with `(repoPath: string)`. Returns `IPCResult<AllStagedDiffResult>`.
- `webhook:generate-commit`: Invoked with `(options: GenerateCommitOptions)`. Returns `IPCResult<GenerateCommitResult>`.
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
│   │   ├── types.ts                    # Owned by M6
│   │   └── ipcChannels.ts              # Owned by M6
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/
│   │   │   ├── dialogHandlers.ts
│   │   │   ├── gitHandlers.ts
│   │   │   └── webhookHandlers.ts      # Owned by M6
│   │   └── utils/
│   │       └── envLoader.ts
│   ├── preload/
│   │   └── index.ts                    # Owned by M6
│   └── renderer/
│       ├── main.tsx
│       ├── App.tsx                     # Owned by M7
│       ├── components/
│       │   ├── NavigationSidebar.tsx   # Owned by M7
│       │   ├── SettingsModal/          # Owned by M7
│       │   │   └── SettingsModal.tsx
│       │   └── CommitGenerator/        # Owned by M8
│       │       └── CommitGeneratorPanel.tsx
│       ├── hooks/
│       │       └── useCommitGenerator.ts # Owned by M8
│       ├── services/
│       │   └── webhookConfig.ts        # Owned by M6 & M7
│       └── styles/
│           └── index.css               # Owned by M7
└── tests/
    ├── setup.ts
    ├── unit/
    │   ├── webhookConfigResolver.test.ts # Owned by M6
    │   ├── webhookHandlers.test.ts       # Owned by M6
    │   ├── settingsModal.test.tsx        # Owned by M7
    │   ├── navigationSidebar.test.tsx    # Owned by M7
    │   └── commitGeneratorUI.test.tsx    # Owned by M8
    └── integration/
        └── commitGeneratorDynamicDispatch.test.ts # Owned by M8
```
