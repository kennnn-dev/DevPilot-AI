import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommitGeneratorPanel from '../../src/renderer/components/CommitGenerator/CommitGeneratorPanel';
import type { DevPilotAPI } from '../../src/shared/types';
import * as webhookConfig from '../../src/renderer/services/webhookConfig';

describe('CommitGeneratorPanel UI (src/renderer/components/CommitGenerator/CommitGeneratorPanel.tsx)', () => {
  let mockApi: Partial<DevPilotAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockApi = {
      generateCommitMessage: vi.fn(),
    };

    Object.defineProperty(window, 'devPilot', {
      value: mockApi,
      writable: true,
      configurable: true,
    });

    // Provide default valid webhook URL
    webhookConfig.setWebhookUrl('https://n8n.cloud/webhook/commit-gen');
  });

  it('renders panel header and initial controls', () => {
    render(
      <CommitGeneratorPanel
        repoPath="/workspace/project"
        stagedCount={2}
        isOpen={true}
      />
    );

    expect(screen.getByText('AI Commit Assistant')).toBeDefined();
    expect(screen.getByTestId('generate-commit-btn')).toBeDefined();
    expect(screen.getByTestId('toggle-settings-btn')).toBeDefined();
  });

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
    expect(screen.getByText(/No staged changes/i)).toBeDefined();
  });

  it('toggles webhook settings view and allows editing URL', () => {
    render(
      <CommitGeneratorPanel
        repoPath="/workspace/project"
        stagedCount={3}
        isOpen={true}
      />
    );

    fireEvent.click(screen.getByTestId('toggle-settings-btn'));
    expect(screen.getByTestId('webhook-url-input')).toBeDefined();

    const input = screen.getByTestId('webhook-url-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://new-endpoint.io/webhook' } });
    fireEvent.click(screen.getByTestId('save-webhook-btn'));

    expect(webhookConfig.getWebhookUrl()).toBe('https://new-endpoint.io/webhook');
  });

  it('generates commit and populates editable subject and body', async () => {
    mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
      success: true,
      data: {
        commitMessage: 'feat(ui): add commit generator assistant\n\nAllows users to quickly draft commit messages.',
        parsed: {
          raw: 'feat(ui): add commit generator assistant\n\nAllows users to quickly draft commit messages.',
          type: 'feat',
          scope: 'ui',
          subject: 'add commit generator assistant',
          body: 'Allows users to quickly draft commit messages.',
          isBreaking: false,
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
      expect(screen.getByTestId('commit-subject-input')).toBeDefined();
    });

    const subjectInput = screen.getByTestId('commit-subject-input') as HTMLInputElement;
    expect(subjectInput.value).toBe('feat(ui): add commit generator assistant');

    const bodyTextarea = screen.getByTestId('commit-body-textarea') as HTMLTextAreaElement;
    expect(bodyTextarea.value).toBe('Allows users to quickly draft commit messages.');

    expect(screen.getByText('feat')).toBeDefined();
  });

  it('copies commit to clipboard and shows visual feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
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
      expect(screen.getByTestId('copy-commit-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('copy-commit-btn'));

    expect(writeTextMock).toHaveBeenCalledWith('fix(core): resolve null pointer exception');
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeDefined();
    });
  });

  it('displays error banner and retry button on failure', async () => {
    mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
      success: false,
      error: 'Network connection refused by webhook host',
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
      expect(screen.getByTestId('commit-generator-error')).toBeDefined();
      expect(screen.getByText(/Network connection refused/)).toBeDefined();
      expect(screen.getByTestId('retry-generate-btn')).toBeDefined();
    });
  });
});
