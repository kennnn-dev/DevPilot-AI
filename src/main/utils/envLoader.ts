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

/**
 * Returns default AI provider configured in environment if valid.
 */
export function getEnvAIProvider(): 'webhook' | 'ollama' | 'openai' | 'gemini' | undefined {
  const raw = (process.env.DEVPILOT_AI_PROVIDER || process.env.AI_PROVIDER || '').toLowerCase().trim();
  if (raw === 'webhook' || raw === 'ollama' || raw === 'openai' || raw === 'gemini') {
    return raw;
  }
  return undefined;
}

/**
 * Resolves Ollama defaults from environment.
 */
export function getEnvOllamaConfig(): { baseUrl: string; model: string } {
  return {
    baseUrl:
      process.env.DEVPILOT_OLLAMA_URL ||
      process.env.OLLAMA_HOST ||
      process.env.OLLAMA_BASE_URL ||
      'http://localhost:11434',
    model:
      process.env.DEVPILOT_OLLAMA_MODEL ||
      process.env.OLLAMA_MODEL ||
      'llama3.2',
  };
}

/**
 * Resolves OpenAI defaults from environment.
 */
export function getEnvOpenAIConfig(): { apiKey: string; model: string; baseUrl: string } {
  return {
    apiKey:
      process.env.DEVPILOT_OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '',
    model:
      process.env.DEVPILOT_OPENAI_MODEL ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-mini',
    baseUrl:
      process.env.DEVPILOT_OPENAI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1',
  };
}

/**
 * Resolves Gemini defaults from environment.
 */
export function getEnvGeminiConfig(): { apiKey: string; model: string } {
  return {
    apiKey:
      process.env.DEVPILOT_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      '',
    model:
      process.env.DEVPILOT_GEMINI_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-1.5-flash',
  };
}

