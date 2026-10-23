/**
 * End-to-End User Journey Integration Tests (tests/integration/e2eUserJourney.test.ts)
 *
 * Verifies the complete developer workflow against real dynamic Git repositories
 * created on disk via tests/helpers/gitRepoHelper.ts.
 *
 * Exercises:
 * 1. Non-git directory rejection and error banner presentation
 * 2. Opening a clean Git repository and active branch detection
 * 3. Progression: Untracked -> Staged -> Staged Diff Inspection
 * 4. Staging files and inspecting status (A, M, D, R)
 * 5. Querying real unified staged diff with hunks, line additions (+), deletions (-), and line numbers
 * 6. Dual-status file modifications (MM / AM) accurate dual categorization
 * 7. Staged binary file detection and UI warning presentation (isBinary: true)
 * 8. 0-byte added empty file diff handling (isEmpty: true)
 * 9. Renamed file diff inspection with oldPath tracking
 * 10. External branch switching and detached HEAD synchronization
 * 11. External commit lifecycle and automatic diff deselection upon refresh
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import os from 'node:os';

import App from '../../src/renderer/App';
import { gitService } from '../../src/main/git/gitService';
import { createTestGitRepo, withTestRepo, type TestGitRepo } from '../helpers/gitRepoHelper';
import type { DevPilotAPI } from '../../src/shared/types';

describe('Feature F22: End-to-End Real Git User Journey Integration Tests', () => {
  let testRepo: TestGitRepo | null = null;
  let activeSelectedDir: string | null = null;

  // Helper to wire window.devPilot to real gitService and controlled directory picker
  const setupRealGitBridge = (initialPath?: string) => {
    activeSelectedDir = initialPath ?? null;

    const realBridge: DevPilotAPI = {
      openDirectory: async () => activeSelectedDir,
      getStatus: async (repoPath: string) => {
        return await gitService.getStatus(repoPath);
      },
      getStagedDiff: async (repoPath: string, filePath: string, oldPath?: string) => {
        return await gitService.getStagedDiff(repoPath, filePath, oldPath);
      },
    };

    Object.defineProperty(window, 'devPilot', {
      value: realBridge,
      writable: true,
      configurable: true,
    });
  };

  afterEach(async () => {
    if (testRepo) {
      await testRepo.cleanup();
      testRepo = null;
    }
    delete (window as unknown as { devPilot?: DevPilotAPI }).devPilot;
  });

  // =========================================================================
  // Track 1: Complete Real Git Lifecycle & Contract Journey
  // =========================================================================
  describe('Track 1: Real Git Lifecycle & Service State Machine Journey', () => {
    it('executes the complete real Git development lifecycle continuously', async () => {
      await withTestRepo(async (repo) => {
        const repoPath = repo.repoPath;

        // Step 1: Newly initialized repo with initial commit -> Clean tree on branch 'main'
        repo.createFile('README.md', '# My Project\n');
        repo.stageAndCommit('Initial commit', 'README.md');

        let statusRes = await gitService.getStatus(repoPath);
        expect(statusRes.success).toBe(true);
        expect(statusRes.data?.branch).toBe('main');
        expect(statusRes.data?.isDetached).toBe(false);
        expect(statusRes.data?.staged).toHaveLength(0);
        expect(statusRes.data?.unstaged).toHaveLength(0);
        expect(statusRes.data?.untracked).toHaveLength(0);

        // Step 2: Developer creates an untracked file -> detected in untracked section
        repo.createFile('scratch.txt', 'developer notes\n');
        statusRes = await gitService.getStatus(repoPath);
        expect(statusRes.success).toBe(true);
        expect(statusRes.data?.untracked).toHaveLength(1);
        expect(statusRes.data?.untracked[0].path).toBe('scratch.txt');
        expect(statusRes.data?.staged).toHaveLength(0);

        // Step 3: Developer creates and stages feature file -> detected in staged additions ('A')
        repo.createFile('src/core.ts', 'export function run() {\n  return 42;\n}\n');
        repo.stage('src/core.ts');

        statusRes = await gitService.getStatus(repoPath);
        expect(statusRes.success).toBe(true);
        expect(statusRes.data?.staged).toHaveLength(1);
        expect(statusRes.data?.staged[0].path).toBe('src/core.ts');
        expect(statusRes.data?.staged[0].changeType).toBe('added');

        // Step 4: Inspect real staged diff of the newly added file with hunks and line additions (+)
        let diffRes = await gitService.getStagedDiff(repoPath, 'src/core.ts');
        expect(diffRes.success).toBe(true);
        expect(diffRes.data?.isBinary).toBe(false);
        expect(diffRes.data?.isEmpty).toBe(false);
        expect(diffRes.data?.hunks).toHaveLength(1);
        expect(diffRes.data?.hunks[0].newLines).toBe(3);
        expect(diffRes.data?.hunks[0].lines.some((l) => l.type === 'add' && l.content.includes('return 42'))).toBe(true);

        // Step 5: Partial staging (AM): Developer edits src/core.ts after staging
        repo.appendToFile('src/core.ts', '// unstaged comment\n');
        statusRes = await gitService.getStatus(repoPath);
        expect(statusRes.success).toBe(true);
        // Present in staged
        expect(statusRes.data?.staged.some((f) => f.path === 'src/core.ts')).toBe(true);
        // Also present in unstaged
        expect(statusRes.data?.unstaged.some((f) => f.path === 'src/core.ts')).toBe(true);

        // Staged diff should ONLY reflect staged lines, NOT unstaged additions
        diffRes = await gitService.getStagedDiff(repoPath, 'src/core.ts');
        expect(diffRes.success).toBe(true);
        const diffLines = diffRes.data!.hunks.flatMap((h) => h.lines);
        expect(diffLines.some((l) => l.content.includes('// unstaged comment'))).toBe(false);

        // Step 6: Binary file addition and diff detection (isBinary: true)
        repo.createBinaryFile('assets/logo.png', 128);
        repo.stage('assets/logo.png');

        statusRes = await gitService.getStatus(repoPath);
        expect(statusRes.data?.staged.some((f) => f.path === 'assets/logo.png')).toBe(true);

        const binaryDiffRes = await gitService.getStagedDiff(repoPath, 'assets/logo.png');
        expect(binaryDiffRes.success).toBe(true);
        expect(binaryDiffRes.data?.isBinary).toBe(true);
        expect(binaryDiffRes.data?.hunks).toHaveLength(0);

        // Step 7: 0-byte empty file addition (isEmpty: true)
        repo.createFile('empty.env', '');
        repo.stage('empty.env');

        const emptyDiffRes = await gitService.getStagedDiff(repoPath, 'empty.env');
        expect(emptyDiffRes.success).toBe(true);
        expect(emptyDiffRes.data?.isEmpty).toBe(true);
        expect(emptyDiffRes.data?.isBinary).toBe(false);

        // Step 8: Commit current staged changes to test modifications (M) and deletions (D)
        repo.stage('src/core.ts');
        repo.stageAndCommit('Commit feature files', 'README.md', 'src/core.ts', 'empty.env', 'assets/logo.png');

        // Modify tracked file and stage it ('M')
        repo.createFile('README.md', '# Updated Project\nDocumentation content\n');
        repo.stage('README.md');

        statusRes = await gitService.getStatus(repoPath);
        const modifiedFile = statusRes.data?.staged.find((f) => f.path === 'README.md');
        expect(modifiedFile).toBeDefined();
        expect(modifiedFile?.changeType).toBe('modified');

        const modDiff = await gitService.getStagedDiff(repoPath, 'README.md');
        expect(modDiff.success).toBe(true);
        expect(modDiff.data?.hunks.length).toBeGreaterThanOrEqual(1);
        expect(modDiff.data?.hunks[0].lines.some((l) => l.type === 'delete' && l.content.includes('My Project'))).toBe(true);
        expect(modDiff.data?.hunks[0].lines.some((l) => l.type === 'add' && l.content.includes('Updated Project'))).toBe(true);

        // Stage deletion of empty.env ('D')
        repo.deleteFile('empty.env');
        repo.stage('empty.env');

        statusRes = await gitService.getStatus(repoPath);
        const deletedFile = statusRes.data?.staged.find((f) => f.path === 'empty.env');
        expect(deletedFile).toBeDefined();
        expect(deletedFile?.changeType).toBe('deleted');

        // Step 9: Renaming a file using git mv and querying diff with oldPath ('R')
        repo.commit('Commit modified README and deleted empty.env');
        repo.rename('README.md', 'DOCUMENTATION.md');

        statusRes = await gitService.getStatus(repoPath);
        const renamed = statusRes.data?.staged.find((f) => f.path === 'DOCUMENTATION.md');
        expect(renamed).toBeDefined();
        expect(renamed?.changeType).toBe('renamed');
        expect(renamed?.oldPath).toBe('README.md');

        const renameDiff = await gitService.getStagedDiff(repoPath, 'DOCUMENTATION.md', renamed?.oldPath);
        expect(renameDiff.success).toBe(true);

        // Step 10: Branch creation and switching
        repo.createBranch('feature/v2');
        statusRes = await gitService.getStatus(repoPath);
        expect(statusRes.data?.branch).toBe('feature/v2');
        expect(statusRes.data?.isDetached).toBe(false);

        // Step 11: Detached HEAD detection
        const commitSha = repo.commit('Commit renames on feature branch');
        repo.checkoutDetach(commitSha);
        statusRes = await gitService.getStatus(repoPath);
        expect(statusRes.data?.isDetached).toBe(true);
        expect(statusRes.data?.branch).toMatch(/HEAD detached at/);

        // Step 12: Non-git directory validation returning graceful error (exit code 128)
        const nonGitRes = await gitService.getStatus(os.tmpdir());
        expect(nonGitRes.success).toBe(false);
        expect(nonGitRes.error).toMatch(/Not a (valid )?git repository/i);
      });
    });
  });

  // =========================================================================
  // Track 2: Interactive Real Git App User Journey (<App /> + DOM)
  // =========================================================================
  describe('Track 2: Interactive Real Git App User Journey (<App />)', () => {
    it('guides user through complete desktop app journey against dynamic Git repository', async () => {
      // 1. Provision a real dynamic Git repo
      testRepo = await createTestGitRepo({ defaultBranch: 'main', initialCommit: true });
      const repoPath = testRepo.repoPath;

      // 2. Setup the real Electron bridge
      setupRealGitBridge(repoPath);

      // 3. Render the full application
      render(React.createElement(App));

      // Verify Initial Standby UI
      expect(screen.getByTestId('app-container')).toBeDefined();
      expect(screen.getByTestId('sidebar-no-repo')).toBeDefined();
      expect(screen.getByTestId('diff-placeholder')).toBeDefined();

      // Step A: Handle Non-Git Directory Rejection (Exit code 128)
      activeSelectedDir = os.tmpdir(); // non-git folder
      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error-banner')).toBeDefined();
        expect(screen.getByText(/Not a valid Git repository|Not a git repository/)).toBeDefined();
      });

      // Dismiss the error banner
      fireEvent.click(screen.getByTitle('Dismiss error'));
      await waitFor(() => {
        expect(screen.queryByTestId('error-banner')).toBeNull();
      });

      // Step B: Open Valid Real Git Repository (Clean working tree)
      activeSelectedDir = repoPath;
      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('repo-path').textContent).toContain(repoPath);
        expect(screen.getByTestId('branch-badge').textContent).toContain('main');
        expect(screen.getByTestId('sidebar-clean')).toBeDefined();
        expect(screen.getByText('Working tree clean')).toBeDefined();
      });

      // Step C: Developer creates and stages a real file externally in the repository
      testRepo.createFile('src/auth.ts', 'export const isAuthenticated = (): boolean => true;\n');
      testRepo.stage('src/auth.ts');

      // Click Refresh button in Header
      fireEvent.click(screen.getByTestId('refresh-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('staged-section')).toBeDefined();
        expect(screen.getByTestId('file-item-src/auth.ts')).toBeDefined();
        expect(screen.getByText('1 staged, 0 unstaged, 0 untracked')).toBeDefined();
      });

      // Step D: Select staged file and verify real staged diff renders in DiffViewer
      fireEvent.click(screen.getByTestId('file-item-src/auth.ts'));

      await waitFor(() => {
        const diffHeader = screen.getByTestId('diff-header');
        expect(diffHeader).toBeDefined();
        expect(within(diffHeader).getByText('src/auth.ts')).toBeDefined();
        expect(screen.getByText('+export const isAuthenticated = (): boolean => true;')).toBeDefined();
      });

      // Step E: Developer modifies file after staging (partial staging AM) and adds untracked file
      testRepo.appendToFile('src/auth.ts', 'export const role = "admin";\n');
      testRepo.createFile('notes.txt', 'todo items\n');

      fireEvent.click(screen.getByTestId('refresh-btn'));

      await waitFor(() => {
        // Appears in staged section
        const stagedSection = screen.getByTestId('staged-section');
        expect(within(stagedSection).getByText('src/auth.ts')).toBeDefined();
        // Also appears in unstaged section
        const unstagedSection = screen.getByTestId('unstaged-section');
        expect(within(unstagedSection).getByText('src/auth.ts')).toBeDefined();
        // Appears in untracked section
        const untrackedSection = screen.getByTestId('untracked-section');
        expect(within(untrackedSection).getByText('notes.txt')).toBeDefined();
        expect(screen.getByText('1 staged, 1 unstaged, 1 untracked')).toBeDefined();
      });

      // Staged diff should remain isolated to the staged portion
      await waitFor(() => {
        expect(screen.getByText('+export const isAuthenticated = (): boolean => true;')).toBeDefined();
        expect(screen.queryByText('+export const role = "admin";')).toBeNull();
      });

      // Step F: Inspect a real binary staged file in the UI
      testRepo.createBinaryFile('assets/badge.png', 64);
      testRepo.stage('assets/badge.png');

      fireEvent.click(screen.getByTestId('refresh-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('file-item-assets/badge.png')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('file-item-assets/badge.png'));

      await waitFor(() => {
        expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
        expect(screen.getByText('Binary file diff cannot be viewed in text inspector.')).toBeDefined();
      });

      // Step G: External commit clears staged changes and resets DiffViewer
      testRepo.commit('Commit all staged files');

      fireEvent.click(screen.getByTestId('refresh-btn'));

      await waitFor(() => {
        expect(screen.getByText('No staged changes')).toBeDefined();
        expect(screen.queryByTestId('file-item-assets/badge.png')).toBeNull();
        expect(screen.getByTestId('diff-placeholder')).toBeDefined();
        expect(screen.getByText('No File Selected')).toBeDefined();
        expect(screen.getByText('0 staged, 1 unstaged, 1 untracked')).toBeDefined();
      });

      // Step H: External branch creation updates the branch badge
      testRepo.createBranch('feature/auth-guard');

      fireEvent.click(screen.getByTestId('refresh-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('branch-badge').textContent).toContain('feature/auth-guard');
      });

      // Step I: Staging and committing all remaining files returns to clean tree
      testRepo.stage();
      testRepo.commit('Commit remaining working tree changes');

      fireEvent.click(screen.getByTestId('refresh-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('staged-section')).toBeNull();
        expect(screen.getByTestId('sidebar-clean')).toBeDefined();
        expect(screen.getByText('Working tree clean')).toBeDefined();
        expect(screen.getByText('0 staged, 0 unstaged, 0 untracked')).toBeDefined();
      });
    });
  });
});
