# Original User Request

## Initial Request — 2026-10-22T07:44:52Z

Build the initial version of DevPilot AI, a clean desktop application for inspecting local Git repositories using Electron, React, TypeScript, and Vite. The tool operates strictly as a safe, read-only Git status and staged diff inspector for repositories used in VS Code.

Working directory: /home/wks-dev-17/Desktop/DevPilot
Integrity mode: development

## Requirements

### R1. Repository Selection & Navigation
Provide a native folder picker dialog via Electron IPC allowing the user to select an existing local Git repository. Display the path of the opened repository and the name of the active branch.

### R2. Real Git Status Inspection
Safely execute Git commands to query the repository's real working tree status (using real Git data only, no mock data). Present changed files categorized into three distinct sections:
- Staged changes
- Unstaged changes
- Untracked files
Provide a refresh action/button that re-runs Git queries and updates the view when working tree or staging status changes externally.

### R3. Staged Diff Viewer
When a staged file is selected from the file list, query and display its actual staged diff in a clean, readable diff view.

### R4. Security & Safety Guardrails
Enforce Electron security best practices (enable `contextIsolation`, disable `nodeIntegration`, expose safe APIs through a `preload` script). The application must be strictly read-only: do not modify files, change staging, commit, or push. Do not implement AI features in this milestone.

## Acceptance Criteria

### Automated Build & Code Verification
- [ ] TypeScript type checks (`tsc --noEmit`) complete with zero errors.
- [ ] Production build (`npm run build` or equivalent) compiles the main, preload, and renderer bundles cleanly without errors.
- [ ] Unit and integration tests (via Vitest or Jest) are implemented and pass completely (`npm test`), verifying:
  - Git status parsing (branch, staged, unstaged, untracked)
  - Staged diff parsing / generation
  - Error handling when a selected folder is not a valid Git repository

### Application Functional Criteria
- [ ] Folder picker successfully triggers a native directory selection dialog and loads the chosen directory.
- [ ] UI displays the active Git branch and separates staged, unstaged, and untracked files accurately against real test Git repositories.
- [ ] Selecting a staged file renders the real `git diff --staged` output.
- [ ] Refresh button accurately updates file status after external Git changes.
- [ ] All IPC handlers are strictly read-only with no mutative Git operations.
- [ ] Documentation / README explains clearly how to install dependencies, run tests, and launch the desktop application in development mode.


## Follow-up — 2026-10-26T00:28:47Z

Refactor DevPilot's n8n webhook integration to provide a dedicated Settings interface for managing the webhook URL and API key, establish a seamless hybrid configuration with `.env` fallback, and ensure reliable dynamic dispatch of staged diffs for commit generation.

Working directory: /home/wks-dev-17/Desktop/DevPilot
Integrity mode: development

## Requirements

### R1. Centralized Settings Interface
Implement a dedicated Settings view or modal accessible from the Navigation Sidebar "Settings" action. It must allow users to view, configure, and persist their n8n webhook endpoint URL and API/bearer token.

### R2. Hybrid Configuration Resolution (.env Fallback)
Establish a configuration resolver where user-configured settings take precedence, while falling back to `.env` / environment variables (`DEVPILOT_WEBHOOK_URL`, `DEVPILOT_WEBHOOK_TOKEN`, `N8N_WEBHOOK_TOKEN`, etc.) when settings are not explicitly populated.

### R3. Dynamic Payload Construction & Dispatch
Refactor the n8n webhook integration and IPC bridge so commit generation dynamically uses the resolved webhook configuration without redundant prompt drawers. The payload must reliably package staged diffs, branch details, and repository status, with robust error and timeout handling.

### R4. Test Coverage & Code Quality
Maintain code cleanliness and add automated test coverage verifying the settings resolver, fallback logic, and webhook payload dispatching. Ensure all typechecks and unit tests pass.

## Acceptance Criteria

### Settings & Configuration
- [ ] Clicking "Settings" in the Navigation Sidebar opens the settings modal/view.
- [ ] Users can enter, edit, and save the n8n webhook URL and authorization token.
- [ ] Configuration is persisted across application restarts.
- [ ] When settings are empty, the app falls back gracefully to `.env` values (if defined).

### n8n Integration & Commit Generator
- [ ] The Commit Generator utilizes the active n8n configuration without requiring users to re-enter settings inside the panel.
- [ ] Dynamic payloads include staged file changes, diff summary, and repository metadata.
- [ ] Connection failures, invalid URLs, and authentication errors surface actionable user-facing messages.

### Verification
- [ ] Automated unit tests pass via `npm test`.
- [ ] TypeScript typechecking passes cleanly via `npm run typecheck`.
