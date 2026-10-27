/**
 * Conventional Commits v1.0.0 Prompt Engineering & Diff Budgeting.
 */

import type {
  GitAllStagedDiffResult,
  ParsedConventionalCommit,
  WebhookRepositoryContext,
} from '../../../shared/types';

/**
 * Universal system prompt enforcing strict Conventional Commits v1.0.0.
 */
export const CONVENTIONAL_COMMIT_SYSTEM_PROMPT = `You are an expert software engineer and Git commit specialist.
Your sole job is to generate a clean, precise Conventional Commit message conforming strictly to the Conventional Commits specification v1.0.0.

CONVENTIONAL COMMIT RULES:
1. Format: <type>[optional scope][!]: <description>
   [optional body]
   [optional footer(s)]
2. The <type> MUST be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
3. Scope is optional and must be in parentheses: e.g., feat(settings): or fix(git):.
4. If the changes introduce a breaking change, include an exclamation mark before the colon: feat!: or feat(api)!:, or add a footer: "BREAKING CHANGE: <description>".
5. The description (first line) MUST:
   - Use the imperative mood (e.g., "add", "implement", "fix", "refactor", NOT "added", "fixing", "implements").
   - Start with a lowercase letter.
   - NOT end with a period.
   - Stay under 72 characters.
6. If an optional body is needed for significant changes, separate it from the header with a single blank line.
7. If the user provides custom instructions or hints, prioritize their guidance for type, scope, and key details.

CRITICAL OUTPUT REQUIREMENT:
- Output ONLY the raw commit message text.
- Do NOT wrap your output in markdown code blocks (NO \`\`\` or \`\`\`commit).
- Do NOT include any introductory or concluding conversational text (NO "Here is your commit message:", NO "Hope this helps!").
- Do NOT provide explanations outside of the commit message itself.`;

export const MAX_DIFF_CHAR_BUDGET = 20000;

/**
 * Cleanly truncates diff output to character budget at line boundaries.
 */
export function truncateDiff(
  rawDiff: string,
  maxChars = MAX_DIFF_CHAR_BUDGET,
  totalFiles = 1
): string {
  if (!rawDiff || rawDiff.length <= maxChars) {
    return rawDiff || '';
  }
  const slice = rawDiff.slice(0, maxChars);
  const lastNewline = slice.lastIndexOf('\n');
  const safeSlice = lastNewline > 0 ? slice.slice(0, lastNewline) : slice;
  return `${safeSlice}\n\n... [staged diff truncated for length; ${totalFiles} files changed in total]`;
}

/**
 * Builds universal user prompt containing repository context, changed files, user hints, and budgeted diff.
 */
export function buildUserPrompt(
  repoContext: WebhookRepositoryContext,
  diffData: GitAllStagedDiffResult,
  customPrompt?: string,
  maxDiffChars = MAX_DIFF_CHAR_BUDGET
): string {
  const lines: string[] = [];
  lines.push('Generate a Conventional Commit message for the following staged Git changes.');
  lines.push('');
  lines.push(`Repository: ${repoContext.repoPath}`);
  lines.push(`Active Branch: ${repoContext.branch}${repoContext.isDetached ? ' (detached HEAD)' : ''}`);

  const totalFiles = diffData.stagedFiles.length;
  const summary = diffData.summary || { filesChanged: totalFiles, insertions: 0, deletions: 0 };
  lines.push(`Files changed: ${totalFiles}`);
  lines.push(`Diff summary: +${summary.insertions} -${summary.deletions}`);
  lines.push(`Staged Files (${totalFiles} files, +${summary.insertions} -${summary.deletions}):`);
  for (const file of diffData.stagedFiles) {
    lines.push(`- [${file.changeType}] ${file.path}${file.oldPath ? ` (from ${file.oldPath})` : ''}`);
  }
  lines.push('');

  if (customPrompt && customPrompt.trim().length > 0) {
    lines.push('User Instructions / Hint:');
    lines.push(customPrompt.trim());
    lines.push('');
  }

  lines.push('Staged Diff:');
  lines.push('```diff');
  lines.push(truncateDiff(diffData.rawDiff, maxDiffChars, totalFiles));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Convenience aliases for prompt builder testing.
 */
export const buildCommitSystemPrompt = (): string => CONVENTIONAL_COMMIT_SYSTEM_PROMPT;
export const buildCommitUserPrompt = (
  context: {
    repoPath: string;
    branch: string;
    isDetached?: boolean;
    stagedFiles: GitAllStagedDiffResult['stagedFiles'];
    summary?: GitAllStagedDiffResult['summary'];
    rawDiff: string;
    customPrompt?: string;
  },
  maxDiffChars?: number
): string => {
  return buildUserPrompt(
    {
      repoPath: context.repoPath,
      branch: context.branch,
      isDetached: Boolean(context.isDetached),
    },
    {
      repoPath: context.repoPath,
      rawDiff: context.rawDiff,
      stagedFiles: context.stagedFiles,
      summary: context.summary || {
        filesChanged: context.stagedFiles.length,
        insertions: 0,
        deletions: 0,
      },
      isEmpty: !context.rawDiff && context.stagedFiles.length === 0,
    },
    context.customPrompt,
    maxDiffChars
  );
};

/**
 * Cleans conversational fluff, markdown fences, and quotation marks from LLM output.
 */
export function cleanRawResponse(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();

  // 1. Conversational prefix regex covering singular/plural ("message" / "messages"),
  // "the" / "a" / "your", "suggested" / "proposed" / "generated", and conversational pleasantries ("Sure!", etc.)
  const prefixRegex =
    /^(?:(?:Sure!?|Certainly!?|Okay!?),?\s+)?(?:Here(?:'s|\s+(?:is|are))\s+(?:the|a|your)\s+(?:suggested\s+|proposed\s+|generated\s+)?commit\s+messages?(?:\s+for\s+your\s+changes)?:?|(?:Suggested|Proposed|Generated|Commit)\s+commit\s+messages?:?|Suggested\s+messages?:?|Proposed\s+messages?:?|Commit\s+messages?:?|Here's\s+(?:a|the|your)\s+commit\s+messages?:?)\s*/i;

  cleaned = cleaned.replace(prefixRegex, '').trim();

  // 2. Strip outer markdown code fences ONLY if the entire message is enclosed in fences.
  // Note: Do NOT use the multiline `/m` flag, which causes internal codeblocks in commit bodies
  // to be matched and the commit header to be discarded.
  if (cleaned.startsWith('```')) {
    const match = cleaned.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\r?\n([\s\S]*?)(?:\r?\n)?```\s*$/);
    if (match) {
      cleaned = match[1].trim();
    }
  }

  // 3. Strip conversational intro again if it was enclosed inside outer code fences
  cleaned = cleaned.replace(prefixRegex, '').trim();

  // 4. Strip surrounding quotation marks
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // 5. Final pass for conversational prefix if it was enclosed inside quotes
  cleaned = cleaned.replace(prefixRegex, '').trim();

  return cleaned;
}

/**
 * Extracts raw commit string from varied upstream object formats with cycle protection.
 */
export function extractCommitText(raw: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (depth > 5) return '';
  if (!raw) return '';
  if (typeof raw === 'string') return cleanRawResponse(raw);
  if (typeof raw === 'object') {
    if (seen.has(raw)) return '';
    seen.add(raw);
    const obj = raw as Record<string, unknown>;
    for (const key of ['content', 'message', 'commitMessage', 'commit', 'text', 'output', 'response']) {
      if (typeof obj[key] === 'string') return cleanRawResponse(obj[key] as string);
    }
    if (obj.message && typeof obj.message === 'object') {
      const msgObj = obj.message as Record<string, unknown>;
      if (typeof msgObj.content === 'string') return cleanRawResponse(msgObj.content);
    }
    if (obj.data) return extractCommitText(obj.data, depth + 1, seen);
    if (Array.isArray(obj.choices) && obj.choices[0]?.message?.content) {
      return cleanRawResponse(obj.choices[0].message.content);
    }
    if (Array.isArray(obj.candidates) && obj.candidates[0]?.content?.parts?.[0]?.text) {
      return cleanRawResponse(obj.candidates[0].content.parts[0].text);
    }
  }
  return cleanRawResponse(String(raw ?? ''));
}

/**
 * Parses Conventional Commit v1.0.0 header, scope, breaking marker, subject, and body.
 */
export function parseConventionalCommit(commitText: string): ParsedConventionalCommit {
  const raw = commitText.trim();
  if (!raw) return { raw: '', type: 'chore', subject: '', isBreaking: false, isValid: false };

  const lines = raw.split(/\r?\n/);
  const header = lines[0].trim();
  const body = lines.slice(1).join('\n').trim() || undefined;

  const regex = /^([a-zA-Z0-9_-]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
  const match = header.match(regex);
  const isBreaking = Boolean(match?.[3]) || /BREAKING[ -]CHANGE:/i.test(raw);

  if (match) {
    return {
      raw,
      type: match[1].toLowerCase(),
      scope: match[2]?.trim() || undefined,
      isBreaking,
      subject: match[4].trim(),
      body,
      isValid: true,
    };
  }

  return {
    raw,
    type: 'chore',
    subject: header,
    body,
    isBreaking,
    isValid: false,
  };
}
