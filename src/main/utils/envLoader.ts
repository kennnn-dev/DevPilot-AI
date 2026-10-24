import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Lightweight native environment loader.
 * Loads variables from .env in the working directory or ~/.devpilot.env into process.env without external dependencies.
 */
export function loadEnvFiles(): void {
  const candidatePaths = [
    path.join(process.cwd(), '.env'),
    path.join(os.homedir(), '.devpilot.env'),
  ];

  for (const envPath of candidatePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch {
      // Ignore filesystem access errors gracefully
    }
  }
}
