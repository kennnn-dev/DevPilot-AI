import { useState, useCallback } from 'react';
import type { ParsedConventionalCommit, WebhookGenerateCommitOptions } from '../../shared/types';
import { parseConventionalCommit } from '../services/conventionalCommitParser';
import {
  resolveEffectiveWebhookConfig,
  getWebhookUrl,
  getWebhookToken,
} from '../services/webhookConfig';

export interface RepoCommitState {
  isGenerating: boolean;
  generatedCommit: string | null;
  parsedCommit: ParsedConventionalCommit | null;
  error: string | null;
  customPrompt: string;
}

const defaultRepoState: RepoCommitState = {
  isGenerating: false,
  generatedCommit: null,
  parsedCommit: null,
  error: null,
  customPrompt: '',
};

export function useCommitGenerator(activeRepoPath: string | null) {
  const [repoStates, setRepoStates] = useState<Record<string, RepoCommitState>>({});

  const currentState = (activeRepoPath && repoStates[activeRepoPath]) || defaultRepoState;

  const updateState = useCallback(
    (repo: string, updater: Partial<RepoCommitState> | ((prev: RepoCommitState) => Partial<RepoCommitState>)) => {
      setRepoStates((prev) => {
        const existing = prev[repo] || defaultRepoState;
        const updates = typeof updater === 'function' ? updater(existing) : updater;
        return {
          ...prev,
          [repo]: { ...existing, ...updates },
        };
      });
    },
    []
  );

  const setCustomPrompt = useCallback(
    (prompt: string) => {
      if (!activeRepoPath) return;
      updateState(activeRepoPath, { customPrompt: prompt });
    },
    [activeRepoPath, updateState]
  );

  const setGeneratedCommit = useCallback(
    (msg: string) => {
      if (!activeRepoPath) return;
      const parsed = parseConventionalCommit(msg);
      updateState(activeRepoPath, { generatedCommit: msg, parsedCommit: parsed });
    },
    [activeRepoPath, updateState]
  );

  const clearCommit = useCallback(
    (repo?: string) => {
      const target = repo || activeRepoPath;
      if (!target) return;
      updateState(target, { generatedCommit: null, parsedCommit: null, error: null });
    },
    [activeRepoPath, updateState]
  );

  const resetError = useCallback(
    (repo?: string) => {
      const target = repo || activeRepoPath;
      if (!target) return;
      updateState(target, { error: null });
    },
    [activeRepoPath, updateState]
  );

  const generateCommit = useCallback(
    async (repoPath: string, webhookUrl?: string, prompt?: string): Promise<boolean> => {
      if (!repoPath) return false;
      const targetPrompt = prompt !== undefined ? prompt : currentState.customPrompt;

      updateState(repoPath, { isGenerating: true, error: null });

      if (typeof window === 'undefined' || !window.devPilot || typeof window.devPilot.generateCommitMessage !== 'function') {
        updateState(repoPath, {
          isGenerating: false,
          error: 'DevPilot API generateCommitMessage bridge is not available.',
        });
        return false;
      }

      try {
        let resolvedUrl = (webhookUrl || '').trim();
        let resolvedToken = getWebhookToken() || undefined;

        // If URL not provided by caller, dynamically resolve effective config
        if (!resolvedUrl) {
          try {
            const config = await resolveEffectiveWebhookConfig();
            if (config && config.webhookUrl) {
              resolvedUrl = config.webhookUrl.trim();
            }
            if (config && config.webhookToken) {
              resolvedToken = config.webhookToken.trim();
            }
          } catch {
            resolvedUrl = getWebhookUrl().trim();
          }
        }

        const payload: WebhookGenerateCommitOptions = {
          repoPath,
        };

        if (resolvedUrl) {
          payload.webhookUrl = resolvedUrl;
        }
        if (resolvedToken) {
          payload.webhookToken = resolvedToken;
        }
        const trimmedPrompt = (targetPrompt !== undefined ? targetPrompt : currentState.customPrompt)?.trim();
        if (trimmedPrompt && trimmedPrompt.length > 0) {
          payload.customPrompt = trimmedPrompt;
        }

        const res = await window.devPilot.generateCommitMessage(payload);

        if (res.success && res.data) {
          updateState(repoPath, {
            isGenerating: false,
            generatedCommit: res.data.commitMessage,
            parsedCommit: res.data.parsed,
            error: null,
          });
          return true;
        } else {
          updateState(repoPath, {
            isGenerating: false,
            error: res.error || 'Failed to generate commit message.',
          });
          return false;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        updateState(repoPath, {
          isGenerating: false,
          error: msg,
        });
        return false;
      }
    },
    [currentState.customPrompt, updateState]
  );

  return {
    isGenerating: currentState.isGenerating,
    generatedCommit: currentState.generatedCommit,
    parsedCommit: currentState.parsedCommit,
    error: currentState.error,
    customPrompt: currentState.customPrompt,
    setCustomPrompt,
    setGeneratedCommit,
    generateCommit,
    clearCommit,
    resetError,
    repoStates,
  };
}
