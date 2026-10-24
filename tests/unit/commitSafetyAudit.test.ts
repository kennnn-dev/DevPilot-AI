import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Safety Audit: Strictly Read-Only Operations Guarantee', () => {
  const mainDir = path.resolve(__dirname, '../../src/main');

  const readAllSourceFiles = (dir: string): string[] => {
    let files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(readAllSourceFiles(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
    return files;
  };

  it('verifies that no mutative git subcommands are invoked anywhere in main source', () => {
    const prohibitedSubcommands = [
      "'commit'",
      '"commit"',
      "'push'",
      '"push"',
      "'merge'",
      '"merge"',
      "'rebase'",
      '"rebase"',
      "'reset'",
      '"reset"',
      "'checkout'",
      '"checkout"',
      "'branch', '-D'",
      "'tag'",
      '"tag"',
    ];

    const sourceFiles = readAllSourceFiles(mainDir);

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const cmd of prohibitedSubcommands) {
        const regex = new RegExp(`executeGit\\s*\\(\\s*\\[[^\\]]*${cmd}`);
        expect(regex.test(content)).toBe(false);
      }
    }
  });

  it('verifies webhook endpoint dispatches only read-only staged diff information', async () => {
    const webhookFile = path.join(mainDir, 'ipc/webhookHandlers.ts');
    const content = fs.readFileSync(webhookFile, 'utf-8');

    expect(content).toContain("method: 'POST'");
    expect(content).toContain('gitService.getAllStagedDiff');
  });
});
