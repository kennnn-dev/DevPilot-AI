# DevPilot AI

> Safe, read-only desktop Git inspector for inspecting staged changes and diffs.

DevPilot AI is a modern desktop application built with Electron, React, TypeScript, and Vite. Designed specifically for developers using VS Code, DevPilot AI provides a fast, dedicated, and strictly read-only interface for inspecting local Git repositories, tracking working tree status, and reviewing unified staged diffs before committing.

---

## Key Features

- **Workspace Management**:
  - Create, inline-rename, and delete workspaces.
  - Add multiple local Git repositories from any directory into a single workspace.
  - Workspaces and repository configurations persist automatically in local storage.
  - Independent repository status: each repository tracks its own active branch, status, and changes cleanly without interference.
- **Native Directory Selection**: Open any local Git repository using your operating system's native directory picker dialog.
- **Real Working Tree Status Inspection**: Safely queries the underlying repository via Git CLI (zero mock data):
  - **Staged Changes**: Categorizes modified (`M`), added (`A`), deleted (`D`), renamed (`R`), and copied (`C`) changes.
  - **Unstaged Changes**: Tracks modified (`M`), deleted (`D`), and type-changed (`T`) working tree files.
  - **Untracked Files**: Lists newly created, untracked files (`??`) using recursive porcelain scanning without phantom deletions.
  - **Dual-Status Detection**: Accurately tracks files with concurrent index and working tree edits (e.g., `MM`, `AM`).
  - **Rename Source Tracking**: Displays previous file paths for renamed or moved files.
- **Unified Diff Viewer**:
  - Inspect diffs for **all** changed files: Staged, Unstaged, and Untracked.
  - Real line counters and syntax-highlighted additions (`+`) and deletions (`-`).
  - Dual line numbering gutters showing old and new line numbers.
  - Handles binary files and empty files cleanly.
- **Resizable Studio Layout**:
  - Center workspace expands to full width when no file is selected.
  - Smooth vertical drag handle to resize the Diff Viewer side to your preferred width.
- **VS Code Dark Modern Theme**: Designed to match the look, feel, and typography of Visual Studio Code Dark Modern editor theme.
- **Read-Only Safety Guardrails**: Hardened architecture with zero mutative operations—no files are modified, staged, committed, or pushed.

---

## System Prerequisites

Ensure the following tools are installed on your host system:

- **Node.js**: `v18.0.0` or higher (tested on Node.js `v22.x`)
- **Git**: `2.22.0` or higher (required for `git branch --show-current` support)
- **npm**: `8.0.0` or higher

Verify your installation:
```bash
node --version
git --version
npm --version
```

---

## Quick Start & Installation

Clone the repository and install all dependencies:

```bash
git clone <repository-url>
cd DevPilot
npm install
```

---

## Running the Application

### Option A: Run in Development Mode
Launch DevPilot desktop window with hot-module reloading:

```bash
npm start
# or: npm run dev
```

### Option B: Build & Run as a Standalone Desktop App
Package DevPilot into a true standalone desktop application that runs independently:

```bash
npm run package
```
This produces a compiled native binary in `./release/linux-unpacked/devpilot`. You can run it directly:
```bash
./release/linux-unpacked/devpilot
```

To create an installable package (`.AppImage` or `.deb`):
```bash
npm run package:appimage   # Generates standalone AppImage installer
npm run package:deb        # Generates Debian/Ubuntu .deb installer
```

---

## Real-Time Git Auto-Tracking (No Manual Refresh Required)

DevPilot features automatic, real-time working tree change detection:
- **VS Code & External Edits**: Whenever you edit or save files in VS Code, Git index updates and working tree changes are detected automatically in real-time.
- **Branch Switches & Commits**: Switching branches or committing in your terminal automatically synchronizes DevPilot's status without needing to click the refresh button.
- **Window Focus Synchronization**: The moment you switch back from VS Code or any other window, DevPilot verifies repository freshness.

### How Development Mode Works
The `npm run dev` script executes `vite`, which leverages `vite-plugin-electron` to:
1. Start the Vite local development server for the React renderer with Hot Module Replacement (HMR).
2. Bundle the Main process (`src/main/index.ts`) and Preload script (`src/preload/index.ts`).
3. Automatically launch Electron configured to load the Vite dev server URL.
4. Hot-reload Electron main/preload processes and renderer views as code changes.

---

## Automated Verification & Testing

DevPilot AI comes with an extensive automated test suite covering unit tests, adversarial security tests, and end-to-end integration tests using real Git repositories.

### 1. Run Unit & Integration Tests
```bash
npm test
```
*Executes all test suites via Vitest and Happy DOM.*

To run tests in watch mode:
```bash
npm run test:watch
```

### 2. TypeScript Typecheck
Verify strict type conformity across Main, Preload, and Renderer processes:
```bash
npm run typecheck
```
*Executes `tsc --noEmit`.*

### 3. Code Linting
Run ESLint to check for code quality and conventions:
```bash
npm run lint
```
*Executes `eslint src`.*

---

## Production Build Pipeline

To compile and bundle DevPilot AI for production:

```bash
npm run build
```

This pipeline executes:
1. `tsc --noEmit`: Typechecks the entire TypeScript codebase.
2. `vite build`: Compiles all three application targets into the `dist/` directory:
   - `dist/main/index.js`: Compiled Electron Main process bundle.
   - `dist/preload/index.js`: Compiled Preload script bundle.
   - `dist/renderer/`: Production HTML, JavaScript, and CSS bundle for the React UI.

To preview the built production app locally:
```bash
npm run preview
```

---

## Architectural Overview

DevPilot AI enforces strict separation of concerns following Electron's process architecture:

```
+-------------------------------------------------------------------------+
|                               Renderer                                  |
|  (React 18 SPA, Lucide Icons, VS Code Dark Modern Theme, useGitRepo)   |
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
|  - Parameter validation before IPC boundary                             |
+-------------------------------------------------------------------------+
                                    ▲
                                    │ (Read-Only IPC Channels)
                                    ▼
+-------------------------------------------------------------------------+
|                           Main Process                                  |
|  - App lifecycle & BrowserWindow security hardening                     |
|  - Native Dialog: dialog.showOpenDialog({ properties: ['openDirectory'] })
|  - Read-Only Git IPC Handlers:                                          |
|      * 'dialog:open-directory'                                          |
|      * 'git:get-status'                                                 |
|      * 'git:get-staged-diff'                                            |
|  - Safe Git Executor: child_process.execFile('git', args, options)      |
|      * Argument injection protection with '--' delimiter                |
|      * Environment isolation (LC_ALL=C.UTF-8, GIT_TERMINAL_PROMPT=0)   |
|      * Zero mutative operations (no add, commit, push, reset)          |
+-------------------------------------------------------------------------+
                                    ▲
                                    │ Subprocess execution
                                    ▼
+-------------------------------------------------------------------------+
|                             Local Git CLI                               |
+-------------------------------------------------------------------------+
```

### Component Details
1. **Main Process (`src/main/`)**:
   - Manages Electron window lifecycle, permission denials, and window open handlers.
   - Houses the safe Git execution service (`executor.ts`) and Git domain parsers (`statusParser.ts`, `diffParser.ts`, `branchDetector.ts`, `repoValidator.ts`).
   - Registers read-only IPC handlers for directory opening, status inspection, and staged diff extraction.
2. **Preload Bridge (`src/preload/`)**:
   - Exposes `window.devPilot` to the renderer using Electron's `contextBridge`.
   - Never leaks `ipcRenderer`, Node.js built-ins, or raw file descriptors.
   - Enforces type validation on all channel arguments before passing them across the IPC boundary.
3. **Renderer Process (`src/renderer/`)**:
   - A single-page application built with React 18 and Vite.
   - State and asynchronous Git operations are managed via the custom `useGitRepo` hook.
   - Provides instant feedback, responsive layout, and empty/error states for uninitialized repositories and non-git directories.

---

## Security Model

DevPilot AI is engineered from the ground up with a defense-in-depth security model:

1. **Electron Hardening**:
   - `contextIsolation: true`: Prevents renderer scripts from accessing preload or Electron internal APIs.
   - `nodeIntegration: false`: Renderer has zero access to Node.js `fs`, `child_process`, or global modules.
   - `sandbox: true`: Restricts renderer code inside Electron's OS-level sandbox.
   - `webSecurity: true`: Enforces same-origin policy and blocks insecure content.
   - `allowRunningInsecureContent: false`: Disallows mixed-content scripts or stylesheets.
   - Navigation guards: Top-level navigation (`will-navigate`) and unauthorized popups (`setWindowOpenHandler`) are blocked, routing approved external web links to the operating system's default browser via `shell.openExternal`.
   - Disables `<webview>` tags and blocks device permission requests.

2. **Subprocess & CLI Argument Injection Defense**:
   - Subprocess commands are invoked strictly using `child_process.execFile` with discrete argument arrays—never using `child_process.exec`, eliminating shell string interpolation and command chaining vulnerabilities.
   - Path arguments are preceded by the standard `--` argument delimiter (e.g., `git diff --staged -M -- <path>`), preventing file paths starting with dashes from being interpreted as CLI flags.

3. **Strict Read-Only Guarantee**:
   - DevPilot AI implements only read-only Git commands:
     - `git rev-parse --is-inside-work-tree --show-toplevel`
     - `git branch --show-current` / `git rev-parse --short HEAD`
     - `git status --porcelain=v1 -z -uall`
     - `git diff --staged -M -- <path>`
   - Mutative Git commands (`add`, `commit`, `push`, `pull`, `checkout`, `reset`, `clean`, `rebase`) are completely absent from the codebase.
   - Subprocess environment variables disable pagers and interactive credential prompts (`GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=cat`).

---

## License

Private / Proprietary.
