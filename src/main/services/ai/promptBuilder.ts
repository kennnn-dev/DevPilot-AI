/**
 * Conventional Commits v1.0.0 Prompt Engineering & Diff Budgeting.
 */

import type {
  GitAllStagedDiffResult,
  ParsedConventionalCommit,
  WebhookRepositoryContext,
  ReviewAudienceMode,
  WorkspaceReviewResult,
  SiblingRepoImpact,
  ImpactSeverity,
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

/**
 * System prompt for Workspace Change Review & Cross-Repo Impact Analysis.
 */
export function buildWorkspaceReviewSystemPrompt(mode: ReviewAudienceMode = 'plain'): string {
  if (mode === 'plain') {
    return `You are an empathetic, clear software product advisor communicating with non-technical people (product managers, QA testers, business owners, clients).
Your job is to explain code changes in simple, everyday language without technical jargon (DO NOT USE technical terms like AST, polymorphism, regex, memoization, callbacks, SQL injection, etc.).
You must also explain whether changes in this repository affect other sibling projects in the user's workspace.

CRITICAL INSTRUCTIONS:
1. Explain what changed in plain English that a 12-year-old or non-coder can easily grasp.
2. Explain "Why it matters": the real-world business impact, user-facing behavior, or safety benefit.
3. Provide simple, concrete testing steps that anyone can follow to verify the change works.
4. For each sibling repository in the workspace, explain in simple terms whether it is safe, potentially affected, or requires updates.
5. Format your output strictly as a single JSON object with the following schema:
{
  "plainEnglishSummary": "1-3 clear sentences describing what changed in simple words",
  "whyItMatters": "Clear explanation of the benefit, user impact, or business reason",
  "suggestedVerification": [
    "Step 1: Simple manual action to test",
    "Step 2: What to look for"
  ],
  "overallImpactStatus": "safe" | "potential_impact" | "breaking_risk",
  "crossRepoImpacts": [
    {
      "repoName": "sibling-repo-name",
      "status": "safe" | "potential_impact" | "breaking_risk",
      "summary": "Plain English explanation of whether this sibling repo is affected and why"
    }
  ]
}

DO NOT wrap your output in conversational filler. Return ONLY the JSON object.`;
  }

  return `You are a Senior Software Architect and Tech Lead conducting a cross-repository workspace code review.
Your job is to analyze the changes in the active repository, evaluate architectural impact, and inspect whether sibling repositories in the workspace are affected (e.g. shared types, endpoints, schemas, environment variables).

CRITICAL INSTRUCTIONS:
1. Summarize code changes concisely.
2. Explain architectural and operational impact.
3. Provide targeted verification steps and edge cases to test.
4. Assess sibling repository impact (safe, potential_impact, breaking_risk).
5. Format your output strictly as a single JSON object with the following schema:
{
  "plainEnglishSummary": "High-level overview of the architectural changes",
  "whyItMatters": "Technical impact, performance, and stability considerations",
  "suggestedVerification": [
    "Verification step 1 (e.g. integration test, API contract check)",
    "Verification step 2"
  ],
  "technicalDetails": "Detailed breakdown of affected interfaces, endpoints, or state management",
  "overallImpactStatus": "safe" | "potential_impact" | "breaking_risk",
  "crossRepoImpacts": [
    {
      "repoName": "sibling-repo-name",
      "status": "safe" | "potential_impact" | "breaking_risk",
      "summary": "Technical assessment of how changes affect this sibling repo"
    }
  ]
}

DO NOT wrap your output in conversational filler. Return ONLY the JSON object.`;
}

/**
 * Builds user prompt for workspace review incorporating repo metadata, sibling scan matches, and diff.
 */
export function buildWorkspaceReviewUserPrompt(
  activeRepoPath: string,
  activeRepoName: string,
  siblingImpacts: SiblingRepoImpact[],
  diffData: GitAllStagedDiffResult,
  mode: ReviewAudienceMode = 'plain',
  customPrompt?: string,
  maxDiffChars = MAX_DIFF_CHAR_BUDGET
): string {
  const lines: string[] = [];
  lines.push(`Perform a workspace code and impact review (${mode === 'plain' ? 'Plain English non-dev mindset' : 'Technical developer mindset'}).`);
  lines.push('');
  lines.push(`Active Repository: ${activeRepoName} (${activeRepoPath})`);

  const totalFiles = diffData.stagedFiles.length;
  const summary = diffData.summary || { filesChanged: totalFiles, insertions: 0, deletions: 0 };
  lines.push(`Changed Files Count: ${totalFiles} (+${summary.insertions} -${summary.deletions})`);
  for (const file of diffData.stagedFiles) {
    lines.push(`- [${file.changeType}] ${file.path}`);
  }
  lines.push('');

  lines.push('Workspace Sibling Repositories to check for impact:');
  if (siblingImpacts.length === 0) {
    lines.push('(No sibling repositories in this workspace)');
  } else {
    for (const sib of siblingImpacts) {
      lines.push(`- Repository: ${sib.repoName} (${sib.repoPath})`);
      if (sib.affectedSymbolsOrEndpoints && sib.affectedSymbolsOrEndpoints.length > 0) {
        lines.push(`  * Detected touchpoints: ${sib.affectedSymbolsOrEndpoints.join(', ')}`);
      }
      if (sib.affectedFiles && sib.affectedFiles.length > 0) {
        lines.push(`  * Candidate files in sibling: ${sib.affectedFiles.join(', ')}`);
      }
    }
  }
  lines.push('');

  if (customPrompt && customPrompt.trim().length > 0) {
    lines.push('User Focus / Custom Question:');
    lines.push(customPrompt.trim());
    lines.push('');
  }

  lines.push('Active Repository Diff:');
  lines.push('```diff');
  lines.push(truncateDiff(diffData.rawDiff, maxDiffChars, totalFiles));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Robustly parses AI JSON output for workspace reviews, falling back safely if markdown fences or text are present.
 */
export function parseWorkspaceReviewResponse(
  rawResponse: string,
  activeRepoPath: string,
  activeRepoName: string,
  baselineImpacts: SiblingRepoImpact[],
  mode: ReviewAudienceMode
): WorkspaceReviewResult {
  const raw = (rawResponse || '').trim();

  // Try extracting JSON from potential code block or raw string
  let jsonString = raw;
  const jsonBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    jsonString = jsonBlockMatch[1].trim();
  } else {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonString = raw.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object') {
      const plainEnglishSummary =
        typeof parsed.plainEnglishSummary === 'string' && parsed.plainEnglishSummary.trim()
          ? parsed.plainEnglishSummary.trim()
          : 'Changes made in this repository update application behavior.';

      const whyItMatters =
        typeof parsed.whyItMatters === 'string' && parsed.whyItMatters.trim()
          ? parsed.whyItMatters.trim()
          : 'Updates ensure system stability and intended behavior for users.';

      const suggestedVerification = Array.isArray(parsed.suggestedVerification)
        ? parsed.suggestedVerification.filter((s: unknown) => typeof s === 'string' && s.trim())
        : ['Verify changed flows work as expected without errors.'];

      const technicalDetails =
        typeof parsed.technicalDetails === 'string' && parsed.technicalDetails.trim()
          ? parsed.technicalDetails.trim()
          : undefined;

      const overallImpactStatus: ImpactSeverity =
        parsed.overallImpactStatus === 'breaking_risk'
          ? 'breaking_risk'
          : parsed.overallImpactStatus === 'potential_impact'
          ? 'potential_impact'
          : 'safe';

      // Merge AI assessed sibling impacts with baseline scanner impacts
      const crossRepoImpacts: SiblingRepoImpact[] = baselineImpacts.map((base) => {
        const found = Array.isArray(parsed.crossRepoImpacts)
          ? parsed.crossRepoImpacts.find(
              (item: any) =>
                item &&
                typeof item === 'object' &&
                (item.repoName === base.repoName ||
                  item.repoPath === base.repoPath ||
                  base.repoName.toLowerCase().includes(String(item.repoName || '').toLowerCase()))
            )
          : null;

        if (found) {
          const status: ImpactSeverity =
            found.status === 'breaking_risk'
              ? 'breaking_risk'
              : found.status === 'potential_impact'
              ? 'potential_impact'
              : 'safe';

          return {
            ...base,
            status: base.status === 'potential_impact' && status === 'safe' ? 'potential_impact' : status,
            summary: typeof found.summary === 'string' && found.summary.trim() ? found.summary.trim() : base.summary,
          };
        }
        return base;
      });

      return {
        activeRepoPath,
        activeRepoName,
        mode,
        plainEnglishSummary,
        whyItMatters,
        suggestedVerification,
        technicalDetails,
        crossRepoImpacts,
        overallImpactStatus: crossRepoImpacts.some((i) => i.status === 'breaking_risk')
          ? 'breaking_risk'
          : crossRepoImpacts.some((i) => i.status === 'potential_impact')
          ? 'potential_impact'
          : overallImpactStatus,
        rawResponse: raw,
      };
    }
  } catch {
    // Graceful fallback when model returns free text
  }

  // Fallback synthesis from raw text
  const cleanedText = cleanRawResponse(raw);
  const fallbackOverallStatus: ImpactSeverity = baselineImpacts.some((i) => i.status === 'potential_impact')
    ? 'potential_impact'
    : 'safe';

  return {
    activeRepoPath,
    activeRepoName,
    mode,
    plainEnglishSummary: cleanedText || 'Changes inspected across workspace repositories.',
    whyItMatters: 'Ensures workspace stability and cross-project compatibility.',
    suggestedVerification: [
      'Test the active repository changes directly.',
      'Check sibling projects if shared dependencies or endpoints were updated.',
    ],
    crossRepoImpacts: baselineImpacts,
    overallImpactStatus: fallbackOverallStatus,
    rawResponse: raw,
  };
}
