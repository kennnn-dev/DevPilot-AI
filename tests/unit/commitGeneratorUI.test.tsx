import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommitGeneratorPanel from '../../src/renderer/components/CommitGenerator/CommitGeneratorPanel';
import type { DevPilotAPI } from '../../src/shared/types';
import * as webhookConfig from '../../src/renderer/services/webhookConfig';

describe('CommitGeneratorPanel UI (tests/unit/commitGeneratorUI.test.tsx)', () => {
  let mockApi: Partial<DevPilotAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockApi = {
      generateCommitMessage: vi.fn(),
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

    // Default valid configuration
    webhookConfig.setWebhookUrl('https://n8n.cloud/webhook/commit-gen');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Initial Controls & Layout
  // =========================================================================
  describe('Initial Controls & Layout', () => {
    it('renders panel header and primary controls', () => {
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
        />
      );

      expect(screen.getByText('AI Commit Assistant')).toBeInTheDocument();
      expect(screen.getByTestId('generate-commit-btn')).toBeInTheDocument();
      expect(screen.getByTestId('toggle-settings-btn')).toBeInTheDocument();
      expect(screen.getByTestId('custom-instructions-input')).toBeInTheDocument();
      expect(screen.getByTestId('custom-prompt-input')).toBeInTheDocument();
      expect(screen.getByTestId('staged-indicator')).toBeInTheDocument();
    });

    it('does not render anything when isOpen is false', () => {
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={false}
        />
      );

      expect(screen.queryByTestId('commit-generator-panel')).toBeNull();
    });

    it('calls onClose callback when close button is clicked', () => {
      const handleClose = vi.fn();
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
          onClose={handleClose}
        />
      );

      const closeBtn = screen.getByTitle('Close Panel');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. Staged Files Guardrails
  // =========================================================================
  describe('Staged Changes Guardrails', () => {
    it('disables generate button and displays notice when stagedCount is 0', () => {
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={0}
          isOpen={true}
        />
      );

      const generateBtn = screen.getByTestId('generate-commit-btn') as HTMLButtonElement;
      expect(generateBtn.disabled).toBe(true);
      expect(screen.getByText(/No staged changes/i)).toBeInTheDocument();
    });

    it('enables generate button when stagedCount > 0 and repoPath is provided', () => {
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={3}
          isOpen={true}
        />
      );

      const generateBtn = screen.getByTestId('generate-commit-btn') as HTMLButtonElement;
      expect(generateBtn.disabled).toBe(false);
      expect(screen.getByText(/3 staged files ready for commit/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. Centralized Settings Delegation (Legacy Drawer Removed)
  // =========================================================================
  describe('Centralized Settings Delegation', () => {
    it('invokes onOpenSettings callback when clicking toggle-settings-btn and verifies drawer is removed', () => {
      const handleOpenSettings = vi.fn();
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={3}
          isOpen={true}
          onOpenSettings={handleOpenSettings}
        />
      );

      fireEvent.click(screen.getByTestId('toggle-settings-btn'));
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);

      // Verify legacy inline drawer elements are completely absent
      expect(screen.queryByTestId('webhook-url-input')).toBeNull();
      expect(screen.queryByTestId('webhook-token-input')).toBeNull();
      expect(screen.queryByTestId('save-webhook-btn')).toBeNull();
      expect(screen.queryByTestId('generator-settings')).toBeNull();
    });

    it('gracefully handles toggle-settings-btn click when onOpenSettings is omitted', () => {
      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={3}
          isOpen={true}
        />
      );

      expect(() => {
        fireEvent.click(screen.getByTestId('toggle-settings-btn'));
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 4. Active Configuration Utilization
  // =========================================================================
  describe('Active n8n Configuration Consumption', () => {
    it('utilizes active n8n configuration without requiring users to re-enter settings inside panel', async () => {
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: true,
        data: {
          commitMessage: 'feat(core): auto-dispatched commit\n\nGenerated using active n8n configuration.',
          parsed: {
            raw: 'feat(core): auto-dispatched commit\n\nGenerated using active n8n configuration.',
            type: 'feat',
            scope: 'core',
            subject: 'auto-dispatched commit',
            body: 'Generated using active n8n configuration.',
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

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            repoPath: '/workspace/project',
            webhookUrl: 'https://n8n.cloud/webhook/commit-gen',
          })
        );
      });

      // No prompt or input drawer was opened
      expect(screen.queryByTestId('webhook-url-input')).toBeNull();
      expect(screen.getByTestId('commit-subject-input')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 5. Unconfigured State & Actionable Guidance
  // =========================================================================
  describe('Unconfigured State Handling', () => {
    it('displays actionable guidance and Open Settings button when webhook is unconfigured', async () => {
      localStorage.clear();
      webhookConfig.clearWebhookConfig();
      const handleOpenSettings = vi.fn();

      mockApi.getWebhookConfig = vi.fn().mockResolvedValue({
        success: true,
        data: {
          webhookUrl: '',
          source: 'none',
          envDefaults: { webhookUrl: '', hasToken: false },
        },
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
          onOpenSettings={handleOpenSettings}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('generator-unconfigured-prompt')).toBeInTheDocument();
      });

      expect(screen.getByText(/Webhook endpoint not configured/i)).toBeInTheDocument();
      const openSettingsBtn = screen.getByTestId('open-settings-action');
      expect(openSettingsBtn).toBeInTheDocument();

      fireEvent.click(openSettingsBtn);
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 6. Custom Instructions Forwarding
  // =========================================================================
  describe('Custom Instructions Forwarding', () => {
    it('forwards custom instructions entered in custom-instructions-input to generateCommitMessage call', async () => {
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: true,
        data: {
          commitMessage: 'fix(security): resolve CVE-2026-1024 input sanitization',
          parsed: {
            raw: 'fix(security): resolve CVE-2026-1024 input sanitization',
            type: 'fix',
            scope: 'security',
            subject: 'resolve CVE-2026-1024 input sanitization',
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

      const promptInput = screen.getByTestId('custom-instructions-input') as HTMLInputElement;
      fireEvent.change(promptInput, {
        target: { value: 'Focus on resolving the input sanitization security advisory' },
      });

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(mockApi.generateCommitMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            repoPath: '/workspace/project',
            customPrompt: 'Focus on resolving the input sanitization security advisory',
          })
        );
      });
    });
  });

  // =========================================================================
  // 7. Actionable Error Messages & Retry
  // =========================================================================
  describe('Actionable Error Messages', () => {
    it('surfaces actionable error and Open Settings button on HTTP 401 Unauthorized', async () => {
      const handleOpenSettings = vi.fn();
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: false,
        error: 'Webhook returned HTTP 401: Unauthorized. Please check your API/bearer token in Settings.',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={2}
          isOpen={true}
          onOpenSettings={handleOpenSettings}
        />
      );

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('commit-generator-error')).toBeInTheDocument();
        expect(screen.getByText(/HTTP 401: Unauthorized/i)).toBeInTheDocument();
      });

      const openSettingsAction = screen.getByTestId('error-open-settings-btn');
      fireEvent.click(openSettingsAction);
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('surfaces actionable error on 30-second timeout and allows retrying', async () => {
      mockApi.generateCommitMessage = vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          error: 'Webhook request timed out after 30 seconds.',
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            commitMessage: 'feat: succeeded on retry',
            parsed: {
              raw: 'feat: succeeded on retry',
              type: 'feat',
              subject: 'succeeded on retry',
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

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByText(/timed out after 30 seconds/i)).toBeInTheDocument();
        expect(screen.getByTestId('retry-btn')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByTestId('retry-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('commit-subject-input')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('commit-generator-error')).toBeNull();
    });

    it('surfaces actionable connection refused error with retry button', async () => {
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: false,
        error: 'Webhook request failed: Connection refused. Check if your webhook server is running.',
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={1}
          isOpen={true}
        />
      );

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
        expect(screen.getByTestId('retry-btn')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 8. Commit Message Editing & Clipboard Copy
  // =========================================================================
  describe('Commit Message Editing & Clipboard', () => {
    it('populates editable subject, body, and conventional tags on success', async () => {
      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: true,
        data: {
          commitMessage: 'feat(ui)!: redesign commit generator\n\nStreamlines n8n settings interaction.',
          parsed: {
            raw: 'feat(ui)!: redesign commit generator\n\nStreamlines n8n settings interaction.',
            type: 'feat',
            scope: 'ui',
            subject: 'redesign commit generator',
            body: 'Streamlines n8n settings interaction.',
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

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('commit-subject-input')).toBeInTheDocument();
      });

      const subjectInput = screen.getByTestId('commit-subject-input') as HTMLInputElement;
      expect(subjectInput.value).toBe('feat(ui)!: redesign commit generator');

      const bodyTextarea = screen.getByTestId('commit-body-textarea') as HTMLTextAreaElement;
      expect(bodyTextarea.value).toBe('Streamlines n8n settings interaction.');

      // Check badges
      expect(screen.getByText('feat')).toBeInTheDocument();
      expect(screen.getByText('(ui)')).toBeInTheDocument();
      expect(screen.getByText('BREAKING')).toBeInTheDocument();

      // Edit subject
      fireEvent.change(subjectInput, { target: { value: 'feat(ui)!: updated subject text' } });
      expect(subjectInput.value).toBe('feat(ui)!: updated subject text');
    });

    it('copies commit message to clipboard and displays visual feedback', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
        success: true,
        data: {
          commitMessage: 'fix(core): resolve null pointer exception',
          parsed: {
            raw: 'fix(core): resolve null pointer exception',
            type: 'fix',
            scope: 'core',
            subject: 'resolve null pointer exception',
            isBreaking: false,
            isValid: true,
          },
        },
      });

      render(
        <CommitGeneratorPanel
          repoPath="/workspace/project"
          stagedCount={1}
          isOpen={true}
        />
      );

      fireEvent.click(screen.getByTestId('generate-commit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('copy-commit-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('copy-commit-btn'));

      expect(writeTextMock).toHaveBeenCalledWith('fix(core): resolve null pointer exception');
      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });
});
