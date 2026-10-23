import { describe, it, expect } from 'vitest';
import { parseDiffOutput } from '../../src/main/git/diffParser';

describe('diffParser unit tests (src/main/git/diffParser.ts)', () => {
  describe('empty and edge case diffs', () => {
    it('handles empty string diff cleanly', () => {
      const res = parseDiffOutput('', '/repo', 'file.ts');
      expect(res.isEmpty).toBe(true);
      expect(res.isBinary).toBe(false);
      expect(res.hunks).toEqual([]);
      expect(res.repoPath).toBe('/repo');
      expect(res.filePath).toBe('file.ts');
    });

    it('handles 0-byte added empty file diff', () => {
      const raw = [
        'diff --git a/empty.txt b/empty.txt',
        'new file mode 100644',
        'index 0000000..e69de29',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'empty.txt');
      expect(res.isEmpty).toBe(true);
      expect(res.isBinary).toBe(false);
      expect(res.hunks.length).toBe(0);
    });

    it('handles identical content rename diff without content hunks', () => {
      const raw = [
        'diff --git a/old.txt b/new.txt',
        'similarity index 100%',
        'rename from old.txt',
        'rename to new.txt',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'new.txt');
      expect(res.isEmpty).toBe(true);
      expect(res.isBinary).toBe(false);
      expect(res.hunks.length).toBe(0);
    });
  });

  describe('binary diff detection', () => {
    it('detects binary file addition notice', () => {
      const raw = [
        'diff --git a/logo.png b/logo.png',
        'new file mode 100644',
        'index 0000000..6164d9f',
        'Binary files /dev/null and b/logo.png differ',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'logo.png');
      expect(res.isBinary).toBe(true);
      expect(res.isEmpty).toBe(false);
      expect(res.hunks).toEqual([]);
    });

    it('detects binary file modification notice', () => {
      const raw = [
        'diff --git a/data.bin b/data.bin',
        'index 1234567..89abcdef 100644',
        'Binary files a/data.bin and b/data.bin differ',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'data.bin');
      expect(res.isBinary).toBe(true);
      expect(res.isEmpty).toBe(false);
      expect(res.hunks).toEqual([]);
    });
  });

  describe('standard unified diff parsing and line numbering', () => {
    it('parses additions, deletions, context lines, and tracks line numbers', () => {
      const raw = [
        'diff --git a/src/app.ts b/src/app.ts',
        'index b3c5a95..9e9f750 100644',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,5 +1,6 @@',
        ' line1',
        '-line2',
        '+line2 modified',
        ' line3',
        ' line4',
        ' line5',
        '+line6 added',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'src/app.ts');
      expect(res.isBinary).toBe(false);
      expect(res.isEmpty).toBe(false);
      expect(res.hunks.length).toBe(1);

      const hunk = res.hunks[0];
      expect(hunk.oldStart).toBe(1);
      expect(hunk.oldLines).toBe(5);
      expect(hunk.newStart).toBe(1);
      expect(hunk.newLines).toBe(6);
      expect(hunk.lines.length).toBe(7);

      expect(hunk.lines[0]).toEqual({
        type: 'context',
        content: ' line1',
        oldLineNumber: 1,
        newLineNumber: 1,
      });

      expect(hunk.lines[1]).toEqual({
        type: 'delete',
        content: '-line2',
        oldLineNumber: 2,
      });

      expect(hunk.lines[2]).toEqual({
        type: 'add',
        content: '+line2 modified',
        newLineNumber: 2,
      });

      expect(hunk.lines[3]).toEqual({
        type: 'context',
        content: ' line3',
        oldLineNumber: 3,
        newLineNumber: 3,
      });

      expect(hunk.lines[6]).toEqual({
        type: 'add',
        content: '+line6 added',
        newLineNumber: 6,
      });
    });

    it('parses newly created file with @@ -0,0 +1,2 @@ header', () => {
      const raw = [
        'diff --git a/new.ts b/new.ts',
        'new file mode 100644',
        'index 0000000..983d721',
        '--- /dev/null',
        '+++ b/new.ts',
        '@@ -0,0 +1,2 @@',
        '+line 1',
        '+line 2',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'new.ts');
      expect(res.hunks.length).toBe(1);
      const hunk = res.hunks[0];
      expect(hunk.oldStart).toBe(0);
      expect(hunk.oldLines).toBe(0);
      expect(hunk.newStart).toBe(1);
      expect(hunk.newLines).toBe(2);

      expect(hunk.lines[0]).toEqual({
        type: 'add',
        content: '+line 1',
        newLineNumber: 1,
      });
      expect(hunk.lines[1]).toEqual({
        type: 'add',
        content: '+line 2',
        newLineNumber: 2,
      });
    });

    it('parses deleted file with @@ -1,2 +0,0 @@ header', () => {
      const raw = [
        'diff --git a/deleted.ts b/deleted.ts',
        'deleted file mode 100644',
        'index 983d721..0000000',
        '--- a/deleted.ts',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-line 1',
        '-line 2',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'deleted.ts');
      expect(res.hunks.length).toBe(1);
      const hunk = res.hunks[0];
      expect(hunk.oldStart).toBe(1);
      expect(hunk.oldLines).toBe(2);
      expect(hunk.newStart).toBe(0);
      expect(hunk.newLines).toBe(0);

      expect(hunk.lines[0]).toEqual({
        type: 'delete',
        content: '-line 1',
        oldLineNumber: 1,
      });
      expect(hunk.lines[1]).toEqual({
        type: 'delete',
        content: '-line 2',
        oldLineNumber: 2,
      });
    });

    it('handles multiple hunks across different file offsets', () => {
      const raw = [
        'diff --git a/multi.ts b/multi.ts',
        'index 111..222 100644',
        '--- a/multi.ts',
        '+++ b/multi.ts',
        '@@ -1,3 +1,3 @@',
        ' a',
        '-b',
        '+b2',
        ' c',
        '@@ -40,3 +40,3 @@',
        ' x',
        '-y',
        '+y2',
        ' z',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'multi.ts');
      expect(res.hunks.length).toBe(2);

      expect(res.hunks[0].oldStart).toBe(1);
      expect(res.hunks[0].lines[1].oldLineNumber).toBe(2);

      expect(res.hunks[1].oldStart).toBe(40);
      expect(res.hunks[1].lines[1].oldLineNumber).toBe(41);
    });

    it('parses single line hunk headers where line count is omitted', () => {
      const raw = [
        'diff --git a/single.ts b/single.ts',
        'index 111..222 100644',
        '--- a/single.ts',
        '+++ b/single.ts',
        '@@ -1 +1,2 @@',
        '-only',
        '+only modified',
        '+new line',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'single.ts');
      expect(res.hunks[0].oldLines).toBe(1);
      expect(res.hunks[0].newLines).toBe(2);
    });

    it('handles missing newline at EOF as type meta without advancing line counters', () => {
      const raw = [
        'diff --git a/noeol.txt b/noeol.txt',
        'index 111..222 100644',
        '--- a/noeol.txt',
        '+++ b/noeol.txt',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        '\\ No newline at end of file',
      ].join('\n');

      const res = parseDiffOutput(raw, '/repo', 'noeol.txt');
      const lines = res.hunks[0].lines;
      expect(lines.length).toBe(3);
      expect(lines[2]).toEqual({
        type: 'meta',
        content: '\\ No newline at end of file',
      });
    });

    it('supports CRLF line endings identically to LF', () => {
      const raw = '@@ -1,2 +1,2 @@\r\n-a\r\n+b\r\n c\r\n';
      const res = parseDiffOutput(raw, '/repo', 'crlf.txt');
      expect(res.hunks.length).toBe(1);
      expect(res.hunks[0].lines.length).toBe(3);
    });
  });
});
