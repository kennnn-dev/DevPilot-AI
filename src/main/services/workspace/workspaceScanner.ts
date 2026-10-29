/**
 * Workspace Sibling Repository Scanner for DevPilot AI.
 * Safely and efficiently inspects sibling repositories in a workspace for cross-repository impacts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { GitFileStatus, SiblingRepoImpact, ImpactSeverity } from '../../../shared/types';

export interface ExtractedChangeContext {
  endpoints: string[];
  symbols: string[];
  envVars: string[];
  changedFiles: string[];
}

export interface SiblingScanMatch {
  repoPath: string;
  repoName: string;
  matchedSymbols: string[];
  matchedFiles: string[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.output',
  'out',
  'vendor',
  '.agents',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.rb',
  '.php',
  '.env',
  '.yaml',
  '.yml',
  '.html',
  '.vue',
  '.svelte',
]);

/**
 * Extracts candidate API endpoints, exported symbols, and environment variables from diffs.
 */
export function extractChangeContext(
  rawDiff: string,
  stagedFiles: GitFileStatus[]
): ExtractedChangeContext {
  const endpoints = new Set<string>();
  const symbols = new Set<string>();
  const envVars = new Set<string>();
  const changedFiles = stagedFiles.map((f) => f.path);

  if (!rawDiff) {
    return { endpoints: [], symbols: [], envVars: [], changedFiles };
  }

  // 1. API endpoint routes (e.g. /api/users, /v1/checkout, '/auth/login')
  const endpointRegex = /['"`](\/(?:api|v[0-9]+|auth|users|webhook|service|graphql)[a-zA-Z0-9_\-\/]*)['"`]/g;
  let endpointMatch: RegExpExecArray | null;
  while ((endpointMatch = endpointRegex.exec(rawDiff)) !== null) {
    if (endpointMatch[1] && endpointMatch[1].length > 4) {
      endpoints.add(endpointMatch[1]);
    }
  }

  // 2. Exported functions, interfaces, types, classes, consts
  const exportRegex = /^\+\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum)\s+([A-Za-z0-9_]{3,})/gm;
  let exportMatch: RegExpExecArray | null;
  while ((exportMatch = exportRegex.exec(rawDiff)) !== null) {
    if (exportMatch[1]) {
      symbols.add(exportMatch[1]);
    }
  }

  // 3. Environment variables (e.g. process.env.API_URL, VITE_API_URL, NEXT_PUBLIC_URL)
  const envRegex = /\b(?:process\.env\.|import\.meta\.env\.)([A-Z0-9_]{4,})/g;
  let envMatch: RegExpExecArray | null;
  while ((envMatch = envRegex.exec(rawDiff)) !== null) {
    if (envMatch[1]) {
      envVars.add(envMatch[1]);
    }
  }

  return {
    endpoints: Array.from(endpoints).slice(0, 20),
    symbols: Array.from(symbols).slice(0, 20),
    envVars: Array.from(envVars).slice(0, 10),
    changedFiles,
  };
}

/**
 * Safely resolves the display name for a repository directory (from package.json if present or directory name).
 */
export async function resolveRepoName(repoDir: string): Promise<string> {
  const defaultName = path.basename(repoDir);
  try {
    const pkgPath = path.join(repoDir, 'package.json');
    const content = await fs.readFile(pkgPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
      return parsed.name.trim();
    }
  } catch {
    // Fall back to directory basename
  }
  return defaultName;
}

/**
 * Recursively scans files in a repository directory up to maxDepth, collecting files matching extensions.
 */
async function collectFiles(
  dir: string,
  maxFiles = 60,
  currentDepth = 0,
  maxDepth = 4
): Promise<string[]> {
  if (currentDepth > maxDepth) return [];
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) break;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          const subFiles = await collectFiles(
            path.join(dir, entry.name),
            maxFiles - results.length,
            currentDepth + 1,
            maxDepth
          );
          results.push(...subFiles);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          results.push(path.join(dir, entry.name));
        }
      }
    }
  } catch {
    // Gracefully handle unreadable directories
  }

  return results;
}

/**
 * Scans a single sibling repository for references to changed context items.
 */
export async function scanSiblingRepository(
  siblingRepoPath: string,
  context: ExtractedChangeContext
): Promise<SiblingScanMatch> {
  const repoName = await resolveRepoName(siblingRepoPath);
  const searchTerms = [
    ...context.endpoints,
    ...context.symbols,
    ...context.envVars,
  ].filter((term) => term && term.length >= 3);

  if (searchTerms.length === 0) {
    return {
      repoPath: siblingRepoPath,
      repoName,
      matchedSymbols: [],
      matchedFiles: [],
    };
  }

  const matchedSymbols = new Set<string>();
  const matchedFiles = new Set<string>();

  try {
    const files = await collectFiles(siblingRepoPath, 80);

    for (const filePath of files) {
      if (matchedFiles.size >= 15) break;

      try {
        const stat = await fs.stat(filePath);
        // Ignore files larger than 150KB to preserve sub-second response times
        if (stat.size > 150 * 1024) continue;

        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(siblingRepoPath, filePath);

        for (const term of searchTerms) {
          if (content.includes(term)) {
            matchedSymbols.add(term);
            matchedFiles.add(relativePath);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Sibling repo read failure
  }

  return {
    repoPath: siblingRepoPath,
    repoName,
    matchedSymbols: Array.from(matchedSymbols),
    matchedFiles: Array.from(matchedFiles),
  };
}

/**
 * Scans all sibling repositories within a workspace and synthesizes baseline impact status.
 */
export async function scanWorkspaceSiblingRepos(
  activeRepoPath: string,
  workspaceRepoPaths: string[],
  context: ExtractedChangeContext
): Promise<SiblingRepoImpact[]> {
  const siblingPaths = (workspaceRepoPaths || []).filter(
    (p) => p && path.resolve(p) !== path.resolve(activeRepoPath)
  );

  const impacts: SiblingRepoImpact[] = [];

  for (const siblingPath of siblingPaths) {
    try {
      const match = await scanSiblingRepository(siblingPath, context);
      const hasMatches = match.matchedSymbols.length > 0;

      let status: ImpactSeverity = 'safe';
      let summary = 'No shared endpoints, symbols, or environment variables detected in this repository.';

      if (hasMatches) {
        status = 'potential_impact';
        summary = `References detected for ${match.matchedSymbols.join(', ')} across ${match.matchedFiles.length} file(s).`;
      }

      impacts.push({
        repoPath: siblingPath,
        repoName: match.repoName,
        status,
        summary,
        affectedSymbolsOrEndpoints: match.matchedSymbols,
        affectedFiles: match.matchedFiles,
      });
    } catch {
      impacts.push({
        repoPath: siblingPath,
        repoName: path.basename(siblingPath),
        status: 'safe',
        summary: 'Repository directory could not be inspected.',
      });
    }
  }

  return impacts;
}
