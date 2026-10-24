import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommitGenerator } from '../../src/renderer/hooks/useCommitGenerator';
import type { DevPilotAPI } from '../../src/shared/types';

describe('useCommitGenerator Hook (src/renderer/hooks/useCommitGenerator.ts)', () => {
  let mockApi: Partial<DevPilotAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      generateCommitMessage: vi.fn(),
    };
    Object.defineProperty(window, 'devPilot', {
      value: mockApi,
      writable: true,
      configurable: true,
    });
  });

  it('initializes with default state for active repo', () => {
    const { result } = renderHook(() => useCommitGenerator('/repo/a'));

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generatedCommit).toBeNull();
    expect(result.current.parsedCommit).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.customPrompt).toBe('');
  });

  it('isolates state across different repositories', () => {
    const { result, rerender } = renderHook(
      ({ repo }) => useCommitGenerator(repo),
      { initialProps: { repo: '/repo/a' } }
    );

    act(() => {
      result.current.setCustomPrompt('Focus on performance for repo A');
      result.current.setGeneratedCommit('perf: optimize loop in repo A');
    });

    expect(result.current.generatedCommit).toBe('perf: optimize loop in repo A');
    expect(result.current.customPrompt).toBe('Focus on performance for repo A');

    // Switch to repo B
    rerender({ repo: '/repo/b' });

    expect(result.current.generatedCommit).toBeNull();
    expect(result.current.customPrompt).toBe('');

    // Set state on repo B
    act(() => {
      result.current.setCustomPrompt('Focus on security for repo B');
      result.current.setGeneratedCommit('fix(sec): patch vulnerability');
    });

    expect(result.current.generatedCommit).toBe('fix(sec): patch vulnerability');

    // Switch back to repo A and verify original state preserved
    rerender({ repo: '/repo/a' });
    expect(result.current.generatedCommit).toBe('perf: optimize loop in repo A');
    expect(result.current.customPrompt).toBe('Focus on performance for repo A');
  });

  it('calls window.devPilot.generateCommitMessage successfully', async () => {
    mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
      success: true,
      data: {
        commitMessage: 'feat(core): implement core engine',
        parsed: {
          raw: 'feat(core): implement core engine',
          type: 'feat',
          scope: 'core',
          subject: 'implement core engine',
          isBreaking: false,
          isValid: true,
        },
      },
    });

    const { result } = renderHook(() => useCommitGenerator('/repo/test'));

    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.generateCommit(
        '/repo/test',
        'https://webhook.n8n/generate',
        'make it concise'
      );
    });

    expect(ok).toBe(true);
    expect(mockApi.generateCommitMessage).toHaveBeenCalledWith({
      repoPath: '/repo/test',
      webhookUrl: 'https://webhook.n8n/generate',
      customPrompt: 'make it concise',
    });
    expect(result.current.generatedCommit).toBe('feat(core): implement core engine');
    expect(result.current.parsedCommit?.type).toBe('feat');
    expect(result.current.parsedCommit?.scope).toBe('core');
    expect(result.current.error).toBeNull();
  });

  it('handles error response from generateCommitMessage', async () => {
    mockApi.generateCommitMessage = vi.fn().mockResolvedValueOnce({
      success: false,
      error: 'Webhook timeout',
    });

    const { result } = renderHook(() => useCommitGenerator('/repo/test'));

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.generateCommit('/repo/test', 'https://webhook.n8n/generate');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Webhook timeout');
    expect(result.current.generatedCommit).toBeNull();
  });
});
