import { describe, it, expect } from 'vitest';
import {
  cleanCommitMessage,
  parseConventionalCommit,
  validateConventionalCommit,
} from '../../src/renderer/services/conventionalCommitParser';

describe('Conventional Commit Parser (src/renderer/services/conventionalCommitParser.ts)', () => {
  it('cleanCommitMessage removes backticks, quotes, and preambles', () => {
    expect(cleanCommitMessage('```\nfeat: test\n```')).toBe('feat: test');
    expect(cleanCommitMessage('"feat: quoted"')).toBe('feat: quoted');
    expect(cleanCommitMessage('Here is the commit message: feat: clean')).toBe('feat: clean');
  });

  it('parses valid conventional commit without scope', () => {
    const res = parseConventionalCommit('docs: update installation instructions');
    expect(res.isValid).toBe(true);
    expect(res.type).toBe('docs');
    expect(res.scope).toBeUndefined();
    expect(res.isBreaking).toBe(false);
    expect(res.subject).toBe('update installation instructions');
  });

  it('parses valid conventional commit with scope', () => {
    const res = parseConventionalCommit('refactor(parser): simplify regex pattern');
    expect(res.isValid).toBe(true);
    expect(res.type).toBe('refactor');
    expect(res.scope).toBe('parser');
    expect(res.isBreaking).toBe(false);
    expect(res.subject).toBe('simplify regex pattern');
  });

  it('parses breaking change using exclamation mark (!)', () => {
    const res = parseConventionalCommit('feat(api)!: remove deprecated v1 endpoints');
    expect(res.isValid).toBe(true);
    expect(res.type).toBe('feat');
    expect(res.scope).toBe('api');
    expect(res.isBreaking).toBe(true);
    expect(res.subject).toBe('remove deprecated v1 endpoints');
  });

  it('parses multi-line commit message with body', () => {
    const commit = 'fix: prevent memory leak\n\nEnsure timers are cleared on unmount.\nAlso remove event listeners.';
    const res = parseConventionalCommit(commit);
    expect(res.isValid).toBe(true);
    expect(res.type).toBe('fix');
    expect(res.subject).toBe('prevent memory leak');
    expect(res.body).toContain('Ensure timers are cleared on unmount.');
    expect(res.body).toContain('Also remove event listeners.');
  });

  it('validates conventional commit structure', () => {
    const valid = parseConventionalCommit('test: add unit tests for parser');
    expect(validateConventionalCommit(valid).isValid).toBe(true);
    expect(validateConventionalCommit(valid).errors).toHaveLength(0);

    const invalid = parseConventionalCommit('random commit text');
    const valResult = validateConventionalCommit(invalid);
    expect(valResult.isValid).toBe(false);
    expect(valResult.errors.length).toBeGreaterThan(0);
  });
});
