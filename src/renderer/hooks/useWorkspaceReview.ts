import { useState, useCallback } from 'react';
import type {
  ReviewAudienceMode,
  WorkspaceReviewResult,
  WorkspaceReviewOptions,
} from '../../shared/types';
import {
  getActiveProvider,
  getWebhookUrl,
  getWebhookToken,
  getOllamaConfig,
  getOpenAIConfig,
  getGeminiConfig,
} from '../services/aiConfig';

export interface UseWorkspaceReviewParams {
  activeRepoPath: string | null;
  workspaceRepoPaths: string[];
}

export interface UseWorkspaceReviewReturn {
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  reviewResult: WorkspaceReviewResult | null;
  mode: ReviewAudienceMode;
  customPrompt: string;
  openReview: () => void;
  closeReview: () => void;
  setMode: (mode: ReviewAudienceMode) => void;
  setCustomPrompt: (prompt: string) => void;
  runReview: (targetMode?: ReviewAudienceMode) => Promise<void>;
  clearReview: () => void;
}

export function useWorkspaceReview({
  activeRepoPath,
  workspaceRepoPaths,
}: UseWorkspaceReviewParams): UseWorkspaceReviewReturn {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<WorkspaceReviewResult | null>(null);
  const [mode, setMode] = useState<ReviewAudienceMode>('plain');
  const [customPrompt, setCustomPrompt] = useState<string>('');

  const openReview = useCallback(() => {
    setIsOpen(true);
    setError(null);
  }, []);

  const closeReview = useCallback(() => {
    setIsOpen(false);
  }, []);

  const clearReview = useCallback(() => {
    setReviewResult(null);
    setError(null);
  }, []);

  const runReview = useCallback(
    async (targetMode?: ReviewAudienceMode) => {
      if (!activeRepoPath) {
        setError('No active repository selected.');
        return;
      }

      const activeMode = targetMode || mode;
      setLoading(true);
      setError(null);

      try {
        if (!window?.devPilot?.reviewWorkspaceChanges) {
          throw new Error('Workspace Review API is not available on window.devPilot.');
        }

        const provider = getActiveProvider();
        const webhookUrl = getWebhookUrl();
        const webhookToken = getWebhookToken();
        const ollama = getOllamaConfig();
        const openai = getOpenAIConfig();
        const gemini = getGeminiConfig();

        const options: WorkspaceReviewOptions = {
          activeRepoPath,
          workspaceRepoPaths: workspaceRepoPaths || [],
          mode: activeMode,
          provider,
          customPrompt: customPrompt.trim() || undefined,
          webhookUrl: webhookUrl || undefined,
          webhookToken: webhookToken || undefined,
          ollamaBaseUrl: ollama.baseUrl || undefined,
          ollamaModel: ollama.model || undefined,
          openaiApiKey: openai.apiKey || undefined,
          openaiModel: openai.model || undefined,
          openaiBaseUrl: openai.baseUrl || undefined,
          geminiApiKey: gemini.apiKey || undefined,
          geminiModel: gemini.model || undefined,
        };

        const res = await window.devPilot.reviewWorkspaceChanges(options);

        if (!res.success || !res.data) {
          setError(res.error || 'Failed to analyze workspace changes.');
        } else {
          setReviewResult(res.data);
          setError(null);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [activeRepoPath, workspaceRepoPaths, mode, customPrompt]
  );

  return {
    isOpen,
    loading,
    error,
    reviewResult,
    mode,
    customPrompt,
    openReview,
    closeReview,
    setMode,
    setCustomPrompt,
    runReview,
    clearReview,
  };
}
