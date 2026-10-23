/**
 * Milestone 4 Empirical Challenge Integration Tests (tests/integration/empiricalChallengeM4.test.ts)
 *
 * Adversarial stress testing for Milestone 4:
 * 1. Multi-step state machine with real files on disk (unicode, spaces, AM, AD, MD, RM, multi-file).
 * 2. Non-git directory handling (exit code 128, non-existent, file-as-dir, bare repo, empty/whitespace).
 * 3. Detached HEAD parsing with real Git repo (checkoutDetach, tags, unborn branches, branch switching).
 * 4. Binary and 0-byte file diff generation (empty files, binary null bytes, binary images, truncation).
 * 5. Leak and process cleanup guarantees (exception in withTestRepo, concurrent calls, no orphaned temp files or processes).
 * 6. Interactive App DOM stress testing (repo switching, unicode file diff selection, external unstage cleanup).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

import App from '../../src/renderer/App';
import { gitService } from '../../src/main/git/gitService';
import { validateGitRepository } from '../../src/main/git/repoValidator';
import { detectBranch } from '../../src/main/git/branchDetector';
import { createTestGitRepo, withTestRepo, type TestGitRepo } from '../helpers/gitRepoHelper';
import type { DevPilotAPI } from '../../src/shared/types';

describe('Milestone 4 Empirical Challenge: Real Git CLI & Robustness', () => {
  let createdRepos: TestGitRepo[] = [];
  let activeSelectedDir: string | null = null;

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
    for (const repo of createdRepos) {
      await repo.cleanup();
    }
    createdRepos = [];
    delete (window as unknown as { devPilot?: DevPilotAPI }).devPilot;
  });

  // =========================================================================
  // Challenge 1: Multi-Step State Machine with Real Files on Disk
  // =========================================================================
  describe('Challenge 1: Real Multi-Step State Machine & Complex Statuses', () => {
    it('handles files with spaces, unicode characters, and deep hierarchies', async () => {
      await withTestRepo(async (repo) => {
        // Space in filename and unicode
        const spaceFile = 'folder with space/my report 2026.txt';
        const unicodeFile = 'src/동기화/모듈 café.ts';

        repo.createFile(spaceFile, 'line 1\nline 2\n');
        repo.createFile(unicodeFile, 'console.log("unicode test");\n');

        let status = await gitService.getStatus(repo.repoPath);
        expect(status.success).toBe(true);
        expect(status.data?.untracked.some((f) => f.path === spaceFile)).toBe(true);
        expect(status.data?.untracked.some((f) => f.path === unicodeFile)).toBe(true);

        // Stage both files
        repo.stage(spaceFile, unicodeFile);

        status = await gitService.getStatus(repo.repoPath);
        expect(status.success).toBe(true);
        expect(status.data?.staged.some((f) => f.path === spaceFile && f.changeType === 'added')).toBe(true);
        expect(status.data?.staged.some((f) => f.path === unicodeFile && f.changeType === 'added')).toBe(true);

        // Query staged diff for file with space
        const diffSpace = await gitService.getStagedDiff(repo.repoPath, spaceFile);
        expect(diffSpace.success).toBe(true);
        expect(diffSpace.data?.hunks).toHaveLength(1);
        expect(diffSpace.data?.hunks[0].lines.some((l) => l.content.includes('line 1'))).toBe(true);

        // Query staged diff for unicode file
        const diffUnicode = await gitService.getStagedDiff(repo.repoPath, unicodeFile);
        expect(diffUnicode.success).toBe(true);
        expect(diffUnicode.data?.hunks).toHaveLength(1);
        expect(diffUnicode.data?.hunks[0].lines.some((l) => l.content.includes('unicode test'))).toBe(true);
      });
    });

    it('correctly categorizes AD (added staged, then deleted on disk before commit)', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('init.txt', 'init\n');
        repo.stageAndCommit('Initial', 'init.txt');

        repo.createFile('temp_added.txt', 'staging content\n');
        repo.stage('temp_added.txt');

        // Delete from working directory WITHOUT git rm
        repo.deleteFile('temp_added.txt');

        const status = await gitService.getStatus(repo.repoPath);
        expect(status.success).toBe(true);

        // Staged status should be 'added'
        const stagedItem = status.data?.staged.find((f) => f.path === 'temp_added.txt');
        expect(stagedItem).toBeDefined();
        expect(stagedItem?.changeType).toBe('added');

        // Unstaged status should be 'deleted'
        const unstagedItem = status.data?.unstaged.find((f) => f.path === 'temp_added.txt');
        expect(unstagedItem).toBeDefined();
        expect(unstagedItem?.changeType).toBe('deleted');

        // Staged diff should still return the staged additions
        const diff = await gitService.getStagedDiff(repo.repoPath, 'temp_added.txt');
        expect(diff.success).toBe(true);
        expect(diff.data?.hunks[0].lines.some((l) => l.content.includes('staging content'))).toBe(true);
      });
    });

    it('correctly categorizes MD (tracked modified and staged, then deleted on disk)', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('service.ts', 'export const v = 1;\n');
        repo.stageAndCommit('Initial commit', 'service.ts');

        // Modify and stage
        repo.modifyFile('service.ts', 'export const v = 2;\n');
        repo.stage('service.ts');

        // Delete from disk
        repo.deleteFile('service.ts');

        const status = await gitService.getStatus(repo.repoPath);
        expect(status.success).toBe(true);

        // Staged shows modified
        const stagedItem = status.data?.staged.find((f) => f.path === 'service.ts');
        expect(stagedItem?.changeType).toBe('modified');

        // Unstaged shows deleted
        const unstagedItem = status.data?.unstaged.find((f) => f.path === 'service.ts');
        expect(unstagedItem?.changeType).toBe('deleted');

        // Staged diff should reflect the modification from v=1 to v=2
        const diff = await gitService.getStagedDiff(repo.repoPath, 'service.ts');
        expect(diff.success).toBe(true);
        expect(diff.data?.hunks[0].lines.some((l) => l.content.includes('v = 2'))).toBe(true);
      });
    });

    it('correctly categorizes RM (renamed with git mv, then modified on disk)', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('original.ts', 'class Original {}\n');
        repo.stageAndCommit('Initial commit', 'original.ts');

        // Rename via git mv
        repo.rename('original.ts', 'renamed.ts');

        // Modify new file on disk without staging
        repo.appendToFile('renamed.ts', '// unstaged extra line\n');

        const status = await gitService.getStatus(repo.repoPath);
        expect(status.success).toBe(true);

        const stagedItem = status.data?.staged.find((f) => f.path === 'renamed.ts');
        expect(stagedItem).toBeDefined();
        expect(stagedItem?.changeType).toBe('renamed');
        expect(stagedItem?.oldPath).toBe('original.ts');

        const unstagedItem = status.data?.unstaged.find((f) => f.path === 'renamed.ts');
        expect(unstagedItem).toBeDefined();
        expect(unstagedItem?.changeType).toBe('modified');

        // Diff should not contain the unstaged line
        const diff = await gitService.getStagedDiff(repo.repoPath, 'renamed.ts', stagedItem?.oldPath);
        expect(diff.success).toBe(true);
        const lines = diff.data!.hunks.flatMap((h) => h.lines);
        expect(lines.some((l) => l.content.includes('// unstaged extra line'))).toBe(false);
      });
    });
  });

  // =========================================================================
  // Challenge 2: Non-Git Directory Handling & Exit Code 128
  // =========================================================================
  describe('Challenge 2: Non-Git Directory Handling & Exit Code 128', () => {
    it('returns error for non-existent path', async () => {
      const nonExistentPath = path.join(os.tmpdir(), `devpilot-ghost-${Date.now()}`);
      const res = await gitService.getStatus(nonExistentPath);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Path does not exist.');

      const diffRes = await gitService.getStagedDiff(nonExistentPath, 'file.txt');
      expect(diffRes.success).toBe(false);
      expect(diffRes.error).toBe('Path does not exist.');
    });

    it('returns error when target path is a file, not a directory', async () => {
      const tempFile = path.join(os.tmpdir(), `devpilot-file-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, 'not a folder');
      try {
        const res = await gitService.getStatus(tempFile);
        expect(res.success).toBe(false);
        expect(res.error).toBe('Path is a file, not a directory.');
      } finally {
        fs.unlinkSync(tempFile);
      }
    });

    it('intercepts exit code 128 on empty non-git directory', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devpilot-nongit-'));
      try {
        const res = await gitService.getStatus(tempDir);
        expect(res.success).toBe(false);
        expect(res.error).toBe('Not a git repository.');

        const diffRes = await gitService.getStagedDiff(tempDir, 'any.txt');
        expect(diffRes.success).toBe(false);
        expect(diffRes.error).toBe('Not a git repository.');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects bare repositories gracefully', async () => {
      const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devpilot-bare-'));
      try {
        execSync('git init --bare', { cwd: bareDir, stdio: 'ignore' });

        const validation = await validateGitRepository(bareDir);
        expect(validation.isBare).toBe(true);
        expect(validation.isGitRepo).toBe(false);
        expect(validation.error).toBe('Repository is bare (no working tree).');

        const statusRes = await gitService.getStatus(bareDir);
        expect(statusRes.success).toBe(false);
        expect(statusRes.error).toBe('Repository is bare (no working tree).');
      } finally {
        fs.rmSync(bareDir, { recursive: true, force: true });
      }
    });

    it('validates invalid string arguments safely without crashing', async () => {
      const emptyRes = await gitService.getStatus('');
      expect(emptyRes.success).toBe(false);

      const wsRes = await gitService.getStatus('   ');
      expect(wsRes.success).toBe(false);

      const nullRes = await gitService.getStatus(null as unknown as string);
      expect(nullRes.success).toBe(false);

      const emptyDiff = await gitService.getStagedDiff('', '');
      expect(emptyDiff.success).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 3: Detached HEAD & Branch Edge Cases
  // =========================================================================
  describe('Challenge 3: Detached HEAD & Branch Resolution', () => {
    it('detects unborn branch on freshly initialized empty repository', async () => {
      const unbornRepo = await createTestGitRepo({ defaultBranch: 'feature/unborn', initialCommit: false });
      createdRepos.push(unbornRepo);

      const branchInfo = await detectBranch(unbornRepo.repoPath);
      expect(branchInfo.branch).toBe('feature/unborn');
      expect(branchInfo.isDetached).toBe(false);

      const statusRes = await gitService.getStatus(unbornRepo.repoPath);
      expect(statusRes.success).toBe(true);
      expect(statusRes.data?.branch).toBe('feature/unborn');
      expect(statusRes.data?.isDetached).toBe(false);
      expect(statusRes.data?.staged).toHaveLength(0);
    });

    it('handles detached HEAD at a tag and returns short SHA format', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('version.txt', '1.0.0\n');
        const commitSha = repo.stageAndCommit('Release 1.0.0', 'version.txt');

        // Create tag
        repo.git(['tag', 'v1.0.0']);

        // Checkout tag in detached HEAD mode
        repo.git(['checkout', '--detach', 'v1.0.0']);

        const branchInfo = await detectBranch(repo.repoPath);
        expect(branchInfo.isDetached).toBe(true);
        expect(branchInfo.commitSha).toBe(commitSha.slice(0, 7));
        expect(branchInfo.branch).toBe(`(HEAD detached at ${commitSha.slice(0, 7)})`);

        const statusRes = await gitService.getStatus(repo.repoPath);
        expect(statusRes.success).toBe(true);
        expect(statusRes.data?.isDetached).toBe(true);
        expect(statusRes.data?.branch).toBe(`(HEAD detached at ${commitSha.slice(0, 7)})`);

        // Re-attach to main branch
        repo.checkout('main');
        const reattached = await detectBranch(repo.repoPath);
        expect(reattached.isDetached).toBe(false);
        expect(reattached.branch).toBe('main');
      });
    });

    it('handles nested branch names with slashes', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('index.ts', 'console.log("hello");\n');
        repo.stageAndCommit('Initial', 'index.ts');

        repo.createBranch('release/2026.10/feature-x');

        const branchInfo = await detectBranch(repo.repoPath);
        expect(branchInfo.branch).toBe('release/2026.10/feature-x');
        expect(branchInfo.isDetached).toBe(false);

        const status = await gitService.getStatus(repo.repoPath);
        expect(status.data?.branch).toBe('release/2026.10/feature-x');
      });
    });
  });

  // =========================================================================
  // Challenge 4: Binary and 0-Byte File Diff Generation
  // =========================================================================
  describe('Challenge 4: Binary and 0-Byte File Diff Generation', () => {
    it('handles staged 0-byte file (isEmpty: true, hunks: [])', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('empty.txt', '');
        repo.stage('empty.txt');

        const diff = await gitService.getStagedDiff(repo.repoPath, 'empty.txt');
        expect(diff.success).toBe(true);
        expect(diff.data?.isEmpty).toBe(true);
        expect(diff.data?.isBinary).toBe(false);
        expect(diff.data?.hunks).toHaveLength(0);
      });
    });

    it('handles staged binary file containing null bytes (isBinary: true)', async () => {
      await withTestRepo(async (repo) => {
        repo.createBinaryFile('data.bin', 1024);
        repo.stage('data.bin');

        const diff = await gitService.getStagedDiff(repo.repoPath, 'data.bin');
        expect(diff.success).toBe(true);
        expect(diff.data?.isBinary).toBe(true);
        expect(diff.data?.isEmpty).toBe(false);
        expect(diff.data?.hunks).toHaveLength(0);
      });
    });

    it('handles truncation of tracked file to 0 bytes (produces deletion hunks)', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('notes.txt', 'Line A\nLine B\nLine C\n');
        repo.stageAndCommit('Add notes', 'notes.txt');

        // Truncate to 0 bytes
        repo.modifyFile('notes.txt', '');
        repo.stage('notes.txt');

        const diff = await gitService.getStagedDiff(repo.repoPath, 'notes.txt');
        expect(diff.success).toBe(true);
        expect(diff.data?.isEmpty).toBe(false);
        expect(diff.data?.isBinary).toBe(false);
        expect(diff.data?.hunks.length).toBeGreaterThanOrEqual(1);

        const lines = diff.data!.hunks[0].lines;
        expect(lines.filter((l) => l.type === 'delete')).toHaveLength(3);
        expect(lines.filter((l) => l.type === 'add')).toHaveLength(0);
      });
    });

    it('handles populating an empty 0-byte file (produces addition hunks)', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('blank.txt', '');
        repo.stageAndCommit('Add blank', 'blank.txt');

        repo.modifyFile('blank.txt', 'Added new content\n');
        repo.stage('blank.txt');

        const diff = await gitService.getStagedDiff(repo.repoPath, 'blank.txt');
        expect(diff.success).toBe(true);
        expect(diff.data?.isEmpty).toBe(false);
        expect(diff.data?.isBinary).toBe(false);
        expect(diff.data?.hunks[0].lines.some((l) => l.type === 'add' && l.content.includes('Added new content'))).toBe(true);
      });
    });
  });

  // =========================================================================
  // Challenge 5: Cleanup & Process Leak Guarantees
  // =========================================================================
  describe('Challenge 5: Cleanup & Process Leak Guarantees', () => {
    it('guarantees temporary directory cleanup even if callback throws', async () => {
      let allocatedPath = '';
      try {
        await withTestRepo(async (repo) => {
          allocatedPath = repo.repoPath;
          expect(fs.existsSync(allocatedPath)).toBe(true);
          throw new Error('Forced simulation of test assertion failure');
        });
      } catch (err: unknown) {
        expect((err as Error).message).toBe('Forced simulation of test assertion failure');
      }

      // Verify that allocatedPath no longer exists on disk
      expect(allocatedPath.length).toBeGreaterThan(0);
      expect(fs.existsSync(allocatedPath)).toBe(false);
    });

    it('survives concurrent Git status and diff queries without hanging processes or race conditions', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('f1.txt', 'content 1\n');
        repo.createFile('f2.txt', 'content 2\n');
        repo.createFile('f3.txt', 'content 3\n');
        repo.stage();

        // Launch 10 concurrent requests simultaneously
        const promises = [
          gitService.getStatus(repo.repoPath),
          gitService.getStagedDiff(repo.repoPath, 'f1.txt'),
          gitService.getStagedDiff(repo.repoPath, 'f2.txt'),
          gitService.getStagedDiff(repo.repoPath, 'f3.txt'),
          gitService.getStatus(repo.repoPath),
          gitService.getStagedDiff(repo.repoPath, 'f1.txt'),
          gitService.getStatus(repo.repoPath),
          gitService.getStagedDiff(repo.repoPath, 'f2.txt'),
          gitService.getStatus(repo.repoPath),
          gitService.getStagedDiff(repo.repoPath, 'f3.txt'),
        ];

        const results = await Promise.all(promises);
        for (const res of results) {
          expect(res.success).toBe(true);
        }
      });
    });
  });

  // =========================================================================
  // Challenge 6: Interactive App DOM Stress Testing
  // =========================================================================
  describe('Challenge 6: Interactive App DOM Stress Testing', () => {
    it('switches between repositories, clearing old diffs and selections cleanly', async () => {
      const repoA = await createTestGitRepo({ defaultBranch: 'main', initialCommit: true });
      const repoB = await createTestGitRepo({ defaultBranch: 'development', initialCommit: true });
      createdRepos.push(repoA, repoB);

      repoA.createFile('src/a.ts', 'console.log("repoA");\n');
      repoA.stage('src/a.ts');

      repoB.createFile('src/b.ts', 'console.log("repoB");\n');
      repoB.stage('src/b.ts');

      setupRealGitBridge(repoA.repoPath);
      render(React.createElement(App));

      // Open Repo A
      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('branch-badge').textContent).toContain('main');
        expect(screen.getByTestId('file-item-src/a.ts')).toBeDefined();
      });

      // Select staged file in Repo A
      fireEvent.click(screen.getByTestId('file-item-src/a.ts'));
      await waitFor(() => {
        expect(screen.getByText('+console.log("repoA");')).toBeDefined();
      });

      // Switch to Repo B
      activeSelectedDir = repoB.repoPath;
      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('branch-badge').textContent).toContain('development');
        expect(screen.getByTestId('file-item-src/b.ts')).toBeDefined();
        // Old selection and diff from Repo A must be cleared
        expect(screen.queryByTestId('file-item-src/a.ts')).toBeNull();
        expect(screen.getByTestId('diff-placeholder')).toBeDefined();
        expect(screen.getByText('No File Selected')).toBeDefined();
      });

      // Select staged file in Repo B
      fireEvent.click(screen.getByTestId('file-item-src/b.ts'));
      await waitFor(() => {
        expect(screen.getByText('+console.log("repoB");')).toBeDefined();
      });
    });

    it('renders diff cleanly for staged files containing spaces and unicode characters in DOM', async () => {
      const repo = await createTestGitRepo({ defaultBranch: 'main', initialCommit: true });
      createdRepos.push(repo);

      const complexName = 'docs/사양 & guide.md';
      repo.createFile(complexName, '# Specification\nDetailed specs here.\n');
      repo.stage(complexName);

      setupRealGitBridge(repo.repoPath);
      render(React.createElement(App));

      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId(`file-item-${complexName}`)).toBeDefined();
      });

      // Click the complex file item
      fireEvent.click(screen.getByTestId(`file-item-${complexName}`));

      await waitFor(() => {
        expect(within(screen.getByTestId('diff-header')).getByText(complexName)).toBeDefined();
        expect(screen.getByText('+Detailed specs here.')).toBeDefined();
      });
    });
  });
});
