import type { ParsedConventionalCommit } from '../../shared/types';

export const CONVENTIONAL_COMMIT_TYPES = [
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
] as const;

export type ConventionalCommitType = (typeof CONVENTIONAL_COMMIT_TYPES)[number];

export function cleanCommitMessage(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();

  const prefixRegex =
    /^(?:(?:Sure!?|Certainly!?|Okay!?),?\s+)?(?:Here(?:'s|\s+(?:is|are))\s+(?:the|a|your)\s+(?:suggested\s+|proposed\s+|generated\s+)?commit\s+messages?(?:\s+for\s+your\s+changes)?:?|(?:Suggested|Proposed|Generated|Commit)\s+commit\s+messages?:?|Suggested\s+messages?:?|Proposed\s+messages?:?|Commit\s+messages?:?|Here's\s+(?:a|the|your)\s+commit\s+messages?:?)\s*/i;

  cleaned = cleaned.replace(prefixRegex, '').trim();

  // Strip markdown code fences ONLY if the entire message is enclosed in fences
  if (cleaned.startsWith('```')) {
    const match = cleaned.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\r?\n([\s\S]*?)(?:\r?\n)?```\s*$/);
    if (match) {
      cleaned = match[1].trim();
    }
  }

  cleaned = cleaned.replace(prefixRegex, '').trim();

  // Strip surrounding quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  cleaned = cleaned.replace(prefixRegex, '').trim();

  return cleaned;
}

export function parseConventionalCommit(commitText: string): ParsedConventionalCommit {
  const raw = cleanCommitMessage(commitText);
  if (!raw) {
    return {
      raw: '',
      type: 'chore',
      subject: '',
      isBreaking: false,
      isValid: false,
    };
  }

  const lines = raw.split(/\r?\n/);
  const header = lines[0].trim();
  const body = lines.slice(1).join('\n').trim() || undefined;

  // Pattern: type(scope)!: subject or type: subject
  const regex = /^([a-zA-Z0-9_-]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
  const match = header.match(regex);

  const isBreaking = Boolean(match?.[3]) || /BREAKING[ -]CHANGE:/i.test(raw);

  if (match) {
    const type = match[1].toLowerCase();
    const scope = match[2]?.trim() || undefined;
    const subject = match[4].trim();

    return {
      raw,
      type,
      scope,
      isBreaking,
      subject,
      body,
      isValid: Boolean(type && subject),
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

export function validateConventionalCommit(commit: ParsedConventionalCommit): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!commit.raw.trim()) {
    errors.push('Commit message cannot be empty.');
    return { isValid: false, errors };
  }

  if (!commit.isValid) {
    errors.push('Commit message does not match Conventional Commits format (type(scope)?: description).');
  }

  if (!commit.type) {
    errors.push('Commit type is missing.');
  }

  if (!commit.subject) {
    errors.push('Commit subject description is missing.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
