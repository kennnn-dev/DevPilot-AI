import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import { withTestRepo, createTestGitRepo, type TestGitRepo } from '../helpers/gitRepoHelper';
import { gitService } from '../../src/main/git/gitService';

describe('gitService Integration Tests (Real Git CLI)', () => {
  let sharedRepo: TestGitRepo;

  beforeAll(async () => {
    sharedRepo = await createTestGitRepo({ defaultBranch: 'main', initialCommit: true });
  });

  afterAll(async () => {
    await sharedRepo.cleanup();
  });

  describe('getStatus Operations', () => {
    it('returns working tree clean on a newly committed repository', async () => {
      const result = await gitService.getStatus(sharedRepo.repoPath);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.branch).toBe('main');
      expect(result.data?.isDetached).toBe(false);
      expect(result.data?.staged).toHaveLength(0);
      expect(result.data?.unstaged).toHaveLength(0);
      expect(result.data?.untracked).toHaveLength(0);
    });

    it('accurately categorizes staged, unstaged, and untracked changes', async () => {
      await withTestRepo(async (repo) => {
        // Initial commit
        repo.createFile('tracked.txt', 'line 1\n');
        repo.stageAndCommit('Initial', 'tracked.txt');

        // Staged addition
        repo.createFile('staged-new.txt', 'staged content\n');
        repo.stage('staged-new.txt');

        // Unstaged modification
        repo.appendToFile('tracked.txt', 'line 2\n');

        // Untracked file
        repo.createFile('untracked.txt', 'untracked content\n');

        const result = await gitService.getStatus(repo.repoPath);
        expect(result.success).toBe(true);

        const { staged, unstaged, untracked } = result.data!;

        expect(staged).toHaveLength(1);
        expect(staged[0].path).toBe('staged-new.txt');
        expect(staged[0].changeType).toBe('added');

        expect(unstaged).toHaveLength(1);
        expect(unstaged[0].path).toBe('tracked.txt');
        expect(unstaged[0].changeType).toBe('modified');

        expect(untracked).toHaveLength(1);
        expect(untracked[0].path).toBe('untracked.txt');
        expect(untracked[0].changeType).toBe('untracked');
      });
    });

    it('assigns partially staged files (MM) to both staged and unstaged lists', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('partially.txt', 'base content\n');
        repo.stageAndCommit('Add base', 'partially.txt');

        // Modify and stage
        repo.appendToFile('partially.txt', 'staged line\n');
        repo.stage('partially.txt');

        // Modify again without staging
        repo.appendToFile('partially.txt', 'unstaged line\n');

        const result = await gitService.getStatus(repo.repoPath);
        expect(result.success).toBe(true);

        const { staged, unstaged } = result.data!;
        expect(staged.some((f) => f.path === 'partially.txt')).toBe(true);
        expect(unstaged.some((f) => f.path === 'partially.txt')).toBe(true);
      });
    });

    it('detects renamed files and captures oldPath', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('orig.txt', 'file content\n');
        repo.stageAndCommit('Commit orig', 'orig.txt');

        repo.rename('orig.txt', 'renamed.txt');

        const result = await gitService.getStatus(repo.repoPath);
        expect(result.success).toBe(true);

        const { staged } = result.data!;
        expect(staged).toHaveLength(1);
        expect(staged[0].path).toBe('renamed.txt');
        expect(staged[0].oldPath).toBe('orig.txt');
        expect(staged[0].changeType).toBe('renamed');
      });
    });

    it('detects active feature branch and detached HEAD states', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('file.txt', 'v1\n');
        const commitHash = repo.stageAndCommit('Commit 1', 'file.txt');

        // Create and switch branch
        repo.createBranch('feature/awesome');
        const branchRes = await gitService.getStatus(repo.repoPath);
        expect(branchRes.data?.branch).toBe('feature/awesome');
        expect(branchRes.data?.isDetached).toBe(false);

        // Checkout detached HEAD
        repo.checkoutDetach(commitHash);
        const detachedRes = await gitService.getStatus(repo.repoPath);
        expect(detachedRes.data?.isDetached).toBe(true);
        expect(detachedRes.data?.branch).toMatch(/HEAD detached at/);
      });
    });

    it('handles unborn branch (0 commits) without crashing', async () => {
      await withTestRepo(async (repo) => {
        // Fresh repo with 0 commits
        const result = await gitService.getStatus(repo.repoPath);
        expect(result.success).toBe(true);
        expect(result.data?.branch).toBe('main');
        expect(result.data?.isDetached).toBe(false);
      });
    });
  });

  describe('getStagedDiff Operations', () => {
    it('retrieves additions for a staged text file', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('sample.txt', 'Hello World\nSecond line\n');
        repo.stage('sample.txt');

        const result = await gitService.getStagedDiff(repo.repoPath, 'sample.txt');
        expect(result.success).toBe(true);
        expect(result.data?.isBinary).toBe(false);
        expect(result.data?.isEmpty).toBe(false);
        expect(result.data?.hunks.length).toBeGreaterThan(0);

        const firstHunk = result.data!.hunks[0];
        expect(firstHunk.lines.some((l) => l.type === 'add' && l.content.includes('Hello World'))).toBe(true);
      });
    });

    it('retrieves diff for modified file with both additions and deletions', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('test.txt', 'original line\n');
        repo.stageAndCommit('Add test.txt', 'test.txt');

        repo.modifyFile('test.txt', 'updated line\n');
        repo.stage('test.txt');

        const result = await gitService.getStagedDiff(repo.repoPath, 'test.txt');
        expect(result.success).toBe(true);
        expect(result.data?.isBinary).toBe(false);

        const lines = result.data!.hunks.flatMap((h) => h.lines);
        expect(lines.some((l) => l.type === 'delete' && l.content.includes('original line'))).toBe(true);
        expect(lines.some((l) => l.type === 'add' && l.content.includes('updated line'))).toBe(true);
      });
    });

    it('detects binary files correctly', async () => {
      await withTestRepo(async (repo) => {
        repo.createBinaryFile('image.png', 128);
        repo.stage('image.png');

        const result = await gitService.getStagedDiff(repo.repoPath, 'image.png');
        expect(result.success).toBe(true);
        expect(result.data?.isBinary).toBe(true);
        expect(result.data?.isEmpty).toBe(false);
        expect(result.data?.hunks).toHaveLength(0);
      });
    });

    it('identifies 0-byte added file as isEmpty: true', async () => {
      await withTestRepo(async (repo) => {
        repo.createFile('empty.txt', '');
        repo.stage('empty.txt');

        const result = await gitService.getStagedDiff(repo.repoPath, 'empty.txt');
        expect(result.success).toBe(true);
        expect(result.data?.isEmpty).toBe(true);
        expect(result.data?.isBinary).toBe(false);
        expect(result.data?.hunks).toHaveLength(0);
      });
    });

    it('safely handles non-existent files in repository', async () => {
      const result = await gitService.getStagedDiff(sharedRepo.repoPath, 'does_not_exist.txt');
      expect(result.success).toBe(true);
      expect(result.data?.isEmpty).toBe(true);
      expect(result.data?.hunks).toHaveLength(0);
    });
  });

  describe('Error Boundary & Non-Git Directories', () => {
    it('returns error when given a non-git directory', async () => {
      const tempNonGit = os.tmpdir();
      const result = await gitService.getStatus(tempNonGit);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Not a valid Git repository|Not a git repository/);
    });

    it('returns error for non-existent directory', async () => {
      const result = await gitService.getStatus('/non/existent/path/123456');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
