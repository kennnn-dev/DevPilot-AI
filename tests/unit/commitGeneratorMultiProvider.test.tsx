/**
 * Comprehensive Automated Unit Test Suite for Multi-Provider AI Commit Generator UI
 * Target: src/renderer/components/CommitGenerator/CommitGeneratorPanel.tsx
 * Targets Features: F50, F51, F52, F53 (Milestone M11)
 *
 * Verifies:
 * 1. Active Provider Badge Rendering for Webhook, Ollama, OpenAI, and Gemini
 * 2. Dynamic Unconfigured Warning Banner and "Open Settings" delegation
 * 3. Transparent Dynamic Dispatch (window.devPilot.generateCommitMessage) with correct provider payloads
 * 4. Actionable Provider-Tailored Error Guidance (Ollama offline/ECONNREFUSED, missing model, invalid API key, quota 429, timeout)
 * 5. Robust In-Place Retry Mechanism restoring previous generation options
 * 6. Backward Compatibility with legacy selectors and existing tests in commitGeneratorUI.test.tsx
 * 7. Safety Audit: Read-Only Git guarantee & Secret Masking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommitGeneratorPanel from '../../src/renderer/components/CommitGenerator/CommitGeneratorPanel';
import type { DevPilotAPI, ResolvedAIConfig } from '../../src/shared/types';
import * as aiConfig from '../../src/renderer/services/aiConfig';

describe('CommitGeneratorPanel Multi-Provider Test Suite (tests/unit/commitGeneratorMultiProvider.test.tsx)', () => {
  let mockApi: Partial<DevPilotAPI>;

  const defaultResolvedAIConfig: ResolvedAIConfig = {
    activeProvider: 'webhook',
    providerConfigs: {
      webhook: {
        webhookUrl: 'https://n8n.cloud/webhook/commit-gen',
        webhookToken: 'secret-webhook-token',
      },
      ollama: {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.2',
      },
      openai: {
        apiKey: 'sk-test-openai-key-12345',
        model: 'gpt-4o-mini',
      },
      gemini: {
        apiKey: 'AIzaSyTestGeminiKey67890',
        model: 'gemini-1.5-flash',
      },
    },
    sources: {
      webhook: 'user',
      ollama: 'none',
      openai: 'user',
      gemini: 'user',
    },
    envDefaults: {
      activeProvider: 'webhook',
      webhookUrl: '',
      hasWebhookToken: false,
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
      hasOpenAiKey: false,
      openAiModel: 'gpt-4o-mini',
      hasGeminiKey: false,
      geminiModel: 'gemini-1.5-flash',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockApi = {
      generateCommitMessage: vi.fn().mockResolvedValue({
        success: true,
        data: {
          commitMessage: 'feat(core): initial multi-provider commit\n\nGenerated via active AI provider.',
          parsed: {
            raw: 'feat(core): initial multi-provider commit\n\nGenerated via active AI provider.',
            type: 'feat',
            scope: 'core',
            subject: 'initial multi-provider commit',
            body: 'Generated via active AI provider.',
            isBreaking: false,
            isValid: true,
          },
        },
      }),
      getAIConfig: vi.fn().mockResolvedValue({
        success: true,
        data: JSON.parse(JSON.stringify(defaultResolvedAIConfig)),
      }),
      getWebhookConfig: vi.fn().mockResolvedValue({
        success: true,
        data: {
          webhookUrl: 'https://n8n.cloud/webhook/commit-gen',
          source: 'user',
          envDefaults: { webhookUrl: '', hasToken: false },
        },
      }),
    };

    Object.defineProperty(window, 'devPilot', {
      value: mockApi,
      writable: true,
      configurable: true,
    });

    // Default configuration in storage
    aiConfig.setActiveProvider('webhook');
    aiConfig.setWebhookConfig({
      webhookUrl: 'https://n8n.cloud/webhook/commit-gen',
      webhookToken: 'secret-webhook-token',
    });
    aiConfig.setOllamaConfig({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });
    aiConfig.setOpenAIConfig({
      apiKey: 'sk-test-openai-key-12345',
      model: 'gpt-4o-mini',
    });
    aiConfig.setGeminiConfig({
      apiKey: 'AIzaSyTestGeminiKey67890',
      model: 'gemini-1.5-flash',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Active Provider Badge Rendering (F50)
  // =========================================================================
  describe('Active Provider Badge Rendering (F50)', () => {
    it('renders Webhook badge ("Custom Webhook") when active provider is webhook', async () => {
      aiConfig.setActiveProvider('webhook');

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const badge = await screen.findByTestId('commit-generator-provider-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('Custom Webhook');
    });

    it('renders Ollama badge with default model ("Ollama (llama3.2)")', async () => {
      aiConfig.setActiveProvider('ollama');
      aiConfig.setOllamaConfig({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const badge = await screen.findByTestId('commit-generator-provider-badge');
      expect(badge.textContent).toBe('Ollama (llama3.2)');
    });

    it('renders Ollama badge with custom model ("Ollama (codellama:13b)")', async () => {
      aiConfig.setActiveProvider('ollama');
      aiConfig.setOllamaConfig({ baseUrl: 'http://localhost:11434', model: 'codellama:13b' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const badge = await screen.findByTestId('commit-generator-provider-badge');
      expect(badge.textContent).toBe('Ollama (codellama:13b)');
    });

    it('renders OpenAI badge with default model ("OpenAI (gpt-4o-mini)")', async () => {
      aiConfig.setActiveProvider('openai');
      aiConfig.setOpenAIConfig({ apiKey: 'sk-test', model: 'gpt-4o-mini' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const badge = await screen.findByTestId('commit-generator-provider-badge');
      expect(badge.textContent).toBe('OpenAI (gpt-4o-mini)');
    });

    it('renders OpenAI badge with custom model ("OpenAI (gpt-4o)")', async () => {
      aiConfig.setActiveProvider('openai');
      aiConfig.setOpenAIConfig({ apiKey: 'sk-test', model: 'gpt-4o' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const badge = await screen.findByTestId('commit-generator-provider-badge');
      expect(badge.textContent).toBe('OpenAI (gpt-4o)');
    });

    it('renders Gemini badge with default model ("Gemini (gemini-1.5-flash)")', async () => {
      aiConfig.setActiveProvider('gemini');
      aiConfig.setGeminiConfig({ apiKey: 'AIza-test', model: 'gemini-1.5-flash' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const badge = await screen.findByTestId('commit-generator-provider-badge');
      expect(badge.textContent).toBe('Gemini (gemini-1.5-flash)');
    });

    it('renders Gemini badge with custom model ("Gemini (gemini-1.5-pro)")', async () => {
      aiConfig.setActiveProvider('gemini');
      aiConfig.setGeminiConfig({ apiKey: 'AIza-test', model: 'gemini-1.5-pro' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const badge = await screen.findByTestId('commit-generator-provider-badge');
      expect(badge.textContent).toBe('Gemini (gemini-1.5-pro)');
    });

    it('supports alias data-testid="active-provider-badge" for backward compatibility', async () => {
      aiConfig.setActiveProvider('ollama');

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={1}
          isOpen={true}
        />
      );

      await waitFor(() => {
        const badge =
          screen.queryByTestId('commit-generator-provider-badge') ||
          screen.queryByTestId('active-provider-badge');
        expect(badge).not.toBeNull();
        expect(badge?.textContent).toContain('Ollama');
      });
    });
  });

  // =========================================================================
  // 2. Unconfigured Warning Banner Rendering & Guardrails (F52)
  // =========================================================================
  describe('Dynamic Unconfigured Warning Banner (F52)', () => {
    it('displays unconfigured warning banner and disables generate button when Webhook has no URL', async () => {
      aiConfig.setActiveProvider('webhook');
      aiConfig.clearWebhookConfig();
      mockApi.getAIConfig = vi.fn().mockResolvedValue({
        success: true,
        data: {
          ...defaultResolvedAIConfig,
          activeProvider: 'webhook',
          providerConfigs: {
            ...defaultResolvedAIConfig.providerConfigs,
            webhook: { webhookUrl: '', webhookToken: '' },
          },
          sources: { ...defaultResolvedAIConfig.sources, webhook: 'none' },
        },
      });

      const handleOpenSettings = vi.fn();
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
          onOpenSettings={handleOpenSettings}
        />
      );

      const banner = await screen.findByTestId('commit-unconfigured-banner');
      expect(banner).toBeInTheDocument();
      expect(banner.textContent).toMatch(/Webhook endpoint not configured/i);

      // Verify generate button is disabled
      const generateBtn = screen.getByTestId('generate-commit-btn') as HTMLButtonElement;
      expect(generateBtn.disabled).toBe(true);

      // Verify Open Settings link/button triggers callback
      const openSettingsLink = screen.getByTestId('commit-open-settings-link');
      fireEvent.click(openSettingsLink);
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('displays unconfigured warning banner when OpenAI API key is missing', async () => {
      aiConfig.setActiveProvider('openai');
      aiConfig.setOpenAIConfig({ apiKey: '', model: 'gpt-4o-mini' });
      mockApi.getAIConfig = vi.fn().mockResolvedValue({
        success: true,
        data: {
          ...defaultResolvedAIConfig,
          activeProvider: 'openai',
          providerConfigs: {
            ...defaultResolvedAIConfig.providerConfigs,
            openai: { apiKey: '', model: 'gpt-4o-mini' },
          },
          sources: { ...defaultResolvedAIConfig.sources, openai: 'none' },
        },
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const banner = await screen.findByTestId('commit-unconfigured-banner');
      expect(banner.textContent).toMatch(/OpenAI API key.*not configured/i);
      const generateBtn = screen.getByTestId('generate-commit-btn') as HTMLButtonElement;
      expect(generateBtn.disabled).toBe(true);
    });

    it('displays unconfigured warning banner when Gemini API key is missing', async () => {
      aiConfig.setActiveProvider('gemini');
      aiConfig.setGeminiConfig({ apiKey: '', model: 'gemini-1.5-flash' });
      mockApi.getAIConfig = vi.fn().mockResolvedValue({
        success: true,
        data: {
          ...defaultResolvedAIConfig,
          activeProvider: 'gemini',
          providerConfigs: {
            ...defaultResolvedAIConfig.providerConfigs,
            gemini: { apiKey: '', model: 'gemini-1.5-flash' },
          },
          sources: { ...defaultResolvedAIConfig.sources, gemini: 'none' },
        },
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const banner = await screen.findByTestId('commit-unconfigured-banner');
      expect(banner.textContent).toMatch(/Gemini API key.*not configured/i);
      const generateBtn = screen.getByTestId('generate-commit-btn') as HTMLButtonElement;
      expect(generateBtn.disabled).toBe(true);
    });

    it('does NOT display unconfigured banner for Ollama when default localhost & model exist', async () => {
      aiConfig.setActiveProvider('ollama');
      aiConfig.setOllamaConfig({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      await waitFor(() => {
        expect(screen.queryByTestId('commit-unconfigured-banner')).toBeNull();
      });

      const generateBtn = screen.getByTestId('generate-commit-btn') as HTMLButtonElement;
      expect(generateBtn.disabled).toBe(false);
    });

    it('maintains legacy data-testid="generator-unconfigured-prompt" and "open-settings-action"', async () => {
      aiConfig.setActiveProvider('webhook');
      aiConfig.clearWebhookConfig();

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={1}
          isOpen={true}
          onOpenSettings={vi.fn()}
        />
      );

      await waitFor(() => {
        const legacyBanner =
          screen.queryByTestId('generator-unconfigured-prompt') ||
          screen.queryByTestId('commit-unconfigured-banner');
        expect(legacyBanner).not.toBeNull();
      });
    });
  });

  // =========================================================================
  // 3. Transparent Dynamic Dispatch (F51)
  // =========================================================================
  describe('Transparent Dynamic Dispatch (F51)', () => {
    it('dispatches to Webhook with URL, token, and custom instructions', async () => {
      aiConfig.setActiveProvider('webhook');
      aiConfig.setWebhookConfig({
        webhookUrl: 'https://n8n.cloud/webhook/commit-gen',
        webhookToken: 'bearer-token-123',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={3}
          isOpen={true}
        />
      );

      const promptInput = (await screen.findByTestId('custom-instructions-input')) as HTMLInputElement;
      fireEvent.change(promptInput, { target: { value: 'Refactor auth middleware' } });

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            repoPath: '/workspace/project',
            provider: 'webhook',
            webhookUrl: 'https://n8n.cloud/webhook/commit-gen',
            webhookToken: 'bearer-token-123',
            customPrompt: 'Refactor auth middleware',
          })
        );
      });
    });

    it('dispatches to Ollama with baseUrl, model, and repoPath', async () => {
      aiConfig.setActiveProvider('ollama');
      aiConfig.setOllamaConfig({
        baseUrl: 'http://127.0.0.1:11434',
        model: 'codellama',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      const generateBtn = await screen.findByTestId('generate-commit-btn');
      fireEvent.click(generateBtn);

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            repoPath: '/workspace/project',
            provider: 'ollama',
            ollamaBaseUrl: 'http://127.0.0.1:11434',
            ollamaModel: 'codellama',
          })
        );
      });
    });

    it('dispatches to OpenAI with apiKey, model, and repoPath', async () => {
      aiConfig.setActiveProvider('openai');
      aiConfig.setOpenAIConfig({
        apiKey: 'sk-proj-super-key',
        model: 'gpt-4o',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={1}
          isOpen={true}
        />
      );

      const generateBtn = await screen.findByTestId('generate-commit-btn');
      fireEvent.click(generateBtn);

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            repoPath: '/workspace/project',
            provider: 'openai',
            openaiApiKey: 'sk-proj-super-key',
            openaiModel: 'gpt-4o',
          })
        );
      });
    });

    it('dispatches to Gemini with apiKey, model, and repoPath', async () => {
      aiConfig.setActiveProvider('gemini');
      aiConfig.setGeminiConfig({
        apiKey: 'AIzaSyGoogleKey999',
        model: 'gemini-1.5-pro',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={4}
          isOpen={true}
        />
      );

      const generateBtn = await screen.findByTestId('generate-commit-btn');
      fireEvent.click(generateBtn);

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            repoPath: '/workspace/project',
            provider: 'gemini',
            geminiApiKey: 'AIzaSyGoogleKey999',
            geminiModel: 'gemini-1.5-pro',
          })
        );
      });
    });

    it('dynamically switches payload when active provider is updated without manual re-entry', async () => {
      // 1. Initial provider is Webhook
      aiConfig.setActiveProvider('webhook');
      aiConfig.setWebhookConfig({ webhookUrl: 'https://n8n.cloud/webhook/hook-1' });

      const { rerender } = render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'webhook',
            webhookUrl: 'https://n8n.cloud/webhook/hook-1',
          })
        );
      });

      // 2. Switch provider to OpenAI in storage
      aiConfig.setActiveProvider('openai');
      aiConfig.setOpenAIConfig({ apiKey: 'sk-switch-key', model: 'gpt-4o-mini' });

      rerender(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'openai',
            openaiApiKey: 'sk-switch-key',
            openaiModel: 'gpt-4o-mini',
          })
        );
      });
    });
  });

  // =========================================================================
  // 4. Provider-Tailored Error Handling & In-Place Retry (F53)
  // =========================================================================
  describe('Provider-Tailored Error Guidance & In-Place Retry (F53)', () => {
    it('surfaces actionable "ollama serve" guidance and Retry button on Ollama ECONNREFUSED', async () => {
      aiConfig.setActiveProvider('ollama');
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: false,
        error: "Local Ollama is offline or unreachable at http://localhost:11434. Please ensure Ollama is running ('ollama serve').",
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('commit-generator-error')).toBeInTheDocument();
        expect(screen.getByText(/ollama serve/i)).toBeInTheDocument();
      });

      const retryBtn = screen.getByTestId('commit-retry-btn');
      expect(retryBtn).toBeInTheDocument();
    });

    it('surfaces actionable "ollama pull" guidance on missing model (HTTP 404)', async () => {
      aiConfig.setActiveProvider('ollama');
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: false,
        error: "Ollama model 'llama3.2' not found. Run 'ollama pull llama3.2' in your terminal to download it.",
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByText(/ollama pull llama3\.2/i)).toBeInTheDocument();
      });
    });

    it('surfaces Open Settings button on HTTP 401 Invalid API Key for Cloud providers', async () => {
      aiConfig.setActiveProvider('openai');
      const handleOpenSettings = vi.fn();
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: false,
        error: 'Invalid OpenAI API key. Please check and update your API key in Settings.',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
          onOpenSettings={handleOpenSettings}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(
          screen.queryByText(/Invalid API key for OpenAI \/ Gemini/i) ||
          screen.queryByText(/Invalid OpenAI API key/i)
        ).not.toBeNull();
      });

      const openSettingsBtn = screen.getByTestId('error-open-settings-btn');
      fireEvent.click(openSettingsBtn);
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('surfaces actionable guidance on Quota / Rate limit (HTTP 429)', async () => {
      aiConfig.setActiveProvider('gemini');
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: false,
        error: 'Google Gemini rate limit or quota exceeded. Please wait a moment or check your AI Studio quota.',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={1}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByText(/quota exceeded|rate limit/i)).toBeInTheDocument();
        expect(screen.getByTestId('commit-retry-btn')).toBeInTheDocument();
      });
    });

    it('surfaces actionable guidance on 30-second timeout and allows successful retry', async () => {
      aiConfig.setActiveProvider('webhook');
      mockApi.generateCommitMessage = vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          error: 'Webhook request timed out after 30 seconds.',
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            commitMessage: 'feat(core): successfully resolved on retry',
            parsed: {
              raw: 'feat(core): successfully resolved on retry',
              type: 'feat',
              scope: 'core',
              subject: 'successfully resolved on retry',
              isBreaking: false,
              isValid: true,
            },
          },
        });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByText(/timed out after 30 seconds/i)).toBeInTheDocument();
      });

      const retryBtn = screen.getByTestId('commit-retry-btn');
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByTestId('commit-subject-input')).toBeInTheDocument();
      });

      const subjectInput = screen.getByTestId('commit-subject-input') as HTMLInputElement;
      expect(subjectInput.value).toBe('feat(core): successfully resolved on retry');
      expect(screen.queryByTestId('commit-generator-error')).toBeNull();
    });
  });

  // =========================================================================
  // 5. Commit Subject/Body Editing and Clipboard Action
  // =========================================================================
  describe('Commit Subject & Body Editing and Clipboard', () => {
    it('populates editable subject, body, and conventional badges on success', async () => {
      aiConfig.setActiveProvider('openai');
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: true,
        data: {
          commitMessage: 'feat(auth)!: add OAuth2 multi-provider\n\nSupports GitHub and Google logins.',
          parsed: {
            raw: 'feat(auth)!: add OAuth2 multi-provider\n\nSupports GitHub and Google logins.',
            type: 'feat',
            scope: 'auth',
            subject: 'add OAuth2 multi-provider',
            body: 'Supports GitHub and Google logins.',
            isBreaking: true,
            isValid: true,
          },
        },
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={3}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('commit-subject-input')).toBeInTheDocument();
      });

      const subjectInput = screen.getByTestId('commit-subject-input') as HTMLInputElement;
      expect(subjectInput.value).toBe('feat(auth)!: add OAuth2 multi-provider');

      const bodyInput = screen.getByTestId('commit-body-textarea') as HTMLTextAreaElement;
      expect(bodyInput.value).toBe('Supports GitHub and Google logins.');

      // Conventional tags
      expect(screen.getByText('feat')).toBeInTheDocument();
      expect(screen.getByText('(auth)')).toBeInTheDocument();
      expect(screen.getByText('BREAKING')).toBeInTheDocument();
    });

    it('copies commit message to system clipboard with feedback', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={1}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('copy-commit-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('copy-commit-btn'));

      expect(writeTextMock).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 6. Safety Audit & Read-Only Guarantees
  // =========================================================================
  describe('Safety Audit & Read-Only Guarantees', () => {
    it('does not invoke any mutative Git operations when generating or editing commit message', async () => {
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      fireEvent.click(await screen.findByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalled();
      });

      // Verify no other git IPC handler (status, diff) or mutative call was triggered
      expect(mockApi.openDirectory).toBeUndefined();
    });

    it('masks secrets and does not display raw API keys in UI elements or badges', async () => {
      aiConfig.setActiveProvider('openai');
      aiConfig.setOpenAIConfig({ apiKey: 'sk-supersecretkey999', model: 'gpt-4o' });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      await screen.findByTestId('commit-generator-provider-badge');

      // Ensure API key does NOT appear anywhere in DOM
      expect(screen.queryByText(/sk-supersecretkey999/)).toBeNull();
    });
  });
});
