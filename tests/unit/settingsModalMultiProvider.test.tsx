/**
 * Automated Unit Test Suite for Multi-Provider SettingsModal Component
 * Target: src/renderer/components/SettingsModal/SettingsModal.tsx
 * Covers: Features F43, F44, F45, F47, F48
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from '../../src/renderer/components/SettingsModal/SettingsModal';
import {
  setActiveProvider,
  setWebhookConfig,
  setOllamaConfig,
  setOpenAIConfig,
  setGeminiConfig,
  getOpenAIConfig,
  getOllamaConfig,
  getWebhookConfig,
  getActiveProvider,
} from '../../src/renderer/services/aiConfig';
import type { DevPilotAPI } from '../../src/shared/types';

describe('SettingsModal Multi-Provider Component (tests/unit/settingsModalMultiProvider.test.tsx)', () => {
  let mockApi: Partial<DevPilotAPI>;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    mockApi = {
      getAIConfig: vi.fn().mockResolvedValue({
        success: true,
        data: {
          activeProvider: 'webhook',
          providerConfigs: {
            webhook: { webhookUrl: 'https://env.n8n.cloud/webhook', webhookToken: '••••••••' },
            ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
            openai: { apiKey: '••••••••', model: 'gpt-4o' },
            gemini: { apiKey: '', model: 'gemini-1.5-flash' },
          },
          sources: {
            webhook: 'env',
            ollama: 'none',
            openai: 'env',
            gemini: 'none',
          },
          envDefaults: {
            activeProvider: 'webhook',
            webhookUrl: 'https://env.n8n.cloud/webhook',
            hasWebhookToken: true,
            ollamaBaseUrl: 'http://localhost:11434',
            ollamaModel: 'llama3.2',
            hasOpenAiKey: true,
            openAiModel: 'gpt-4o',
            hasGeminiKey: false,
            geminiModel: 'gemini-1.5-flash',
          },
        },
      }),
      // Also provide legacy getWebhookConfig for total backward compatibility
      getWebhookConfig: vi.fn().mockResolvedValue({
        success: true,
        data: {
          webhookUrl: 'https://env.n8n.cloud/webhook',
          source: 'env',
          envDefaults: { webhookUrl: 'https://env.n8n.cloud/webhook', hasToken: true },
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
  // 1. Provider Selector Dropdown Rendering (F43)
  // =========================================================================
  describe('Provider Selector Dropdown (data-testid="settings-provider-select")', () => {
    it('renders provider select dropdown with all 4 providers available', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      const providerSelect = screen.getByTestId('settings-provider-select') as HTMLSelectElement;
      expect(providerSelect).toBeInTheDocument();

      // Check all 4 options exist
      const options = Array.from(providerSelect.options).map((opt) => opt.value);
      expect(options).toContain('webhook');
      expect(options).toContain('ollama');
      expect(options).toContain('openai');
      expect(options).toContain('gemini');

      // Default active provider is webhook
      expect(providerSelect.value).toBe('webhook');
    });

    it('initializes provider dropdown to stored activeProvider when pre-configured', async () => {
      setActiveProvider('ollama');
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const select = screen.getByTestId('settings-provider-select') as HTMLSelectElement;
        expect(select.value).toBe('ollama');
      });
    });
  });

  // =========================================================================
  // 2. Dynamic Fieldsets per Provider (F44)
  // =========================================================================
  describe('Dynamic Fieldset Rendering (F44)', () => {
    it('renders Webhook fieldset when provider is "webhook"', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      });

      expect(screen.getByTestId('settings-webhook-token-input')).toBeInTheDocument();
      // Other provider fields must NOT be rendered
      expect(screen.queryByTestId('settings-ollama-url-input')).toBeNull();
      expect(screen.queryByTestId('settings-openai-key-input')).toBeNull();
      expect(screen.queryByTestId('settings-gemini-key-input')).toBeNull();
    });

    it('renders Ollama fieldset when provider is switched to "ollama"', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('settings-provider-select'), {
        target: { value: 'ollama' },
      });

      expect(screen.getByTestId('settings-ollama-url-input')).toBeInTheDocument();
      expect(screen.getByTestId('settings-ollama-model-input')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-webhook-url-input')).toBeNull();
      expect(screen.queryByTestId('settings-openai-key-input')).toBeNull();
    });

    it('renders OpenAI fieldset when provider is switched to "openai"', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('settings-provider-select'), {
        target: { value: 'openai' },
      });

      expect(screen.getByTestId('settings-openai-key-input')).toBeInTheDocument();
      expect(screen.getByTestId('settings-openai-model-input')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-webhook-url-input')).toBeNull();
      expect(screen.queryByTestId('settings-ollama-url-input')).toBeNull();
    });

    it('renders Gemini fieldset when provider is switched to "gemini"', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-provider-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('settings-provider-select'), {
        target: { value: 'gemini' },
      });

      expect(screen.getByTestId('settings-gemini-key-input')).toBeInTheDocument();
      expect(screen.getByTestId('settings-gemini-model-input')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-webhook-url-input')).toBeNull();
      expect(screen.queryByTestId('settings-openai-key-input')).toBeNull();
    });
  });

  // =========================================================================
  // 3. Multi-Provider Credential Persistence Across Switches (F45)
  // =========================================================================
  describe('Provider Switching & Persisted Value Retention (F45)', () => {
    it('displays persisted values for each provider when toggling between dropdown options', async () => {
      setWebhookConfig({ webhookUrl: 'https://custom-webhook.io' });
      setOllamaConfig({ baseUrl: 'http://custom-ollama:11434', model: 'codellama' });
      setOpenAIConfig({ apiKey: 'sk-user-test-key-1', model: 'gpt-4o' });
      setGeminiConfig({ apiKey: 'AIzaSyUserGemini-2', model: 'gemini-1.5-pro' });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      const providerSelect = (await screen.findByTestId('settings-provider-select')) as HTMLSelectElement;

      // 1. Webhook is displayed initially
      expect((screen.getByTestId('settings-webhook-url-input') as HTMLInputElement).value).toBe(
        'https://custom-webhook.io'
      );

      // 2. Switch to Ollama
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
      expect((screen.getByTestId('settings-ollama-url-input') as HTMLInputElement).value).toBe(
        'http://custom-ollama:11434'
      );
      expect((screen.getByTestId('settings-ollama-model-input') as HTMLInputElement).value).toBe(
        'codellama'
      );

      // 3. Switch to OpenAI
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      expect((screen.getByTestId('settings-openai-key-input') as HTMLInputElement).value).toBe(
        'sk-user-test-key-1'
      );
      expect((screen.getByTestId('settings-openai-model-input') as HTMLInputElement).value).toBe('gpt-4o');

      // 4. Switch to Gemini
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });
      expect((screen.getByTestId('settings-gemini-key-input') as HTMLInputElement).value).toBe(
        'AIzaSyUserGemini-2'
      );
      expect((screen.getByTestId('settings-gemini-model-input') as HTMLInputElement).value).toBe(
        'gemini-1.5-pro'
      );

      // 5. Switch back to Webhook: values still present
      fireEvent.change(providerSelect, { target: { value: 'webhook' } });
      expect((screen.getByTestId('settings-webhook-url-input') as HTMLInputElement).value).toBe(
        'https://custom-webhook.io'
      );
    });
  });

  // =========================================================================
  // 4. Password Visibility Toggling
  // =========================================================================
  describe('Password Visibility Toggling', () => {
    it('toggles password visibility for Webhook token', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      const tokenInput = (await screen.findByTestId('settings-webhook-token-input')) as HTMLInputElement;
      expect(tokenInput.type).toBe('password');

      const toggleBtn = screen.getByTestId('settings-webhook-token-toggle');
      fireEvent.click(toggleBtn);
      expect(tokenInput.type).toBe('text');

      fireEvent.click(toggleBtn);
      expect(tokenInput.type).toBe('password');
    });

    it('toggles password visibility for OpenAI API key', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      const providerSelect = await screen.findByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });

      const keyInput = (await screen.findByTestId('settings-openai-key-input')) as HTMLInputElement;
      expect(keyInput.type).toBe('password');

      const toggleBtn = screen.getByTestId('settings-openai-key-toggle');
      fireEvent.click(toggleBtn);
      expect(keyInput.type).toBe('text');

      fireEvent.click(toggleBtn);
      expect(keyInput.type).toBe('password');
    });

    it('toggles password visibility for Gemini API key', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      const providerSelect = await screen.findByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });

      const keyInput = (await screen.findByTestId('settings-gemini-key-input')) as HTMLInputElement;
      expect(keyInput.type).toBe('password');

      const toggleBtn = screen.getByTestId('settings-gemini-key-toggle');
      fireEvent.click(toggleBtn);
      expect(keyInput.type).toBe('text');
    });
  });

  // =========================================================================
  // 5. Source Indicator Badge per Provider (F47)
  // =========================================================================
  describe('Source Indicator Badge per Provider (F47)', () => {
    it('updates badge to reflect the active source of the currently selected provider', async () => {
      // Setup: Webhook has user settings; OpenAI has env fallback; Gemini is unconfigured
      setWebhookConfig({ webhookUrl: 'https://user-webhook.com' });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      const providerSelect = await screen.findByTestId('settings-provider-select');
      const badge = screen.getByTestId('settings-source-badge');

      // Webhook -> User Settings
      await waitFor(() => {
        expect(badge.textContent).toMatch(/User Settings|user/i);
      });

      // Switch to OpenAI -> .env Fallback (from mockApi.getAIConfig)
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      await waitFor(() => {
        expect(badge.textContent).toMatch(/\.env Fallback|env/i);
      });

      // Switch to Gemini -> Unconfigured
      fireEvent.change(providerSelect, { target: { value: 'gemini' } });
      await waitFor(() => {
        expect(badge.textContent).toMatch(/Unconfigured|none/i);
      });
    });
  });

  // =========================================================================
  // 6. Saving Changes (F45 & F48)
  // =========================================================================
  describe('Saving Multi-Provider Configuration', () => {
    it('saves OpenAI settings and sets activeProvider to "openai"', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      const providerSelect = await screen.findByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });

      const keyInput = screen.getByTestId('settings-openai-key-input');
      const modelInput = screen.getByTestId('settings-openai-model-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(keyInput, { target: { value: 'sk-new-super-key' } });
      fireEvent.change(modelInput, { target: { value: 'gpt-4o' } });
      fireEvent.click(saveBtn);

      expect(getActiveProvider()).toBe('openai');
      expect(getOpenAIConfig().apiKey).toBe('sk-new-super-key');
      expect(getOpenAIConfig().model).toBe('gpt-4o');

      const successAlert = await screen.findByTestId('settings-success-alert');
      expect(successAlert.textContent).toMatch(/Settings saved|successfully/i);
      expect(screen.getByTestId('settings-source-badge').textContent).toMatch(/User Settings|user/i);
    });

    it('saves Ollama settings cleanly without affecting other provider storage', async () => {
      setWebhookConfig({ webhookUrl: 'https://stay-alive.com' });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      const providerSelect = await screen.findByTestId('settings-provider-select');
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });

      const urlInput = screen.getByTestId('settings-ollama-url-input');
      const modelInput = screen.getByTestId('settings-ollama-model-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(urlInput, { target: { value: 'http://ollama-vm:11434' } });
      fireEvent.change(modelInput, { target: { value: 'qwen2.5-coder' } });
      fireEvent.click(saveBtn);

      expect(getOllamaConfig().baseUrl).toBe('http://ollama-vm:11434');
      expect(getOllamaConfig().model).toBe('qwen2.5-coder');
      expect(getWebhookConfig().webhookUrl).toBe('https://stay-alive.com');
    });
  });

  // =========================================================================
  // 7. Resetting Changes (F48)
  // =========================================================================
  describe('Resetting Multi-Provider Configuration (F48)', () => {
    it('clicking Reset reverts the active provider to defaults/env without resetting other providers', async () => {
      setWebhookConfig({ webhookUrl: 'https://permanent-webhook.com' });
      setOpenAIConfig({ apiKey: 'sk-user-key-to-reset', model: 'gpt-4o' });
      setActiveProvider('openai');

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId('settings-openai-key-input')).toBeInTheDocument();
      });

      const resetBtn = screen.getByTestId('settings-reset-btn');
      fireEvent.click(resetBtn);

      // OpenAI user setting cleared
      expect(getOpenAIConfig().apiKey).toBe('');
      const keyInput = screen.getByTestId('settings-openai-key-input') as HTMLInputElement;
      expect(keyInput.value).toBe('');

      // Other provider untouched
      expect(getWebhookConfig().webhookUrl).toBe('https://permanent-webhook.com');

      // Success alert
      const alert = await screen.findByTestId('settings-success-alert');
      expect(alert.textContent).toMatch(/reset|cleared/i);
    });
  });

  // =========================================================================
  // 8. Modal Open / Close Lifecycle & Keyboard Navigation
  // =========================================================================
  describe('Modal Dismissal & Keyboard Navigation', () => {
    it('closes modal on close button click', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-close-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('settings-close-btn'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('closes modal on backdrop click', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal-backdrop')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('settings-modal-backdrop'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT close modal when clicking inside dialog body', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('settings-modal'));
      expect(handleClose).not.toHaveBeenCalled();
    });

    it('closes modal on Escape key press', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
