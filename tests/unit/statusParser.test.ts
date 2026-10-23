import { describe, it, expect } from 'vitest';
import { parseStatusOutput, mapStagedChangeType, mapUnstagedChangeType } from '../../src/main/git/statusParser';

describe('statusParser unit tests (src/main/git/statusParser.ts)', () => {
  describe('empty and clean states', () => {
    it('returns empty collections for empty string input', () => {
      const res = parseStatusOutput('');
      expect(res.staged).toEqual([]);
      expect(res.unstaged).toEqual([]);
      expect(res.untracked).toEqual([]);
    });

    it('returns empty collections for single null byte', () => {
      const res = parseStatusOutput('\0');
      expect(res.staged).toEqual([]);
      expect(res.unstaged).toEqual([]);
      expect(res.untracked).toEqual([]);
    });
  });

  describe('single change categorizations', () => {
    it('parses staged modified file (M )', () => {
      const raw = 'M  src/app.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        { path: 'src/app.ts', changeType: 'modified', statusCode: 'M ' },
      ]);
      expect(res.unstaged).toEqual([]);
      expect(res.untracked).toEqual([]);
    });

    it('parses staged added file (A )', () => {
      const raw = 'A  src/components/Header.tsx\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        { path: 'src/components/Header.tsx', changeType: 'added', statusCode: 'A ' },
      ]);
      expect(res.unstaged).toEqual([]);
      expect(res.untracked).toEqual([]);
    });

    it('parses staged deleted file (D )', () => {
      const raw = 'D  legacy.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        { path: 'legacy.ts', changeType: 'deleted', statusCode: 'D ' },
      ]);
      expect(res.unstaged).toEqual([]);
      expect(res.untracked).toEqual([]);
    });

    it('parses unstaged modified file ( M)', () => {
      const raw = ' M src/app.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([]);
      expect(res.unstaged).toEqual([
        { path: 'src/app.ts', changeType: 'modified', statusCode: ' M' },
      ]);
      expect(res.untracked).toEqual([]);
    });

    it('parses unstaged deleted file ( D)', () => {
      const raw = ' D old_asset.png\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([]);
      expect(res.unstaged).toEqual([
        { path: 'old_asset.png', changeType: 'deleted', statusCode: ' D' },
      ]);
      expect(res.untracked).toEqual([]);
    });

    it('parses unstaged type changed file ( T)', () => {
      const raw = ' T symlink_file\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([]);
      expect(res.unstaged).toEqual([
        { path: 'symlink_file', changeType: 'modified', statusCode: ' T' },
      ]);
      expect(res.untracked).toEqual([]);
    });

    it('parses untracked file (??)', () => {
      const raw = '?? new_notes.md\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([]);
      expect(res.unstaged).toEqual([]);
      expect(res.untracked).toEqual([
        { path: 'new_notes.md', changeType: 'untracked', statusCode: '??' },
      ]);
    });

    it('ignores ignored file entries (!!)', () => {
      const raw = '!! dist/bundle.js\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([]);
      expect(res.unstaged).toEqual([]);
      expect(res.untracked).toEqual([]);
    });
  });

  describe('dual changes (partially staged files)', () => {
    it('categorizes MM file into both staged and unstaged lists', () => {
      const raw = 'MM src/dual.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        { path: 'src/dual.ts', changeType: 'modified', statusCode: 'MM' },
      ]);
      expect(res.unstaged).toEqual([
        { path: 'src/dual.ts', changeType: 'modified', statusCode: 'MM' },
      ]);
      expect(res.untracked).toEqual([]);
    });

    it('categorizes AM file into staged added and unstaged modified', () => {
      const raw = 'AM src/newDual.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        { path: 'src/newDual.ts', changeType: 'added', statusCode: 'AM' },
      ]);
      expect(res.unstaged).toEqual([
        { path: 'src/newDual.ts', changeType: 'modified', statusCode: 'AM' },
      ]);
      expect(res.untracked).toEqual([]);
    });

    it('categorizes MD file into staged modified and unstaged deleted', () => {
      const raw = 'MD src/deletedWorktree.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        { path: 'src/deletedWorktree.ts', changeType: 'modified', statusCode: 'MD' },
      ]);
      expect(res.unstaged).toEqual([
        { path: 'src/deletedWorktree.ts', changeType: 'deleted', statusCode: 'MD' },
      ]);
    });
  });

  describe('renames and copies extraction', () => {
    it('parses staged rename (R ) and extracts both path and oldPath', () => {
      const raw = 'R  dest/new_name.ts\0src/old_name.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        {
          path: 'dest/new_name.ts',
          oldPath: 'src/old_name.ts',
          changeType: 'renamed',
          statusCode: 'R ',
        },
      ]);
      expect(res.unstaged).toEqual([]);
    });

    it('parses staged copy (C ) and extracts both path and oldPath', () => {
      const raw = 'C  dest/copy.ts\0src/orig.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        {
          path: 'dest/copy.ts',
          oldPath: 'src/orig.ts',
          changeType: 'copied',
          statusCode: 'C ',
        },
      ]);
      expect(res.unstaged).toEqual([]);
    });

    it('parses staged rename with unstaged modification (RM)', () => {
      const raw = 'RM dest/renamed.ts\0src/original.ts\0';
      const res = parseStatusOutput(raw);
      expect(res.staged).toEqual([
        {
          path: 'dest/renamed.ts',
          oldPath: 'src/original.ts',
          changeType: 'renamed',
          statusCode: 'RM',
        },
      ]);
      expect(res.unstaged).toEqual([
        {
          path: 'dest/renamed.ts',
          changeType: 'modified',
          statusCode: 'RM',
        },
      ]);
    });
  });

  describe('special characters, spaces, and UTF-8 unicode', () => {
    it('preserves spaces within file paths accurately', () => {
      const raw = 'M  docs/Project Roadmap 2026.docx\0';
      const res = parseStatusOutput(raw);
      expect(res.staged[0].path).toBe('docs/Project Roadmap 2026.docx');
    });

    it('preserves UTF-8 emojis and multi-byte characters accurately', () => {
      const raw = 'A  src/intl/🚀 國際化_공지사항.ts\0?? docs/テスト.md\0';
      const res = parseStatusOutput(raw);
      expect(res.staged[0].path).toBe('src/intl/🚀 國際化_공지사항.ts');
      expect(res.untracked[0].path).toBe('docs/テスト.md');
    });
  });

  describe('mixed multi-entry status stream', () => {
    it('correctly categorizes a complex multi-file status payload', () => {
      const raw = [
        'M  stagedMod.ts',
        ' M unstagedMod.ts',
        'MM dualMod.ts',
        'A  added.ts',
        'D  deleted.ts',
        'R  newPath.ts\0oldPath.ts',
        '?? untracked1.ts',
        '?? untracked2.ts',
        '',
      ].join('\0');

      const res = parseStatusOutput(raw);
      expect(res.staged.length).toBe(5); // stagedMod, dualMod, added, deleted, newPath
      expect(res.unstaged.length).toBe(2); // unstagedMod, dualMod
      expect(res.untracked.length).toBe(2); // untracked1, untracked2

      expect(res.staged.map((f) => f.path)).toEqual([
        'stagedMod.ts',
        'dualMod.ts',
        'added.ts',
        'deleted.ts',
        'newPath.ts',
      ]);
      expect(res.staged.find((f) => f.path === 'newPath.ts')?.oldPath).toBe('oldPath.ts');
    });
  });

  describe('helper mappings', () => {
    it('maps staged and unstaged codes consistently', () => {
      expect(mapStagedChangeType('M')).toBe('modified');
      expect(mapStagedChangeType('A')).toBe('added');
      expect(mapStagedChangeType('D')).toBe('deleted');
      expect(mapStagedChangeType('R')).toBe('renamed');
      expect(mapStagedChangeType('C')).toBe('copied');
      expect(mapStagedChangeType('T')).toBe('modified');

      expect(mapUnstagedChangeType('M')).toBe('modified');
      expect(mapUnstagedChangeType('D')).toBe('deleted');
      expect(mapUnstagedChangeType('T')).toBe('modified');
    });
  });
});
