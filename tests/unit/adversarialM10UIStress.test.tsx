/**
 * Adversarial Stress & State Machine Test Suite for M10 SettingsModal & AI Configuration
 * Target: src/renderer/components/SettingsModal/SettingsModal.tsx
 * Targets Features: F43, F44, F45, F46, F47, F48, F49
 *
 * Objectives:
 * 1. Rapid switching between providers (Webhook -> Ollama -> OpenAI -> Gemini -> Webhook) verifying no state bleeding.
 * 2. Changing values in one provider, switching away without saving, switching back, or switching and saving only that provider.
 * 3. Resetting provider A and verifying provider B's form inputs and localStorage keys remain unaffected.
 * 4. Malformed inputs, whitespace-only URLs/tokens, and URL protocol edge cases.
 * 5. Testing behavior when window.devPilot.getAIConfig rejects with an error or is undefined.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from '../../src/renderer/components/SettingsModal/SettingsModal';
import {
  setActiveProvider,
  getActiveProvider,
  setWebhookConfig,
  setOllamaConfig,
  setOpenAIConfig,
  setGeminiConfig,
  STORAGE_KEY_WEBHOOK_URL,
  STORAGE_KEY_WEBHOOK_TOKEN,
  STORAGE_KEY_LEGACY_WEBHOOK_URL,
  STORAGE_KEY_LEGACY_WEBHOOK_TOKEN,
  STORAGE_KEY_OLLAMA_BASE_URL,
  STORAGE_KEY_OLLAMA_MODEL,
  STORAGE_KEY_OPENAI_API_KEY,
  STORAGE_KEY_OPENAI_MODEL,
  STORAGE_KEY_GEMINI_API_KEY,
  STORAGE_KEY_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../../src/renderer/services/aiConfig';
import type { DevPilotAPI, AIProvider } from '../../src/shared/types';

describe('Adversarial M10 UI Stress & State Machine Verification', () => {
  let mockApi: Partial<DevPilotAPI>;

  const defaultMockAIConfig = {
    activeProvider: 'webhook' as AIProvider,
    providerConfigs: {
      webhook: { webhookUrl: 'https://env.webhook.org/dispatch', webhookToken: '••••••••' },
      ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
      openai: { apiKey: '••••••••', model: 'gpt-4o' },
      gemini: { apiKey: '', model: 'gemini-1.5-flash' },
    },
    sources: {
      webhook: 'env' as const,
      ollama: 'none' as const,
      openai: 'env' as const,
      gemini: 'none' as const,
    },
    envDefaults: {
      activeProvider: 'webhook' as AIProvider,
      webhookUrl: 'https://env.webhook.org/dispatch',
      hasWebhookToken: true,
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2',
      hasOpenAiKey: true,
      openAiModel: 'gpt-4o',
      hasGeminiKey: false,
      geminiModel: 'gemini-1.5-flash',
    },
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    mockApi = {
      getAIConfig: vi.fn().mockResolvedValue({
        success: true,
        data: defaultMockAIConfig,
      }),
      getWebhookConfig: vi.fn().mockResolvedValue({
        success: true,
        data: {
          webhookUrl: 'https://env.webhook.org/dispatch',
          source: 'env',
          envDefaults: {
            webhookUrl: 'https://env.webhook.org/dispatch',
            hasToken: true,
          },
        },
      }),
    };

    Object.defineProperty(window, 'devPilot', {
      value: mockApi,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Rapid Provider Switching & Zero State Bleeding
  // =========================================================================
  describe('1. Rapid Provider Switching & Fieldset Isolation', () => {
    it('rapidly switches between all providers in multiple cycles with zero DOM or input bleeding', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select') as HTMLSelectElement;

      // Cycle 1: Webhook -> Ollama -> OpenAI -> Gemini -> Webhook
      const switchSequence: AIProvider[] = [
        'ollama',
        'openai',
        'gemini',
        'webhook',
        'gemini',
        'ollama',
        'openai',
        'webhook',
        'openai',
        'ollama',
        'gemini',
        'webhook',
      ];

      for (const targetProvider of switchSequence) {
        fireEvent.change(providerSelect, { target: { value: targetProvider } });
        expect(providerSelect.value).toBe(targetProvider);

        if (targetProvider === 'webhook') {
          expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
          expect(screen.getByTestId('settings-webhook-token-input')).toBeInTheDocument();
          expect(screen.queryByTestId('settings-ollama-url-input')).toBeNull();
          expect(screen.queryByTestId('settings-openai-key-input')).toBeNull();
          expect(screen.queryByTestId('settings-gemini-key-input')).toBeNull();
        } else if (targetProvider === 'ollama') {
          expect(screen.getByTestId('settings-ollama-url-input')).toBeInTheDocument();
          expect(screen.getByTestId('settings-ollama-model-input')).toBeInTheDocument();
          expect(screen.queryByTestId('settings-webhook-url-input')).toBeNull();
          expect(screen.queryByTestId('settings-openai-key-input')).toBeNull();
          expect(screen.queryByTestId('settings-gemini-key-input')).toBeNull();
        } else if (targetProvider === 'openai') {
          expect(screen.getByTestId('settings-openai-key-input')).toBeInTheDocument();
          expect(screen.getByTestId('settings-openai-model-input')).toBeInTheDocument();
          expect(screen.queryByTestId('settings-webhook-url-input')).toBeNull();
          expect(screen.queryByTestId('settings-ollama-url-input')).toBeNull();
          expect(screen.queryByTestId('settings-gemini-key-input')).toBeNull();
        } else if (targetProvider === 'gemini') {
          expect(screen.getByTestId('settings-gemini-key-input')).toBeInTheDocument();
          expect(screen.getByTestId('settings-gemini-model-input')).toBeInTheDocument();
          expect(screen.queryByTestId('settings-webhook-url-input')).toBeNull();
          expect(screen.queryByTestId('settings-ollama-url-input')).toBeNull();
          expect(screen.queryByTestId('settings-openai-key-input')).toBeNull();
        }
      }
    });

    it('verifies that selecting presets in Ollama does NOT bleed into OpenAI or Gemini models', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');

      // 1. Switch to Ollama and select preset 'qwen2.5-coder'
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
      const qwenPresetBtn = screen.getByRole('button', { name: 'qwen2.5-coder' });
      fireEvent.click(qwenPresetBtn);
      const ollamaModelInput = screen.getByTestId('settings-ollama-model-input') as HTMLInputElement;
      expect(ollamaModelInput.value).toBe('qwen2.5-coder');

      // 2. Switch to OpenAI and check model input (must still be default or env, NOT qwen2.5-coder)
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      const openaiModelInput = screen.getByTestId('settings-openai-model-input') as HTMLInputElement;
      expect(openaiModelInput.value).toBe(DEFAULT_OPENAI_MODEL);

      // Select preset 'gpt-4o' in OpenAI
      const gpt4oPresetBtn = screen.getByRole('button', { name: 'gpt-4o' });
      fireEvent.click(gpt4oPresetBtn);
      expect(openaiModelInput.value).toBe('gpt-4o');

      // 3. Switch to Gemini and check model input (must be DEFAULT_GEMINI_MODEL, NOT gpt-4o or qwen)
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });
      const geminiModelInput = screen.getByTestId('settings-gemini-model-input') as HTMLInputElement;
      expect(geminiModelInput.value).toBe(DEFAULT_GEMINI_MODEL);

      // 4. Switch back to Ollama and verify it still has 'qwen2.5-coder'
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
      const ollamaModelInputAgain = screen.getByTestId('settings-ollama-model-input') as HTMLInputElement;
      expect(ollamaModelInputAgain.value).toBe('qwen2.5-coder');
    });
  });

  // =========================================================================
  // 2. Unsaved Edits, State Persistence & Scoped Saving
  // =========================================================================
  describe('2. Unsaved Edits & Scoped Provider Saving', () => {
    it('preserves in-memory dirty input across tab switching, but does NOT persist to localStorage until Saved', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      const webhookUrlInput = screen.getByTestId('settings-webhook-url-input');

      // 1. Edit Webhook URL without clicking save
      fireEvent.change(webhookUrlInput, { target: { value: 'https://unsaved-webhook.com/endpoint' } });

      // Verify localStorage is completely unchanged
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_URL)).toBeNull();

      // 2. Switch away to Ollama
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
      expect(screen.getByTestId('settings-ollama-url-input')).toBeInTheDocument();

      // 3. Switch back to Webhook
      fireEvent.change(providerSelect, { target: { value: 'webhook' } });
      const webhookUrlInputReturned = screen.getByTestId('settings-webhook-url-input') as HTMLInputElement;

      // In-memory state is preserved
      expect(webhookUrlInputReturned.value).toBe('https://unsaved-webhook.com/endpoint');
      // But localStorage still has nothing!
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
    });

    it('saving on provider A persists ONLY provider A, leaving unsaved changes on provider B uncommitted to localStorage', async () => {
      // Pre-populate Webhook in localStorage
      setWebhookConfig({
        webhookUrl: 'https://saved-initial-hook.com/v1',
        webhookToken: 'initial-token',
      });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');

      // 1. Enter unsaved edits in Webhook URL
      const webhookUrlInput = screen.getByTestId('settings-webhook-url-input');
      fireEvent.change(webhookUrlInput, { target: { value: 'https://dirty-hook.com/never-saved' } });

      // 2. Switch to OpenAI and enter valid credentials
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      const openaiKeyInput = screen.getByTestId('settings-openai-key-input');
      const openaiModelInput = screen.getByTestId('settings-openai-model-input');
      fireEvent.change(openaiKeyInput, { target: { value: 'sk-adversarial-test-key' } });
      fireEvent.change(openaiModelInput, { target: { value: 'o1-mini' } });

      // 3. Click Save while activeProvider is OpenAI
      const saveBtn = screen.getByTestId('settings-save-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      // 4. Assert: OpenAI is saved to localStorage
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY)).toBe('sk-adversarial-test-key');
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_MODEL)).toBe('o1-mini');
      expect(getActiveProvider()).toBe('openai');

      // 5. Assert: Webhook in localStorage is STILL the old saved value, NOT dirty-hook!
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://saved-initial-hook.com/v1');
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_URL)).toBe('https://saved-initial-hook.com/v1');
    });

    it('uncommitted edits are cleanly discarded upon reopening the modal', async () => {
      setWebhookConfig({
        webhookUrl: 'https://stable-hook.com/api',
        webhookToken: 'stable-token',
      });

      const { rerender } = render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      // Dirty edit
      const webhookUrlInput = screen.getByTestId('settings-webhook-url-input');
      fireEvent.change(webhookUrlInput, { target: { value: 'https://transient-unsaved.com' } });
      expect((webhookUrlInput as HTMLInputElement).value).toBe('https://transient-unsaved.com');

      // Close modal
      rerender(<SettingsModal isOpen={false} onClose={vi.fn()} />);
      expect(screen.queryByTestId('settings-modal')).toBeNull();

      // Reopen modal
      rerender(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      // Assert: input reverted to stable stored URL, not the discarded uncommitted edit
      const reopenedInput = screen.getByTestId('settings-webhook-url-input') as HTMLInputElement;
      expect(reopenedInput.value).toBe('https://stable-hook.com/api');
    });
  });

  // =========================================================================
  // 3. Adversarial Scoped Resets (Provider Isolation)
  // =========================================================================
  describe('3. Scoped Reset Isolation Between Providers', () => {
    beforeEach(() => {
      // Pre-configure all 4 providers in localStorage
      setWebhookConfig({
        webhookUrl: 'https://custom-webhook.internal/ci',
        webhookToken: 'ci-secret-token',
      });
      setOllamaConfig({
        baseUrl: 'http://ollama-server.lan:11434',
        model: 'codellama',
      });
      setOpenAIConfig({
        apiKey: 'sk-prod-openai-token-xyz',
        model: 'gpt-4o',
      });
      setGeminiConfig({
        apiKey: 'AIzaSy-prod-gemini-key',
        model: 'gemini-1.5-pro',
      });
      setActiveProvider('webhook');
    });

    it('resetting Webhook provider leaves Ollama, OpenAI, and Gemini localStorage keys and UI untouched', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      // 1. Reset Webhook
      const resetBtn = screen.getByTestId('settings-reset-btn');
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      // Webhook keys removed
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBeNull();

      // Webhook inputs cleared
      const webhookUrlInput = screen.getByTestId('settings-webhook-url-input') as HTMLInputElement;
      expect(webhookUrlInput.value).toBe('');

      // Ollama keys in localStorage strictly untouched
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)).toBe('http://ollama-server.lan:11434');
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL)).toBe('codellama');

      // OpenAI keys in localStorage strictly untouched
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY)).toBe('sk-prod-openai-token-xyz');
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_MODEL)).toBe('gpt-4o');

      // Gemini keys in localStorage strictly untouched
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY)).toBe('AIzaSy-prod-gemini-key');
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_MODEL)).toBe('gemini-1.5-pro');

      // 2. Switch to Ollama in UI and check values
      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
      const ollamaUrlInput = screen.getByTestId('settings-ollama-url-input') as HTMLInputElement;
      const ollamaModelInput = screen.getByTestId('settings-ollama-model-input') as HTMLInputElement;
      expect(ollamaUrlInput.value).toBe('http://ollama-server.lan:11434');
      expect(ollamaModelInput.value).toBe('codellama');

      // 3. Switch to OpenAI in UI and check values
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      const openaiKeyInput = screen.getByTestId('settings-openai-key-input') as HTMLInputElement;
      const openaiModelInput = screen.getByTestId('settings-openai-model-input') as HTMLInputElement;
      expect(openaiKeyInput.value).toBe('sk-prod-openai-token-xyz');
      expect(openaiModelInput.value).toBe('gpt-4o');

      // 4. Switch to Gemini in UI and check values
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });
      const geminiKeyInput = screen.getByTestId('settings-gemini-key-input') as HTMLInputElement;
      const geminiModelInput = screen.getByTestId('settings-gemini-model-input') as HTMLInputElement;
      expect(geminiKeyInput.value).toBe('AIzaSy-prod-gemini-key');
      expect(geminiModelInput.value).toBe('gemini-1.5-pro');
    });

    it('resetting Ollama provider leaves OpenAI, Gemini, and Webhook intact', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });

      // Reset Ollama
      const resetBtn = screen.getByTestId('settings-reset-btn');
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      // Ollama keys removed from localStorage
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL)).toBeNull();

      // Webhook keys preserved
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://custom-webhook.internal/ci');
      // OpenAI keys preserved
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY)).toBe('sk-prod-openai-token-xyz');
      // Gemini keys preserved
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY)).toBe('AIzaSy-prod-gemini-key');
    });

    it('resetting OpenAI provider leaves Gemini, Ollama, and Webhook intact', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });

      // Reset OpenAI
      const resetBtn = screen.getByTestId('settings-reset-btn');
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      // OpenAI keys removed
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_MODEL)).toBeNull();

      // Gemini preserved
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY)).toBe('AIzaSy-prod-gemini-key');
      // Ollama preserved
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)).toBe('http://ollama-server.lan:11434');
      // Webhook preserved
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://custom-webhook.internal/ci');
    });

    it('resetting Gemini provider leaves Webhook, Ollama, and OpenAI intact', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });

      // Reset Gemini
      const resetBtn = screen.getByTestId('settings-reset-btn');
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      // Gemini keys removed
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_GEMINI_MODEL)).toBeNull();

      // Others preserved
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://custom-webhook.internal/ci');
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)).toBe('http://ollama-server.lan:11434');
      expect(localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY)).toBe('sk-prod-openai-token-xyz');
    });
  });

  // =========================================================================
  // 4. Malformed Inputs, Whitespace-Only URLs/Tokens & Protocol Edge Cases
  // =========================================================================
  describe('4. Malformed Inputs, Whitespace & URL Protocol Fuzzing', () => {
    it('rejects whitespace-only Webhook URL and displays validation error', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(urlInput, { target: { value: '     \t  \n  ' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const errorAlert = screen.getByTestId('settings-error-alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert.textContent).toContain('Webhook URL cannot be empty');
      });

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
    });

    it('rejects prohibited protocols (ftp:, javascript:, file:, data:, ws:) for Webhook URL', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      const prohibitedUrls = [
        'ftp://ftp.example.com/payload',
        'javascript:alert(document.cookie)',
        'file:///etc/passwd',
        'data:text/html,<script>alert(1)</script>',
        'ws://realtime.example.com/socket',
        'gopher://old.internet.org',
      ];

      for (const badUrl of prohibitedUrls) {
        fireEvent.change(urlInput, { target: { value: badUrl } });
        fireEvent.click(saveBtn);

        await waitFor(() => {
          const alert = screen.getByTestId('settings-error-alert');
          expect(alert.textContent).toContain('must use HTTP or HTTPS protocol');
        });

        expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      }
    });

    it('rejects malformed syntax URLs for Webhook URL', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      const syntaxErrors = ['http://', 'not-a-valid-url', '://missing-scheme', 'http://:80'];

      for (const badUrl of syntaxErrors) {
        fireEvent.change(urlInput, { target: { value: badUrl } });
        fireEvent.click(saveBtn);

        await waitFor(() => {
          const alert = screen.getByTestId('settings-error-alert');
          expect(alert.textContent).toMatch(/Invalid URL format|must use HTTP or HTTPS/);
        });

        expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      }
    });

    it('trims leading/trailing whitespace around valid Webhook URL and saves cleaned value', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const tokenInput = screen.getByTestId('settings-webhook-token-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(urlInput, { target: { value: '   https://n8n.cloud/webhook/live   ' } });
      fireEvent.change(tokenInput, { target: { value: '   secret-bearer-token   ' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://n8n.cloud/webhook/live');
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_URL)).toBe('https://n8n.cloud/webhook/live');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBe('secret-bearer-token');
      expect(localStorage.getItem(STORAGE_KEY_LEGACY_WEBHOOK_TOKEN)).toBe('secret-bearer-token');
    });

    it('rejects prohibited protocols for Ollama Base URL', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });

      const ollamaUrlInput = screen.getByTestId('settings-ollama-url-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(ollamaUrlInput, { target: { value: 'ftp://localhost:11434' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const alert = screen.getByTestId('settings-error-alert');
        expect(alert.textContent).toContain('Ollama Base URL must use HTTP or HTTPS protocol');
      });

      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)).toBeNull();
    });

    it('normalizes trailing slashes and trims whitespace for Ollama Base URL', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });

      const ollamaUrlInput = screen.getByTestId('settings-ollama-url-input');
      const ollamaModelInput = screen.getByTestId('settings-ollama-model-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(ollamaUrlInput, { target: { value: '  http://192.168.1.50:11434////  ' } });
      fireEvent.change(ollamaModelInput, { target: { value: '  mistral  ' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_BASE_URL)).toBe('http://192.168.1.50:11434');
      expect(localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL)).toBe('mistral');
    });

    it('rejects whitespace-only OpenAI API key when no env key exists', async () => {
      mockApi.getAIConfig = vi.fn().mockResolvedValue({
        success: true,
        data: {
          ...defaultMockAIConfig,
          envDefaults: {
            ...defaultMockAIConfig.envDefaults,
            hasOpenAiKey: false,
          },
        },
      });

      render(
        <SettingsModal
          isOpen={true}
          onClose={vi.fn()}
          initialEnvDefaults={{ hasOpenAiKey: false }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });

      const openaiKeyInput = screen.getByTestId('settings-openai-key-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(openaiKeyInput, { target: { value: '     ' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const alert = screen.getByTestId('settings-error-alert');
        expect(alert.textContent).toContain('OpenAI API key is required');
      });

      expect(localStorage.getItem(STORAGE_KEY_OPENAI_API_KEY)).toBeNull();
    });

    it('rejects whitespace-only Gemini API key when no env key exists', async () => {
      mockApi.getAIConfig = vi.fn().mockResolvedValue({
        success: true,
        data: {
          ...defaultMockAIConfig,
          envDefaults: {
            ...defaultMockAIConfig.envDefaults,
            hasGeminiKey: false,
          },
        },
      });

      render(
        <SettingsModal
          isOpen={true}
          onClose={vi.fn()}
          initialEnvDefaults={{ hasGeminiKey: false }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });

      const geminiKeyInput = screen.getByTestId('settings-gemini-key-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(geminiKeyInput, { target: { value: '   ' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const alert = screen.getByTestId('settings-error-alert');
        expect(alert.textContent).toContain('Gemini API key is required');
      });

      expect(localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY)).toBeNull();
    });

    it('automatically dismisses error alert as soon as the user starts typing in the field', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      // Trigger error
      fireEvent.change(urlInput, { target: { value: 'not-valid' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-error-alert')).toBeInTheDocument();
      });

      // Type new char
      fireEvent.change(urlInput, { target: { value: 'https://' } });

      // Error alert must immediately disappear
      expect(screen.queryByTestId('settings-error-alert')).toBeNull();
    });
  });

  // =========================================================================
  // 5. Robustness Under IPC Failure & Undefined Bridge
  // =========================================================================
  describe('5. Robustness Under IPC Rejection & Missing window.devPilot', () => {
    it('renders cleanly and safely when window.devPilot is completely undefined', async () => {
      // Delete window.devPilot
      delete (window as any).devPilot;

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();

      // Can still change provider and input values
      const providerSelect = screen.getByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
      expect(screen.getByTestId('settings-ollama-url-input')).toBeInTheDocument();
    });

    it('falls back gracefully to getWebhookConfig when getAIConfig is undefined', async () => {
      const getWebhookConfigMock = vi.fn().mockResolvedValue({
        success: true,
        data: {
          webhookUrl: 'https://legacy-env.hook/api',
          source: 'env',
          envDefaults: { webhookUrl: 'https://legacy-env.hook/api', hasToken: false },
        },
      });

      Object.defineProperty(window, 'devPilot', {
        value: {
          getWebhookConfig: getWebhookConfigMock,
          // getAIConfig is undefined
        },
        writable: true,
        configurable: true,
      });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(getWebhookConfigMock).toHaveBeenCalled();
      });

      // Env preview should show legacy webhook fallback
      await waitFor(() => {
        const preview = screen.getByTestId('settings-env-fallback-preview');
        expect(preview.textContent).toContain('https://legacy-env.hook/api');
      });
    });

    it('handles window.devPilot.getAIConfig Promise rejection gracefully without crashing', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      Object.defineProperty(window, 'devPilot', {
        value: {
          getAIConfig: vi.fn().mockRejectedValue(new Error('Fatal IPC Bus Failure: ENOTCONN')),
          getWebhookConfig: vi.fn().mockRejectedValue(new Error('Legacy IPC also failed')),
        },
        writable: true,
        configurable: true,
      });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      // UI is fully operational despite IPC rejections
      const providerSelect = screen.getByTestId('settings-provider-select');
      expect(providerSelect).toBeInTheDocument();
      expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();

      consoleWarnSpy.mockRestore();
    });

    it('handles window.devPilot.getAIConfig returning { success: false, error: ... } safely', async () => {
      Object.defineProperty(window, 'devPilot', {
        value: {
          getAIConfig: vi.fn().mockResolvedValue({
            success: false,
            error: 'Database lock timeout in main process',
          }),
          getWebhookConfig: vi.fn().mockResolvedValue({
            success: false,
            error: 'Webhook lock error',
          }),
        },
        writable: true,
        configurable: true,
      });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      // Component rendered without throwing
      expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. State Machine: Password Toggles, Modal Interactions & Focus
  // =========================================================================
  describe('6. State Machine: Password Toggles & Accessibility', () => {
    it('maintains independent password visibility states for each provider', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select');

      // 1. Webhook token starts as password
      const webhookTokenInput = screen.getByTestId('settings-webhook-token-input') as HTMLInputElement;
      expect(webhookTokenInput.type).toBe('password');
      const webhookToggle = screen.getByTestId('settings-webhook-token-toggle');
      fireEvent.click(webhookToggle);
      expect(webhookTokenInput.type).toBe('text');

      // 2. Switch to OpenAI - API key starts as password (independent)
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      const openaiKeyInput = screen.getByTestId('settings-openai-key-input') as HTMLInputElement;
      expect(openaiKeyInput.type).toBe('password');
      const openaiToggle = screen.getByTestId('settings-openai-key-toggle');
      fireEvent.click(openaiToggle);
      expect(openaiKeyInput.type).toBe('text');

      // 3. Switch to Gemini - API key starts as password (independent)
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });
      const geminiKeyInput = screen.getByTestId('settings-gemini-key-input') as HTMLInputElement;
      expect(geminiKeyInput.type).toBe('password');
      const geminiToggle = screen.getByTestId('settings-gemini-key-toggle');
      fireEvent.click(geminiToggle);
      expect(geminiKeyInput.type).toBe('text');

      // 4. Switch back to Webhook - verify it retained its toggled 'text' state
      fireEvent.change(providerSelect, { target: { value: 'webhook' } });
      const webhookTokenInputAgain = screen.getByTestId('settings-webhook-token-input') as HTMLInputElement;
      expect(webhookTokenInputAgain.type).toBe('text');
    });

    it('submits form on Enter keypress in input field and saves active provider', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      fireEvent.change(urlInput, { target: { value: 'https://enter-key-save.com/api' } });

      // Submit via form submit event
      fireEvent.submit(urlInput.closest('form')!);

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://enter-key-save.com/api');
    });

    it('handles focus trap with Tab and Shift+Tab wrapping inside the modal', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      const backdrop = screen.getByTestId('settings-modal-backdrop');
      const modal = screen.getByTestId('settings-modal');

      const focusable = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      expect(focusable.length).toBeGreaterThan(0);

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      // Focus last element and press Tab -> should focus first element
      lastElement.focus();
      expect(document.activeElement).toBe(lastElement);

      fireEvent.keyDown(backdrop, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(firstElement);

      // Focus first element and press Shift+Tab -> should focus last element
      firstElement.focus();
      expect(document.activeElement).toBe(firstElement);

      fireEvent.keyDown(backdrop, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(lastElement);
    });

    it('dynamic source badge accurately updates when provider switches between User, Env, and Unconfigured', async () => {
      // OpenAI has env key, Webhook has user URL, Gemini has nothing
      setWebhookConfig({ webhookUrl: 'https://user-webhook.com' });
      setActiveProvider('webhook');

      render(
        <SettingsModal
          isOpen={true}
          onClose={vi.fn()}
          initialEnvDefaults={{
            hasOpenAiKey: true,
            hasGeminiKey: false,
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const badge = screen.getByTestId('settings-source-badge');
      const providerSelect = screen.getByTestId('settings-provider-select');

      // 1. Webhook active -> User Settings
      expect(badge.textContent).toBe('User Settings');
      expect(badge.className).toContain('source-user');

      // 2. Switch to OpenAI -> .env Fallback
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      expect(badge.textContent).toBe('.env Fallback');
      expect(badge.className).toContain('source-env');

      // 3. Switch to Gemini -> Unconfigured
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });
      expect(badge.textContent).toBe('Unconfigured');
      expect(badge.className).toContain('source-none');

      // 4. Configure Gemini key and save -> changes to User Settings
      const geminiKeyInput = screen.getByTestId('settings-gemini-key-input');
      fireEvent.change(geminiKeyInput, { target: { value: 'AIzaSy-user-gemini' } });
      fireEvent.click(screen.getByTestId('settings-save-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('settings-success-alert')).toBeInTheDocument();
      });

      expect(badge.textContent).toBe('User Settings');
      expect(badge.className).toContain('source-user');
    });
  });
});
