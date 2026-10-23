# Project: DevPilot AI

## Architecture
DevPilot AI is a desktop application built with Electron, React, TypeScript, and Vite.
It functions strictly as a safe, read-only Git status and staged diff inspector for local repositories.

```
+-------------------------------------------------------------------------+
|                               Renderer                                  |
|  +-------------------------------------------------------------------+  |
|  | Header: Folder Picker | Repo Path | Branch Badge | Refresh Button |  |
|  +-------------------------------------------------------------------+  |
|  | Sidebar: Changes List             | DiffViewer: Staged Diff View  |  |
|  | - Staged Changes (M, A, D, R, C)  | - Unified diff hunks          |  |
|  | - Unstaged Changes (M, D, T)      | - Line additions (+) & del (-) |  |
|  | - Untracked Files (??)            | - Binary / Empty file notice  |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
                                    ▲
                                    │ (Typed Preload Bridge via window.devPilot)
                                    ▼
+-------------------------------------------------------------------------+
|                         Electron Preload Bridge                         |
|  - contextBridge.exposeInMainWorld('devPilot', api)                     |
|  - contextIsolation: true, nodeIntegration: false, sandbox: true       |
+-------------------------------------------------------------------------+
                                    ▲
                                    │ (Read-Only IPC Channels)
                                    ▼
+-------------------------------------------------------------------------+
|                           Main Process                                  |
|  - Native Dialog: dialog.showOpenDialog({ properties: ['openDirectory'] })
|  - Read-Only Git IPC Handlers:                                          |
|      * 'dialog:open-directory'                                          |
|      * 'git:get-status'                                                 |
|      * 'git:get-staged-diff'                                            |
|  - Safe Git Executor: child_process.execFile('git', args, options)      |
|      * Argument injection protection with '--' delimiter                |
|      * Zero mutative operations (no add, commit, push, reset)          |
+-------------------------------------------------------------------------+
                                    ▲
                                    │
                                    ▼
+-------------------------------------------------------------------------+
|                             Local Git CLI                               |
+-------------------------------------------------------------------------+
```

## Feature Inventory
Every feature from the Survey phase is enumerated here with its assigned milestone:

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

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation, Tooling & Security | Project setup, Vite + Electron configs, TS, shared types, main window security, preload bridge scaffold, React foundation | None | DONE |
| M2 | Core Git Service & Read-Only IPC | Safe Git executor (`execFile`), repo validator, branch resolver, porcelain `-z` status parser, staged diff parser, read-only IPC handlers, unit & integration tests | M1 | DONE |
| M3 | Interactive UI & Diff Viewer | Header (picker, path, branch, refresh), Sidebar (staged, unstaged, untracked), DiffViewer (syntax highlighting, binary notice), empty/error states, useGitRepo hook | M2 | DONE |
| M4 | Documentation & Verification | README.md, end-to-end integration tests, type checking validation, production build verification | M3 | IN_PROGRESS |
| M5 | Final E2E Test Pass & Coverage Hardening | Phase 1: 100% pass of E2E Test Suite (Tiers 1-4). Phase 2: Tier 5 adversarial coverage hardening | M4, TEST_READY | PLANNED |

## Interface Contracts

### Shared Types (`src/shared/types.ts`)
```typescript
export type GitFileChangeType = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';

export interface GitFileStatus {
  path: string;
  oldPath?: string;
  changeType: GitFileChangeType;
  statusCode: string;
}

export interface GitStatusResult {
  repoPath: string;
  branch: string;
  isDetached: boolean;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
}

export interface GitDiffHunkLine {
  type: 'add' | 'delete' | 'context' | 'meta';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface GitDiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitDiffHunkLine[];
}

export interface GitDiffResult {
  repoPath: string;
  filePath: string;
  rawDiff: string;
  isBinary: boolean;
  isEmpty: boolean;
  hunks: GitDiffHunk[];
}

export interface IPCResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DevPilotAPI {
  openDirectory: () => Promise<string | null>;
  getStatus: (repoPath: string) => Promise<IPCResult<GitStatusResult>>;
  getStagedDiff: (repoPath: string, filePath: string, oldPath?: string) => Promise<IPCResult<GitDiffResult>>;
}

declare global {
  interface Window {
    devPilot: DevPilotAPI;
  }
}
```

### Preload ↔ Main IPC Channels (`src/shared/ipcChannels.ts`)
- `dialog:open-directory`: Invoked with no arguments. Returns `string | null`.
- `git:get-status`: Invoked with `(repoPath: string)`. Returns `IPCResult<GitStatusResult>`.
- `git:get-staged-diff`: Invoked with `({ repoPath: string, filePath: string, oldPath?: string })`. Returns `IPCResult<GitDiffResult>`.

## Code Layout
```
/home/wks-dev-17/Desktop/DevPilot/
├── package.json                 # Dependencies and npm scripts
├── tsconfig.json                # TypeScript project configuration
├── vite.config.ts               # Unified Vite + vite-plugin-electron build config
├── vitest.config.ts             # Vitest configuration with happy-dom
├── index.html                   # HTML entry point for renderer
├── README.md                    # Project documentation
├── src/
│   ├── shared/                  # Exclusively owned by M1 (types, contracts)
│   │   ├── types.ts
│   │   └── ipcChannels.ts
│   ├── main/                    # Owned by M1 & M2
│   │   ├── index.ts             # App lifecycle & BrowserWindow creation (M1)
│   │   ├── ipc/                 # IPC handlers (M2)
│   │   │   ├── dialogHandlers.ts
│   │   │   └── gitHandlers.ts
│   │   └── git/                 # Git services (M2)
│   │       ├── executor.ts
│   │       ├── repoValidator.ts
│   │       ├── branchDetector.ts
│   │       ├── statusParser.ts
│   │       └── diffParser.ts
│   ├── preload/                 # Owned by M1
│   │   └── index.ts
│   └── renderer/                # Owned by M3
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── Sidebar.tsx
│       │   ├── FileList.tsx
│       │   ├── DiffViewer.tsx
│       │   ├── EmptyState.tsx
│       │   └── ErrorBanner.tsx
│       ├── hooks/
│       │   └── useGitRepo.ts
│       └── styles/
│           └── index.css
└── tests/                       # Owned by E2E Testing Track and M4
    ├── setup.ts
    ├── unit/
    │   ├── statusParser.test.ts
    │   ├── diffParser.test.ts
    │   └── repoValidator.test.ts
    └── integration/
        ├── gitOps.test.ts
        └── ipcSecurity.test.ts
```
