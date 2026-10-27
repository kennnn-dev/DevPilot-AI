import { describe, it, expect } from 'vitest';
import {
  truncateDiff,
  cleanRawResponse,
  extractCommitText,
  parseConventionalCommit,
  buildUserPrompt,
  buildCommitUserPrompt,
  CONVENTIONAL_COMMIT_SYSTEM_PROMPT,
} from '../../src/main/services/ai/promptBuilder';
import type { GitAllStagedDiffResult, WebhookRepositoryContext } from '../../src/shared/types';

describe('Milestone 9 Empirical Challenger: PromptBuilder & Diff Budgeting Stress Suite', () => {
  // =========================================================================
  // Challenge 1: truncateDiff Under Extreme Scale & Adversarial Encodings
  // =========================================================================
  describe('Challenge 1: truncateDiff Scale & Adversarial Encodings', () => {
    it('cleanly truncates 100k character diff at line boundary within budget', () => {
      const line = 'diff --git a/file.ts b/file.ts\n+const line = "testing truncation budget line boundary preservation";\n';
      const repetitions = Math.ceil(100_000 / line.length);
      const hugeDiff = line.repeat(repetitions);
      expect(hugeDiff.length).toBeGreaterThanOrEqual(100_000);

      const startTime = performance.now();
      const truncated = truncateDiff(hugeDiff, 20_000, 15);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(50); // High performance requirement (<50ms)
      expect(truncated.length).toBeLessThan(20_000 + 100);
      expect(truncated).toContain('... [staged diff truncated for length; 15 files changed in total]');
      // Verify truncation ended cleanly on a newline before the truncation notice
      const contentBeforeNotice = truncated.split('\n\n... [staged diff truncated')[0];
      expect(contentBeforeNotice.endsWith(';\n') || contentBeforeNotice.endsWith(';')).toBe(true);
    });

    it('cleanly truncates 500k character diff with 100 files', () => {
      const line = '+added content in very large repository changeset\n';
      const hugeDiff = line.repeat(Math.ceil(500_000 / line.length));
      expect(hugeDiff.length).toBeGreaterThanOrEqual(500_000);

      const startTime = performance.now();
      const truncated = truncateDiff(hugeDiff, 20_000, 100);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(100);
      expect(truncated.length).toBeLessThan(20_000 + 100);
      expect(truncated).toContain('... [staged diff truncated for length; 100 files changed in total]');
    });

    it('cleanly truncates 1,000,000 (1M) character diff without memory or performance degradation', () => {
      const line = '+line containing data chunk number 1234567890\n';
      const hugeDiff = line.repeat(Math.ceil(1_000_000 / line.length));
      expect(hugeDiff.length).toBeGreaterThanOrEqual(1_000_000);

      const startTime = performance.now();
      const truncated = truncateDiff(hugeDiff, 20_000, 250);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(100);
      expect(truncated.length).toBeLessThan(20_000 + 100);
      expect(truncated).toContain('... [staged diff truncated for length; 250 files changed in total]');
    });

    it('handles diffs with ZERO newlines (single monolithic minified line of 100k chars)', () => {
      const singleLongLine = 'a'.repeat(100_000);
      const truncated = truncateDiff(singleLongLine, 20_000, 1);

      // When there are no newlines, slice fallback is used safely without exception
      expect(truncated.length).toBe(20_000 + '\n\n... [staged diff truncated for length; 1 files changed in total]'.length);
      expect(truncated).toContain('... [staged diff truncated for length; 1 files changed in total]');
    });

    it('handles multibyte UTF-8 characters (CJK, Cyrillic, Arabic, Emojis) across truncation boundaries', () => {
      // Each line has Chinese, Japanese, Korean, Cyrillic, and 4-byte surrogate pair emojis
      const multiByteLine = '+测试 🚀 日本語 💻 한국어 ✨ Русский язык 𠮷\n';
      const diff = multiByteLine.repeat(1500); // ~60,000 chars

      const truncated = truncateDiff(diff, 20_000, 5);
      expect(truncated.length).toBeLessThan(20_000 + 100);
      expect(truncated).toContain('... [staged diff truncated for length; 5 files changed in total]');
      // Verify no invalid unclosed characters or corrupted text
      expect(truncated).toContain('测试');
      expect(truncated).toContain('Русский язык');
    });

    it('handles edge case diff sizes: empty, null, undefined, exact budget, budget+1', () => {
      expect(truncateDiff('')).toBe('');
      expect(truncateDiff(null as unknown as string)).toBe('');
      expect(truncateDiff(undefined as unknown as string)).toBe('');

      const exact = 'a'.repeat(20_000);
      expect(truncateDiff(exact, 20_000)).toBe(exact);

      const exactPlusOne = 'a'.repeat(20_001);
      const result = truncateDiff(exactPlusOne, 20_000, 2);
      expect(result).toContain('... [staged diff truncated for length; 2 files changed in total]');
    });

    it('handles custom maxChars budgets (e.g. 15 chars, 5000 chars)', () => {
      const diff = 'line1\nline2\nline3\nline4\nline5\n';
      const truncated = truncateDiff(diff, 15, 1);
      expect(truncated.startsWith('line1\nline2')).toBe(true);
      expect(truncated).toContain('... [staged diff truncated for length; 1 files changed in total]');
    });
  });

  // =========================================================================
  // Challenge 2: cleanRawResponse & extractCommitText Adversarial LLM Outputs
  // =========================================================================
  describe('Challenge 2: cleanRawResponse & extractCommitText Adversarial Outputs', () => {
    it('handles supported markdown code block language fences', () => {
      expect(cleanRawResponse('```commit\nfeat: commit tag\n```')).toBe('feat: commit tag');
      expect(cleanRawResponse('```git\nfeat: git tag\n```')).toBe('feat: git tag');
      expect(cleanRawResponse('```markdown\nfeat: md tag\n```')).toBe('feat: md tag');
      expect(cleanRawResponse('```text\nfeat: text tag\n```')).toBe('feat: text tag');
      expect(cleanRawResponse('```json\nfeat: json tag\n```')).toBe('feat: json tag');
      expect(cleanRawResponse('```\nfeat: plain backticks\n```')).toBe('feat: plain backticks');
    });

    it('handles windows CRLF line breaks in markdown code fences', () => {
      expect(cleanRawResponse('```commit\r\nfix: crlf fence\r\n```')).toBe('fix: crlf fence');
      expect(cleanRawResponse('```\r\nfix: crlf plain\r\n```')).toBe('fix: crlf plain');
    });

    it('strips supported conversational introductions and greetings', () => {
      const supportedExamples = [
        'Here is the commit message: feat: add modal',
        'Here is a commit message: feat: add modal',
        'Here is a commit message for your changes: feat: add modal',
        'Suggested commit message: fix: null pointer',
        'Proposed commit message: chore: bump deps',
        'Commit message: docs: update readme',
        "Here's your commit message: feat: dynamic router",
        "Here's a commit message: feat: dynamic router",
        "Here's the commit message: feat: dynamic router",
      ];
      for (const ex of supportedExamples) {
        const cleaned = cleanRawResponse(ex);
        expect(cleaned.startsWith('feat:') || cleaned.startsWith('fix:') || cleaned.startsWith('chore:') || cleaned.startsWith('docs:')).toBe(true);
      }
    });

    it('handles conversational prefix edge cases and strips them cleanly', () => {
      // 1. "Here is your commit message:" is cleanly stripped
      const handled1 = 'Here is your commit message: feat: add modal';
      expect(cleanRawResponse(handled1)).toBe('feat: add modal');

      // 2. "Here are the commit messages:" is cleanly stripped without leaving trailing 's:'
      const handled2 = 'Here are the commit messages: feat: add modal';
      expect(cleanRawResponse(handled2)).toBe('feat: add modal');
      const parsed = parseConventionalCommit(cleanRawResponse(handled2));
      expect(parsed.type).toBe('feat');
      expect(parsed.subject).toBe('add modal');

      // 3. "Sure! Here is the commit message:" with pleasantry prefix is cleanly stripped
      const handled3 = 'Sure! Here is the commit message: feat: add modal';
      expect(cleanRawResponse(handled3)).toBe('feat: add modal');
    });

    it('preserves commit message header when body contains code blocks', () => {
      // Outer fence stripping is string-anchored without /m, preserving body code blocks
      const commitWithBodyCodeBlock = 'feat: add syntax highlighting\n\n```\nconst x = 1;\n```';
      const cleaned = cleanRawResponse(commitWithBodyCodeBlock);
      expect(cleaned).toBe('feat: add syntax highlighting\n\n```\nconst x = 1;\n```');
      const parsed = parseConventionalCommit(cleaned);
      expect(parsed.type).toBe('feat');
      expect(parsed.subject).toBe('add syntax highlighting');
      expect(parsed.body).toBe('```\nconst x = 1;\n```');
    });

    it('handles surrounded single and double quotes with internal quotes', () => {
      expect(cleanRawResponse('"feat: "inner quotes" supported"')).toBe('feat: "inner quotes" supported');
      expect(cleanRawResponse("'fix: 'inner single' supported'")).toBe("fix: 'inner single' supported");
    });

    it('extractCommitText safely unwraps complex nested LLM payload schemas', () => {
      // 1. Direct string
      expect(extractCommitText('feat: direct string')).toBe('feat: direct string');

      // 2. Ollama /api/chat format
      expect(extractCommitText({ message: { role: 'assistant', content: 'feat(ollama): chat response' } })).toBe('feat(ollama): chat response');

      // 3. Ollama /api/generate format
      expect(extractCommitText({ response: 'feat(ollama): generate response' })).toBe('feat(ollama): generate response');

      // 4. OpenAI /v1/chat/completions format
      expect(
        extractCommitText({
          id: 'chatcmpl-123',
          choices: [{ index: 0, message: { role: 'assistant', content: '```commit\nfeat(openai): gpt-4o completion\n```' } }],
        })
      ).toBe('feat(openai): gpt-4o completion');

      // 5. Google Gemini v1beta generateContent format
      expect(
        extractCommitText({
          candidates: [
            {
              content: {
                parts: [{ text: 'Here is the commit message: feat(gemini): flash completion' }],
                role: 'model',
              },
            },
          ],
        })
      ).toBe('feat(gemini): flash completion');

      // 6. Generic webhook and legacy shapes
      expect(extractCommitText({ commitMessage: 'fix(webhook): commitMessage key' })).toBe('fix(webhook): commitMessage key');
      expect(extractCommitText({ commit: 'docs(webhook): commit key' })).toBe('docs(webhook): commit key');
      expect(extractCommitText({ text: 'style(webhook): text key' })).toBe('style(webhook): text key');
      expect(extractCommitText({ output: 'refactor(webhook): output key' })).toBe('refactor(webhook): output key');
      expect(extractCommitText({ data: { message: 'perf(webhook): nested data message' } })).toBe('perf(webhook): nested data message');
    });

    it('extractCommitText handles adversarial inputs: null, undefined, numbers, empty structures', () => {
      expect(extractCommitText(null)).toBe('');
      expect(extractCommitText(undefined)).toBe('');
      expect(extractCommitText('')).toBe('');
      expect(extractCommitText(12345)).toBe('12345');
      expect(extractCommitText({})).toBe('[object Object]');
      expect(extractCommitText({ choices: [] })).toBe('[object Object]');
      expect(extractCommitText({ candidates: [] })).toBe('[object Object]');
      expect(extractCommitText({ candidates: [{ content: { parts: [] } }] })).toBe('[object Object]');
    });

    it('extractCommitText protects against cyclic object references without stack overflow', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.data = cyclic;
      expect(() => extractCommitText(cyclic)).not.toThrow();
      expect(extractCommitText(cyclic)).toBe('');
    });
  });

  // =========================================================================
  // Challenge 3: parseConventionalCommit Specification Compliance & Edge Cases
  // =========================================================================
  describe('Challenge 3: parseConventionalCommit Specification Compliance', () => {
    it('accurately parses all 11 standard Conventional Commit types', () => {
      const types = [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ];

      for (const t of types) {
        const parsed = parseConventionalCommit(`${t}: implement ${t} functionality`);
        expect(parsed.isValid).toBe(true);
        expect(parsed.type).toBe(t);
        expect(parsed.subject).toBe(`implement ${t} functionality`);
        expect(parsed.scope).toBeUndefined();
        expect(parsed.isBreaking).toBe(false);
      }
    });

    it('parses diverse scope formats (alphanumeric, hyphens, slashes, dots)', () => {
      const scopeCases = [
        { header: 'feat(api): add v2 endpoint', expectedScope: 'api' },
        { header: 'fix(auth-service): correct jwt validation', expectedScope: 'auth-service' },
        { header: 'refactor(client/ui): restructure components', expectedScope: 'client/ui' },
        { header: 'perf(db.indexes): optimize query', expectedScope: 'db.indexes' },
        { header: 'test(e2e_flow): add playwright tests', expectedScope: 'e2e_flow' },
      ];

      for (const { header, expectedScope } of scopeCases) {
        const parsed = parseConventionalCommit(header);
        expect(parsed.isValid).toBe(true);
        expect(parsed.scope).toBe(expectedScope);
      }
    });

    it('detects breaking changes via header exclamation mark (!)', () => {
      const case1 = parseConventionalCommit('feat!: redesign public api surface');
      expect(case1.isValid).toBe(true);
      expect(case1.type).toBe('feat');
      expect(case1.scope).toBeUndefined();
      expect(case1.isBreaking).toBe(true);
      expect(case1.subject).toBe('redesign public api surface');

      const case2 = parseConventionalCommit('feat(billing)!: drop legacy stripe webhook');
      expect(case2.isValid).toBe(true);
      expect(case2.type).toBe('feat');
      expect(case2.scope).toBe('billing');
      expect(case2.isBreaking).toBe(true);
      expect(case2.subject).toBe('drop legacy stripe webhook');
    });

    it('detects breaking changes via BREAKING CHANGE and BREAKING-CHANGE footers', () => {
      const footer1 = 'fix: update response schema\n\nBREAKING CHANGE: response.data is now typed as array';
      const parsed1 = parseConventionalCommit(footer1);
      expect(parsed1.isValid).toBe(true);
      expect(parsed1.isBreaking).toBe(true);
      expect(parsed1.body).toContain('BREAKING CHANGE: response.data is now typed as array');

      const footer2 = 'refactor(db): drop column\n\nBREAKING-CHANGE: column user_id dropped';
      const parsed2 = parseConventionalCommit(footer2);
      expect(parsed2.isValid).toBe(true);
      expect(parsed2.isBreaking).toBe(true);
      expect(parsed2.body).toContain('BREAKING-CHANGE: column user_id dropped');
    });

    it('handles multiline body, paragraphs, and issues references', () => {
      const multiline = `feat(parser): add conventional commit parsing

This commit implements parsing for Conventional Commits v1.0.0.
It supports:
- Types and optional scopes
- Breaking changes flags
- Multi-line bodies

Closes #42`;

      const parsed = parseConventionalCommit(multiline);
      expect(parsed.isValid).toBe(true);
      expect(parsed.type).toBe('feat');
      expect(parsed.scope).toBe('parser');
      expect(parsed.subject).toBe('add conventional commit parsing');
      expect(parsed.body).toBeDefined();
      expect(parsed.body).toContain('This commit implements parsing for Conventional Commits v1.0.0.');
      expect(parsed.body).toContain('Closes #42');
    });

    it('handles non-conforming messages and edge cases safely', () => {
      // Empty input
      const empty = parseConventionalCommit('');
      expect(empty.isValid).toBe(false);
      expect(empty.type).toBe('chore');
      expect(empty.subject).toBe('');

      // Whitespace only
      const ws = parseConventionalCommit('   \n  \t  ');
      expect(ws.isValid).toBe(false);
      expect(ws.type).toBe('chore');

      // Random sentence without conventional syntax
      const random = parseConventionalCommit('Fixed the bug in the login screen');
      expect(random.isValid).toBe(false);
      expect(random.type).toBe('chore');
      expect(random.subject).toBe('Fixed the bug in the login screen');

      // Missing colon
      const missingColon = parseConventionalCommit('feat auth login screen');
      expect(missingColon.isValid).toBe(false);
      expect(missingColon.type).toBe('chore');
    });
  });

  // =========================================================================
  // Challenge 4: System and User Prompt Builders Integration
  // =========================================================================
  describe('Challenge 4: Prompt Construction Integration', () => {
    it('system prompt includes essential Conventional Commits v1.0.0 specifications', () => {
      expect(CONVENTIONAL_COMMIT_SYSTEM_PROMPT).toContain('Conventional Commits');
      expect(CONVENTIONAL_COMMIT_SYSTEM_PROMPT).toContain('v1.0.0');
      expect(CONVENTIONAL_COMMIT_SYSTEM_PROMPT).toContain('imperative mood');
      expect(CONVENTIONAL_COMMIT_SYSTEM_PROMPT).toContain('Do NOT wrap your output in markdown code blocks');
    });

    it('buildUserPrompt correctly formats staged file changes, stats, user hint, and diff', () => {
      const repoContext: WebhookRepositoryContext = {
        repoPath: '/home/user/project',
        branch: 'feature/ai-integration',
        isDetached: false,
      };

      const diffData: GitAllStagedDiffResult = {
        repoPath: '/home/user/project',
        rawDiff: 'diff --git a/a.ts b/a.ts\n+const x = 1;\n',
        stagedFiles: [
          { path: 'a.ts', changeType: 'modified', statusCode: 'M ' },
          { path: 'b.ts', oldPath: 'old_b.ts', changeType: 'renamed', statusCode: 'R ' },
        ],
        summary: { filesChanged: 2, insertions: 1, deletions: 0 },
        isEmpty: false,
      };

      const prompt = buildUserPrompt(repoContext, diffData, 'Keep it concise');

      expect(prompt).toContain('Repository: /home/user/project');
      expect(prompt).toContain('Active Branch: feature/ai-integration');
      expect(prompt).toContain('Files changed: 2');
      expect(prompt).toContain('Diff summary: +1 -0');
      expect(prompt).toContain('- [modified] a.ts');
      expect(prompt).toContain('- [renamed] b.ts (from old_b.ts)');
      expect(prompt).toContain('User Instructions / Hint:');
      expect(prompt).toContain('Keep it concise');
      expect(prompt).toContain('```diff');
      expect(prompt).toContain('+const x = 1;');
    });

    it('buildCommitUserPrompt correctly handles empty summary fallback and detached HEAD', () => {
      const prompt = buildCommitUserPrompt({
        repoPath: '/repo',
        branch: 'abcdef1',
        isDetached: true,
        stagedFiles: [{ path: 'foo.ts', changeType: 'added', statusCode: 'A ' }],
        rawDiff: '+hello world\n',
      });

      expect(prompt).toContain('Active Branch: abcdef1 (detached HEAD)');
      expect(prompt).toContain('Files changed: 1');
      expect(prompt).toContain('Diff summary: +0 -0');
      expect(prompt).toContain('- [added] foo.ts');
    });
  });
});
