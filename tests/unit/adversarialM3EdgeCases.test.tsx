import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseDiffOutput } from '../../src/main/git/diffParser';
import DiffViewer from '../../src/renderer/components/DiffViewer';
import FileList from '../../src/renderer/components/FileList';
import App from '../../src/renderer/App';
import type { GitFileStatus, GitDiffResult, GitStatusResult, DevPilotAPI } from '../../src/shared/types';

describe('Adversarial Stress Test: Diff Rendering & Edge Cases (Milestone 3 Challenge)', () => {
  // =========================================================================
  // Section 1: Extreme Diff Parsing & Rendering
  // =========================================================================
  describe('Extreme Diff Parsing & Rendering', () => {
    describe('0-byte empty file diffs', () => {
      it('handles 0-byte empty file addition diff (isEmpty: true -> empty-diff-notice)', () => {
        const rawEmptyAddition = [
          'diff --git a/empty.txt b/empty.txt',
          'new file mode 100644',
          'index 0000000..e69de29',
        ].join('\n');

        const parsed = parseDiffOutput(rawEmptyAddition, '/repo', 'empty.txt');
        expect(parsed.isEmpty).toBe(true);
        expect(parsed.isBinary).toBe(false);
        expect(parsed.hunks).toEqual([]);

        const fileStatus: GitFileStatus = {
          path: 'empty.txt',
          changeType: 'added',
          statusCode: 'A ',
        };

        render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);

        expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
        expect(screen.getByText('Empty file or no content changes')).toBeDefined();
        expect(screen.getByText('File has zero modified lines or is an empty staged file.')).toBeDefined();
        expect(screen.getByText('Empty Diff')).toBeDefined();
        expect(screen.queryByTestId('binary-diff-notice')).toBeNull();
      });

      it('handles 0-byte empty file deletion diff', () => {
        const rawEmptyDeletion = [
          'diff --git a/empty-deleted.txt b/empty-deleted.txt',
          'deleted file mode 100644',
          'index e69de29..0000000',
        ].join('\n');

        const parsed = parseDiffOutput(rawEmptyDeletion, '/repo', 'empty-deleted.txt');
        expect(parsed.isEmpty).toBe(true);
        expect(parsed.isBinary).toBe(false);
        expect(parsed.hunks.length).toBe(0);

        const fileStatus: GitFileStatus = {
          path: 'empty-deleted.txt',
          changeType: 'deleted',
          statusCode: 'D ',
        };

        render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);
        expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
      });

      it('handles pure whitespace or totally empty raw diff output', () => {
        const parsed = parseDiffOutput('   \n\n\t  ', '/repo', 'blank.txt');
        expect(parsed.isEmpty).toBe(true);
        expect(parsed.isBinary).toBe(false);
        expect(parsed.hunks).toEqual([]);

        const fileStatus: GitFileStatus = {
          path: 'blank.txt',
          changeType: 'modified',
          statusCode: 'M ',
        };

        render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);
        expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
      });
    });

    describe('Binary file diffs', () => {
      it('handles binary file addition diff (isBinary: true -> binary-diff-notice)', () => {
        const rawBinaryAdd = [
          'diff --git a/assets/banner.png b/assets/banner.png',
          'new file mode 100644',
          'index 0000000..8b284e1',
          'Binary files /dev/null and b/assets/banner.png differ',
        ].join('\n');

        const parsed = parseDiffOutput(rawBinaryAdd, '/repo', 'assets/banner.png');
        expect(parsed.isBinary).toBe(true);
        expect(parsed.isEmpty).toBe(false);
        expect(parsed.hunks).toEqual([]);

        const fileStatus: GitFileStatus = {
          path: 'assets/banner.png',
          changeType: 'added',
          statusCode: 'A ',
        };

        render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);

        expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
        expect(screen.getByText('Binary file: diff not displayed')).toBeDefined();
        expect(screen.getByText('Binary file diff cannot be viewed in text inspector.')).toBeDefined();
        expect(screen.getByText('Binary File')).toBeDefined();
        expect(screen.queryByTestId('empty-diff-notice')).toBeNull();
      });

      it('handles binary file modification diff', () => {
        const rawBinaryMod = [
          'diff --git a/build/output.wasm b/build/output.wasm',
          'index 1234567..abcdef0 100644',
          'Binary files a/build/output.wasm and b/build/output.wasm differ',
        ].join('\n');

        const parsed = parseDiffOutput(rawBinaryMod, '/repo', 'build/output.wasm');
        expect(parsed.isBinary).toBe(true);
        expect(parsed.isEmpty).toBe(false);

        const fileStatus: GitFileStatus = {
          path: 'build/output.wasm',
          changeType: 'modified',
          statusCode: 'M ',
        };

        render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);
        expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
      });

      it('handles binary file deletion diff', () => {
        const rawBinaryDel = [
          'diff --git a/legacy.so b/legacy.so',
          'deleted file mode 100755',
          'index 9876543..0000000',
          'Binary files a/legacy.so and /dev/null differ',
        ].join('\n');

        const parsed = parseDiffOutput(rawBinaryDel, '/repo', 'legacy.so');
        expect(parsed.isBinary).toBe(true);

        const fileStatus: GitFileStatus = {
          path: 'legacy.so',
          changeType: 'deleted',
          statusCode: 'D ',
        };

        render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);
        expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
      });

      it('handles GIT binary patch format', () => {
        const rawBinaryPatch = [
          'diff --git a/icon.ico b/icon.ico',
          'index 0000000..1111111',
          'GIT binary patch',
          'literal 512',
          'zc$@<O00001000000000000000000000000000000000',
        ].join('\n');

        const parsed = parseDiffOutput(rawBinaryPatch, '/repo', 'icon.ico');
        expect(parsed.isBinary).toBe(true);
        expect(parsed.isEmpty).toBe(false);
      });
    });

    describe('Diffs with missing newline at EOF (\\ No newline at end of file)', () => {
      it('parses and renders \\ No newline at end of file after deletion and addition', () => {
        const rawDiff = [
          'diff --git a/noeol.txt b/noeol.txt',
          'index 111..222 100644',
          '--- a/noeol.txt',
          '+++ b/noeol.txt',
          '@@ -1,2 +1,2 @@',
          ' line1',
          '-old last line',
          '\\ No newline at end of file',
          '+new last line',
          '\\ No newline at end of file',
        ].join('\n');

        const parsed = parseDiffOutput(rawDiff, '/repo', 'noeol.txt');
        expect(parsed.hunks.length).toBe(1);
        const lines = parsed.hunks[0].lines;
        expect(lines.length).toBe(5);

        // Line 0: context
        expect(lines[0]).toEqual({
          type: 'context',
          content: ' line1',
          oldLineNumber: 1,
          newLineNumber: 1,
        });

        // Line 1: delete
        expect(lines[1]).toEqual({
          type: 'delete',
          content: '-old last line',
          oldLineNumber: 2,
        });

        // Line 2: meta
        expect(lines[2]).toEqual({
          type: 'meta',
          content: '\\ No newline at end of file',
        });
        expect(lines[2].oldLineNumber).toBeUndefined();
        expect(lines[2].newLineNumber).toBeUndefined();

        // Line 3: add (newLineNumber must be 2, unaffected by meta)
        expect(lines[3]).toEqual({
          type: 'add',
          content: '+new last line',
          newLineNumber: 2,
        });

        // Line 4: meta
        expect(lines[4]).toEqual({
          type: 'meta',
          content: '\\ No newline at end of file',
        });

        const fileStatus: GitFileStatus = {
          path: 'noeol.txt',
          changeType: 'modified',
          statusCode: 'M ',
        };

        const { container } = render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);

        const metaLines = container.querySelectorAll('.diff-line-meta');
        expect(metaLines.length).toBe(2);

        metaLines.forEach((meta) => {
          expect(meta.querySelector('.line-marker')?.textContent).toBe('\\');
          expect(meta.querySelector('.line-text')?.textContent).toBe('\\ No newline at end of file');
          expect(meta.querySelector('.line-num-old')?.textContent).toBe('');
          expect(meta.querySelector('.line-num-new')?.textContent).toBe('');
        });
      });
    });

    describe('Diffs with large hunks and multiple hunks', () => {
      it('parses and renders multiple hunks (10 hunks) across a file correctly', () => {
        const rawLines: string[] = [
          'diff --git a/large.ts b/large.ts',
          'index aaa..bbb 100644',
          '--- a/large.ts',
          '+++ b/large.ts',
        ];

        for (let h = 0; h < 10; h++) {
          const oldStart = h * 100 + 1;
          const newStart = h * 105 + 1;
          rawLines.push(`@@ -${oldStart},3 +${newStart},4 @@`);
          rawLines.push(' ctx line');
          rawLines.push('-del line');
          rawLines.push('+add line 1');
          rawLines.push('+add line 2');
        }

        const parsed = parseDiffOutput(rawLines.join('\n'), '/repo', 'large.ts');
        expect(parsed.hunks.length).toBe(10);

        for (let h = 0; h < 10; h++) {
          const hunk = parsed.hunks[h];
          const oldStart = h * 100 + 1;
          const newStart = h * 105 + 1;
          expect(hunk.oldStart).toBe(oldStart);
          expect(hunk.newStart).toBe(newStart);
          expect(hunk.lines[1].oldLineNumber).toBe(oldStart + 1);
          expect(hunk.lines[2].newLineNumber).toBe(newStart + 1);
          expect(hunk.lines[3].newLineNumber).toBe(newStart + 2);
        }

        const fileStatus: GitFileStatus = {
          path: 'large.ts',
          changeType: 'modified',
          statusCode: 'M ',
        };

        const { container } = render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);

        expect(screen.getByText('10 hunks')).toBeDefined();
        const hunkElements = container.querySelectorAll('.diff-hunk');
        expect(hunkElements.length).toBe(10);
      });

      it('handles massive single hunk (2000 lines) with correct continuous line numbers', () => {
        const rawLines: string[] = [
          'diff --git a/massive.ts b/massive.ts',
          'index aaa..bbb 100644',
          '--- a/massive.ts',
          '+++ b/massive.ts',
          '@@ -1,1500 +1,1500 @@',
        ];

        // 500 context lines
        for (let i = 1; i <= 500; i++) {
          rawLines.push(` context line ${i}`);
        }
        // 500 deletion lines
        for (let i = 1; i <= 500; i++) {
          rawLines.push(`-deletion line ${i}`);
        }
        // 500 addition lines
        for (let i = 1; i <= 500; i++) {
          rawLines.push(`+addition line ${i}`);
        }
        // 500 trailing context lines
        for (let i = 1; i <= 500; i++) {
          rawLines.push(` trailing context line ${i}`);
        }

        const parsed = parseDiffOutput(rawLines.join('\n'), '/repo', 'massive.ts');
        expect(parsed.hunks.length).toBe(1);
        expect(parsed.hunks[0].lines.length).toBe(2000);

        // Old line count: 500 ctx + 500 del + 500 ctx = 1500
        // New line count: 500 ctx + 500 add + 500 ctx = 1500
        const hunk = parsed.hunks[0];
        // Line 0: context (1, 1)
        expect(hunk.lines[0].oldLineNumber).toBe(1);
        expect(hunk.lines[0].newLineNumber).toBe(1);

        // Line 500: first deletion -> oldLine 501
        expect(hunk.lines[500].oldLineNumber).toBe(501);
        expect(hunk.lines[500].newLineNumber).toBeUndefined();

        // Line 1000: first addition -> newLine 501
        expect(hunk.lines[1000].oldLineNumber).toBeUndefined();
        expect(hunk.lines[1000].newLineNumber).toBe(501);

        // Line 1500: trailing context -> oldLine 1001, newLine 1001
        expect(hunk.lines[1500].oldLineNumber).toBe(1001);
        expect(hunk.lines[1500].newLineNumber).toBe(1001);

        // Line 1999: last context -> oldLine 1500, newLine 1500
        expect(hunk.lines[1999].oldLineNumber).toBe(1500);
        expect(hunk.lines[1999].newLineNumber).toBe(1500);

        const fileStatus: GitFileStatus = {
          path: 'massive.ts',
          changeType: 'modified',
          statusCode: 'M ',
        };

        const { container } = render(<DiffViewer selectedFile={fileStatus} diffResult={parsed} />);
        expect(screen.getByText('1 hunk')).toBeDefined();
        const diffLines = container.querySelectorAll('.diff-line');
        expect(diffLines.length).toBe(2000);
      });
    });
  });

  // =========================================================================
  // Section 2: Extreme Filepaths & Characters in FileList & Sidebar
  // =========================================================================
  describe('Extreme Filepaths & Characters in FileList & Sidebar', () => {
    it('handles filepaths with spaces, quotes, and nested directories in FileList', () => {
      const filesWithSpecialChars: GitFileStatus[] = [
        {
          path: 'my folder with spaces/my file with spaces.ts',
          changeType: 'modified',
          statusCode: 'M ',
        },
        {
          path: 'dir with "double quotes"/file\'single.ts',
          changeType: 'added',
          statusCode: 'A ',
        },
        {
          path: 'a/b/c/d/e/f/g/h/i/j/k/l/deeply/nested/path/component.tsx',
          changeType: 'modified',
          statusCode: 'M ',
        },
        {
          path: 'special;chars&pipes|redirection`touch`.sh',
          changeType: 'modified',
          statusCode: 'M ',
        },
      ];

      const onSelect = vi.fn();
      render(
        <FileList
          title="Staged Changes"
          count={filesWithSpecialChars.length}
          files={filesWithSpecialChars}
          sectionId="staged"
          isSelectable={true}
          onSelectFile={onSelect}
        />
      );

      // Verify data-testid rendered for each special path
      filesWithSpecialChars.forEach((file) => {
        const item = screen.getByTestId(`file-item-${file.path}`);
        expect(item).toBeDefined();
        expect(item.textContent).toContain(file.path);
      });

      // Fire click on spaced file
      fireEvent.click(screen.getByTestId(`file-item-${filesWithSpecialChars[0].path}`));
      expect(onSelect).toHaveBeenCalledWith(filesWithSpecialChars[0]);

      // Fire click on quoted file
      fireEvent.click(screen.getByTestId(`file-item-${filesWithSpecialChars[1].path}`));
      expect(onSelect).toHaveBeenCalledWith(filesWithSpecialChars[1]);
    });

    it('handles international unicode filepaths (Chinese, Cyrillic, Japanese, Arabic, Emoji)', () => {
      const unicodeFiles: GitFileStatus[] = [
        {
          path: 'src/组件/用户界面.tsx',
          changeType: 'added',
          statusCode: 'A ',
        },
        {
          path: 'src/компоненты/интерфейс.ts',
          changeType: 'modified',
          statusCode: 'M ',
        },
        {
          path: 'src/設定/コンフィグ.json',
          changeType: 'modified',
          statusCode: 'M ',
        },
        {
          path: 'src/مكونات/ملف.js',
          changeType: 'modified',
          statusCode: 'M ',
        },
        {
          path: 'src/🚀/star⭐_feature🔥.ts',
          changeType: 'added',
          statusCode: 'A ',
        },
        {
          path: 'src/café/naïve_façade.ts',
          changeType: 'modified',
          statusCode: 'M ',
        },
      ];

      const onSelect = vi.fn();
      render(
        <FileList
          title="Staged Changes"
          count={unicodeFiles.length}
          files={unicodeFiles}
          sectionId="staged"
          isSelectable={true}
          onSelectFile={onSelect}
        />
      );

      unicodeFiles.forEach((file) => {
        const item = screen.getByTestId(`file-item-${file.path}`);
        expect(item).toBeDefined();
        expect(item.textContent).toContain(file.path);
      });

      // Test selection on Chinese path
      fireEvent.click(screen.getByTestId('file-item-src/组件/用户界面.tsx'));
      expect(onSelect).toHaveBeenCalledWith(unicodeFiles[0]);

      // Test selection on Emoji path
      fireEvent.click(screen.getByTestId('file-item-src/🚀/star⭐_feature🔥.ts'));
      expect(onSelect).toHaveBeenCalledWith(unicodeFiles[4]);
    });

    it('verifies rename display formatting (oldPath -> path) with unicode and spaces', () => {
      const renames: GitFileStatus[] = [
        {
          oldPath: 'old folder/old name.ts',
          path: 'new folder/new name.ts',
          changeType: 'renamed',
          statusCode: 'R ',
        },
        {
          oldPath: '旧组件.tsx',
          path: '新组件.tsx',
          changeType: 'renamed',
          statusCode: 'R ',
        },
      ];

      render(
        <FileList
          title="Staged Changes"
          count={renames.length}
          files={renames}
          sectionId="staged"
          isSelectable={true}
        />
      );

      // Verify English rename formatting
      expect(screen.getByText('old folder/old name.ts →')).toBeDefined();
      expect(screen.getByText('new folder/new name.ts')).toBeDefined();

      // Verify Unicode rename formatting
      expect(screen.getByText('旧组件.tsx →')).toBeDefined();
      expect(screen.getByText('新组件.tsx')).toBeDefined();
    });

    it('verifies rename display in DiffViewer header', () => {
      const renamedFile: GitFileStatus = {
        oldPath: 'src/oldApp.tsx',
        path: 'src/newApp.tsx',
        changeType: 'renamed',
        statusCode: 'R ',
      };

      const emptyRenameDiff: GitDiffResult = {
        repoPath: '/workspace/project',
        filePath: 'src/newApp.tsx',
        rawDiff: [
          'diff --git a/src/oldApp.tsx b/src/newApp.tsx',
          'similarity index 100%',
          'rename from src/oldApp.tsx',
          'rename to src/newApp.tsx',
        ].join('\n'),
        isBinary: false,
        isEmpty: true,
        hunks: [],
      };

      render(<DiffViewer selectedFile={renamedFile} diffResult={emptyRenameDiff} />);

      expect(screen.getByText('renamed from src/oldApp.tsx')).toBeDefined();
      expect(screen.getByText('src/newApp.tsx')).toBeDefined();
      expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
    });
  });

  // =========================================================================
  // Section 3: Full App End-to-End Stress Test with Extreme Filepaths & Diffs
  // =========================================================================
  describe('Full App End-to-End Stress Flow with Extreme Inputs', () => {
    let mockDevPilot: DevPilotAPI;

    const extremeStatus: GitStatusResult = {
      repoPath: '/workspace/repo with spaces & "quotes" & 🚀',
      branch: 'feature/unicode_✨',
      isDetached: false,
      staged: [
        {
          path: 'empty file 0 byte.txt',
          changeType: 'added',
          statusCode: 'A ',
        },
        {
          path: 'assets/image with spaces.png',
          changeType: 'added',
          statusCode: 'A ',
        },
        {
          oldPath: 'old/旧文件.ts',
          path: 'new/新文件.ts',
          changeType: 'renamed',
          statusCode: 'R ',
        },
      ],
      unstaged: [
        {
          path: 'unstaged/компоненты.ts',
          changeType: 'modified',
          statusCode: ' M',
        },
      ],
      untracked: [
        {
          path: 'untracked/🔥/fire.txt',
          changeType: 'untracked',
          statusCode: '??',
        },
      ],
    };

    beforeEach(() => {
      vi.clearAllMocks();

      mockDevPilot = {
        openDirectory: vi.fn(),
        getStatus: vi.fn(),
        getStagedDiff: vi.fn(),
      };

      Object.defineProperty(window, 'devPilot', {
        value: mockDevPilot,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('interactively navigates and displays extreme diffs across repository', async () => {
      (mockDevPilot.openDirectory as any).mockResolvedValue('/workspace/repo with spaces & "quotes" & 🚀');
      (mockDevPilot.getStatus as any).mockResolvedValue({
        success: true,
        data: extremeStatus,
      });

      render(<App />);

      // 1. Open repo
      fireEvent.click(screen.getByTestId('open-repo-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('repo-path').textContent).toContain('/workspace/repo with spaces & "quotes" & 🚀');
        expect(screen.getByTestId('branch-badge').textContent).toContain('feature/unicode_✨');
      });

      // 2. Select 0-byte empty file
      (mockDevPilot.getStagedDiff as any).mockResolvedValue({
        success: true,
        data: {
          repoPath: extremeStatus.repoPath,
          filePath: 'empty file 0 byte.txt',
          rawDiff: 'diff --git a/empty.txt b/empty.txt\nnew file mode 100644\nindex 0000000..e69de29',
          isBinary: false,
          isEmpty: true,
          hunks: [],
        },
      });

      fireEvent.click(screen.getByTestId('file-item-empty file 0 byte.txt'));

      await waitFor(() => {
        expect(screen.getByTestId('empty-diff-notice')).toBeDefined();
        expect(mockDevPilot.getStagedDiff).toHaveBeenCalledWith(
          extremeStatus.repoPath,
          'empty file 0 byte.txt',
          undefined
        );
      });

      // 3. Select binary file with spaces
      (mockDevPilot.getStagedDiff as any).mockResolvedValue({
        success: true,
        data: {
          repoPath: extremeStatus.repoPath,
          filePath: 'assets/image with spaces.png',
          rawDiff: 'Binary files differ',
          isBinary: true,
          isEmpty: false,
          hunks: [],
        },
      });

      fireEvent.click(screen.getByTestId('file-item-assets/image with spaces.png'));

      await waitFor(() => {
        expect(screen.getByTestId('binary-diff-notice')).toBeDefined();
        expect(mockDevPilot.getStagedDiff).toHaveBeenCalledWith(
          extremeStatus.repoPath,
          'assets/image with spaces.png',
          undefined
        );
      });

      // 4. Select renamed unicode file
      (mockDevPilot.getStagedDiff as any).mockResolvedValue({
        success: true,
        data: {
          repoPath: extremeStatus.repoPath,
          filePath: 'new/新文件.ts',
          rawDiff: '@@ -1 +1 @@\n-old\n+new',
          isBinary: false,
          isEmpty: false,
          hunks: [
            {
              header: '@@ -1 +1 @@',
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: [
                { type: 'delete', content: '-old', oldLineNumber: 1 },
                { type: 'add', content: '+new', newLineNumber: 1 },
              ],
            },
          ],
        },
      });

      fireEvent.click(screen.getByTestId('file-item-new/新文件.ts'));

      await waitFor(() => {
        expect(screen.getByText('renamed from old/旧文件.ts')).toBeDefined();
        expect(screen.getByText('-old')).toBeDefined();
        expect(screen.getByText('+new')).toBeDefined();
        expect(mockDevPilot.getStagedDiff).toHaveBeenCalledWith(
          extremeStatus.repoPath,
          'new/新文件.ts',
          'old/旧文件.ts'
        );
      });
    });
  });
});
