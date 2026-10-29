import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  extractChangeContext,
  resolveRepoName,
  scanSiblingRepository,
  scanWorkspaceSiblingRepos,
} from '../../src/main/services/workspace/workspaceScanner';
import type { GitFileStatus } from '../../src/shared/types';

describe('Workspace Scanner', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devpilot-scanner-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('extractChangeContext', () => {
    it('extracts API routes, exported symbols, and environment variables from diffs', () => {
      const mockDiff = `
diff --git a/src/api/auth.ts b/src/api/auth.ts
--- a/src/api/auth.ts
+++ b/src/api/auth.ts
@@ -10,4 +10,12 @@
+export interface UserProfile {
+  id: string;
+  email: string;
+}
+export const authenticateUser = async () => {
+  const endpoint = '/api/v1/auth/login';
+  const host = process.env.AUTH_SERVICE_URL;
+  return fetch(endpoint);
+};
`;
      const stagedFiles: GitFileStatus[] = [
        { path: 'src/api/auth.ts', changeType: 'modified', statusCode: 'M ' },
      ];

      const context = extractChangeContext(mockDiff, stagedFiles);

      expect(context.changedFiles).toEqual(['src/api/auth.ts']);
      expect(context.endpoints).toContain('/api/v1/auth/login');
      expect(context.symbols).toContain('UserProfile');
      expect(context.symbols).toContain('authenticateUser');
      expect(context.envVars).toContain('AUTH_SERVICE_URL');
    });

    it('returns empty lists for empty or invalid diffs', () => {
      const context = extractChangeContext('', []);
      expect(context.endpoints).toEqual([]);
      expect(context.symbols).toEqual([]);
      expect(context.envVars).toEqual([]);
      expect(context.changedFiles).toEqual([]);
    });
  });

  describe('resolveRepoName', () => {
    it('reads name from package.json if present', async () => {
      const repoPath = path.join(tempDir, 'my-service');
      await fs.mkdir(repoPath, { recursive: true });
      await fs.writeFile(
        path.join(repoPath, 'package.json'),
        JSON.stringify({ name: '@company/backend-api' })
      );

      const name = await resolveRepoName(repoPath);
      expect(name).toBe('@company/backend-api');
    });

    it('falls back to directory basename if package.json is missing or invalid', async () => {
      const repoPath = path.join(tempDir, 'plain-repo');
      await fs.mkdir(repoPath, { recursive: true });

      const name = await resolveRepoName(repoPath);
      expect(name).toBe('plain-repo');
    });
  });

  describe('scanSiblingRepository', () => {
    it('detects matched endpoints, symbols, and files in sibling repository', async () => {
      const siblingPath = path.join(tempDir, 'frontend-web');
      await fs.mkdir(path.join(siblingPath, 'src'), { recursive: true });

      // Create a file in sibling referencing the API endpoint
      await fs.writeFile(
        path.join(siblingPath, 'src', 'apiClient.ts'),
        `
        import axios from 'axios';
        export function login() {
          return axios.post('/api/v1/auth/login');
        }
        `
      );

      const match = await scanSiblingRepository(siblingPath, {
        endpoints: ['/api/v1/auth/login'],
        symbols: ['UserProfile'],
        envVars: [],
        changedFiles: ['src/api/auth.ts'],
      });

      expect(match.repoName).toBe('frontend-web');
      expect(match.matchedSymbols).toContain('/api/v1/auth/login');
      expect(match.matchedFiles).toContain(path.normalize('src/apiClient.ts'));
    });

    it('ignores files in node_modules and .git', async () => {
      const siblingPath = path.join(tempDir, 'sibling-app');
      await fs.mkdir(path.join(siblingPath, 'node_modules', 'some-pkg'), { recursive: true });

      await fs.writeFile(
        path.join(siblingPath, 'node_modules', 'some-pkg', 'index.js'),
        `const endpoint = '/api/v1/auth/login';`
      );

      const match = await scanSiblingRepository(siblingPath, {
        endpoints: ['/api/v1/auth/login'],
        symbols: [],
        envVars: [],
        changedFiles: [],
      });

      expect(match.matchedSymbols).toEqual([]);
      expect(match.matchedFiles).toEqual([]);
    });
  });

  describe('scanWorkspaceSiblingRepos', () => {
    it('scans all siblings except the active repository', async () => {
      const activePath = path.join(tempDir, 'backend');
      const siblingPath = path.join(tempDir, 'frontend');
      await fs.mkdir(activePath, { recursive: true });
      await fs.mkdir(path.join(siblingPath, 'src'), { recursive: true });

      await fs.writeFile(
        path.join(siblingPath, 'src', 'client.ts'),
        `const url = '/api/orders';`
      );

      const impacts = await scanWorkspaceSiblingRepos(
        activePath,
        [activePath, siblingPath],
        {
          endpoints: ['/api/orders'],
          symbols: [],
          envVars: [],
          changedFiles: ['routes.ts'],
        }
      );

      expect(impacts).toHaveLength(1);
      expect(impacts[0].repoName).toBe('frontend');
      expect(impacts[0].status).toBe('potential_impact');
      expect(impacts[0].affectedSymbolsOrEndpoints).toContain('/api/orders');
    });

    it('marks sibling as safe when no references are detected', async () => {
      const activePath = path.join(tempDir, 'backend');
      const siblingPath = path.join(tempDir, 'docs');
      await fs.mkdir(activePath, { recursive: true });
      await fs.mkdir(siblingPath, { recursive: true });

      await fs.writeFile(path.join(siblingPath, 'README.md'), `# Documentation`);

      const impacts = await scanWorkspaceSiblingRepos(
        activePath,
        [activePath, siblingPath],
        {
          endpoints: ['/api/custom-endpoint'],
          symbols: ['CustomType'],
          envVars: [],
          changedFiles: [],
        }
      );

      expect(impacts).toHaveLength(1);
      expect(impacts[0].status).toBe('safe');
      expect(impacts[0].affectedSymbolsOrEndpoints).toEqual([]);
    });
  });
});
