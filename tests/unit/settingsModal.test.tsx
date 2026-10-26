import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from '../../src/renderer/components/SettingsModal/SettingsModal';
import {
  STORAGE_KEY_WEBHOOK_URL,
  STORAGE_KEY_WEBHOOK_TOKEN,
  getWebhookUrl,
  getWebhookToken,
  setWebhookUrl,
  setWebhookToken,
  clearWebhookConfig,
} from '../../src/renderer/services/webhookConfig';
import type { DevPilotAPI } from '../../src/shared/types';

describe('SettingsModal Component (tests/unit/settingsModal.test.tsx)', () => {
  let mockApi: Partial<DevPilotAPI>;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    mockApi = {
      getWebhookConfig: vi.fn().mockResolvedValue({
        success: true,
        data: {
          webhookUrl: 'https://env.n8n.example.com/webhook/test',
          source: 'env',
          envDefaults: {
            webhookUrl: 'https://env.n8n.example.com/webhook/test',
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
  // 1. Rendering & Visibility
  // =========================================================================
  describe('Rendering & Visibility', () => {
    it('does not render modal dialog or backdrop when isOpen={false}', () => {
      render(<SettingsModal isOpen={false} onClose={vi.fn()} />);

      expect(screen.queryByTestId('settings-modal')).toBeNull();
      expect(screen.queryByTestId('settings-modal-backdrop')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders modal dialog, inputs, and controls when isOpen={true}', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      expect(screen.getByTestId('settings-modal-backdrop')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Controls presence
      expect(screen.getByTestId('settings-webhook-url-input')).toBeInTheDocument();
      expect(screen.getByTestId('settings-webhook-token-input')).toBeInTheDocument();
      expect(screen.getByTestId('settings-save-btn')).toBeInTheDocument();
      expect(screen.getByTestId('settings-reset-btn')).toBeInTheDocument();
      expect(screen.getByTestId('settings-close-btn')).toBeInTheDocument();
      expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Loading Settings & Source Badges
  // =========================================================================
  describe('Loading Configuration & Source Indicators', () => {
    it('loads and displays current user settings from localStorage', async () => {
      setWebhookUrl('https://user-custom.n8n.cloud/webhook');
      setWebhookToken('user-secret-token-999');

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const badge = screen.getByTestId('settings-source-badge');
        expect(badge.textContent).toMatch(/User Settings|user/i);
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input') as HTMLInputElement;
      const tokenInput = screen.getByTestId('settings-webhook-token-input') as HTMLInputElement;

      expect(urlInput.value).toBe('https://user-custom.n8n.cloud/webhook');
      expect(tokenInput.value).toBe('user-secret-token-999');
    });

    it('displays .env fallback indicators when user settings are empty', async () => {
      clearWebhookConfig();

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const badge = screen.getByTestId('settings-source-badge');
        expect(badge.textContent).toMatch(/\.env Fallback|env/i);
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input') as HTMLInputElement;
      expect(urlInput.value).toBe('');
      // Placeholder or env preview displays env fallback URL
      expect(screen.getByText(/https:\/\/env\.n8n\.example\.com\/webhook\/test/i)).toBeInTheDocument();
    });

    it('displays Unconfigured indicator when neither user settings nor .env defaults exist', async () => {
      clearWebhookConfig();
      mockApi.getWebhookConfig = vi.fn().mockResolvedValue({
        success: true,
        data: {
          webhookUrl: '',
          source: 'none',
          envDefaults: { webhookUrl: '', hasToken: false },
        },
      });

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const badge = screen.getByTestId('settings-source-badge');
        expect(badge.textContent).toMatch(/Unconfigured|none/i);
      });
    });
  });

  // =========================================================================
  // 3. User Input & Typing
  // =========================================================================
  describe('User Input Handling', () => {
    it('allows entering URL and token', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input') as HTMLInputElement;
      const tokenInput = screen.getByTestId('settings-webhook-token-input') as HTMLInputElement;

      fireEvent.change(urlInput, { target: { value: 'https://new-domain.com/webhook/action' } });
      expect(urlInput.value).toBe('https://new-domain.com/webhook/action');

      fireEvent.change(tokenInput, { target: { value: 'super-secret-bearer-token' } });
      expect(tokenInput.value).toBe('super-secret-bearer-token');
    });
  });

  // =========================================================================
  // 4. URL Validation & Error Alerts
  // =========================================================================
  describe('URL Validation & Error Handling', () => {
    it('displays error banner and prevents saving on invalid URL format', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(urlInput, { target: { value: 'not-a-valid-url' } });
      fireEvent.click(saveBtn);

      const errorAlert = screen.getByTestId('settings-error-alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert.textContent).toMatch(/Invalid URL format/i);
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(screen.queryByTestId('settings-success-alert')).toBeNull();
    });

    it('displays error banner and prevents saving on unsupported protocol (e.g. ftp://)', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(urlInput, { target: { value: 'ftp://files.example.com/webhook' } });
      fireEvent.click(saveBtn);

      const errorAlert = screen.getByTestId('settings-error-alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert.textContent).toMatch(/HTTP or HTTPS/i);
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
    });

    it('displays error banner when attempting to save empty webhook URL', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      fireEvent.change(urlInput, { target: { value: '' } });

      const saveBtn = screen.getByTestId('settings-save-btn');
      fireEvent.click(saveBtn);

      const errorAlert = screen.getByTestId('settings-error-alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert.textContent).toMatch(/cannot be empty/i);
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
    });
  });

  // =========================================================================
  // 5. Saving Configuration
  // =========================================================================
  describe('Saving Configuration', () => {
    it('clicking Save updates localStorage and displays success banner', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const tokenInput = screen.getByTestId('settings-webhook-token-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(urlInput, { target: { value: 'https://production.n8n.cloud/webhook/commit' } });
      fireEvent.change(tokenInput, { target: { value: 'prod-token-12345' } });
      fireEvent.click(saveBtn);

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBe('https://production.n8n.cloud/webhook/commit');
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBe('prod-token-12345');
      expect(getWebhookUrl()).toBe('https://production.n8n.cloud/webhook/commit');
      expect(getWebhookToken()).toBe('prod-token-12345');

      const successAlert = screen.getByTestId('settings-success-alert');
      expect(successAlert).toBeInTheDocument();
      expect(successAlert.textContent).toMatch(/Settings saved|successfully/i);

      // Verify badge updates to User Settings
      const badge = screen.getByTestId('settings-source-badge');
      expect(badge.textContent).toMatch(/User Settings|user/i);
    });

    it('trims leading/trailing whitespace before persisting', async () => {
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const urlInput = screen.getByTestId('settings-webhook-url-input');
      const tokenInput = screen.getByTestId('settings-webhook-token-input');
      const saveBtn = screen.getByTestId('settings-save-btn');

      fireEvent.change(urlInput, { target: { value: '  https://trimmed.n8n.cloud/webhook   ' } });
      fireEvent.change(tokenInput, { target: { value: '   token-trimmed   ' } });
      fireEvent.click(saveBtn);

      expect(getWebhookUrl()).toBe('https://trimmed.n8n.cloud/webhook');
      expect(getWebhookToken()).toBe('token-trimmed');
    });
  });

  // =========================================================================
  // 6. Resetting Configuration
  // =========================================================================
  describe('Resetting Configuration', () => {
    it('clicking Reset clears localStorage and reverts to .env fallback', async () => {
      setWebhookUrl('https://my-old-webhook.io');
      setWebhookToken('my-old-token');

      render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-source-badge')).toBeInTheDocument();
      });

      const resetBtn = screen.getByTestId('settings-reset-btn');
      fireEvent.click(resetBtn);

      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_URL)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_WEBHOOK_TOKEN)).toBeNull();
      expect(getWebhookUrl()).toBe('');
      expect(getWebhookToken()).toBe('');

      const urlInput = screen.getByTestId('settings-webhook-url-input') as HTMLInputElement;
      const tokenInput = screen.getByTestId('settings-webhook-token-input') as HTMLInputElement;
      expect(urlInput.value).toBe('');
      expect(tokenInput.value).toBe('');

      // Verify source badge reverts to env fallback
      await waitFor(() => {
        const badge = screen.getByTestId('settings-source-badge');
        expect(badge.textContent).toMatch(/\.env Fallback|env/i);
      });
    });
  });

  // =========================================================================
  // 7. Modal Dismissal (Close Button, Backdrop, Escape)
  // =========================================================================
  describe('Closing & Modal Dismissal', () => {
    it('calls onClose when clicking close button', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('settings-close-btn'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking backdrop overlay', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      const backdrop = screen.getByTestId('settings-modal-backdrop');
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onClose when clicking inside the dialog card', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      const modalDialog = screen.getByTestId('settings-modal');
      fireEvent.click(modalDialog);
      expect(handleClose).not.toHaveBeenCalled();
    });

    it('calls onClose when pressing Escape key', async () => {
      const handleClose = vi.fn();
      render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('removes Escape keydown listener when unmounted', async () => {
      const handleClose = vi.fn();
      const { unmount } = render(<SettingsModal isOpen={true} onClose={handleClose} />);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });

      unmount();
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(handleClose).not.toHaveBeenCalled();
    });
  });
});
