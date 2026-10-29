import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleReviewWorkspace } from '../../src/main/ipc/webhookHandlers';
import { aiService } from '../../src/main/services/ai/aiService';

vi.mock('../../src/main/git/gitService', () => ({
  gitService: {
    getStatus: vi.fn(),
    getAllStagedDiff: vi.fn(),
  },
}));

vi.mock('../../src/main/services/ai/aiService', () => ({
  aiService: {
    generateCommitMessage: vi.fn(),
    reviewWorkspaceChanges: vi.fn(),
    getResolvedAIConfig: vi.fn(),
    resolveActiveProvider: vi.fn(),
  },
}));

describe('handleReviewWorkspace IPC Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates workspace review options directly to aiService.reviewWorkspaceChanges', async () => {
    const mockResult = {
      success: true,
      data: {
        activeRepoPath: '/test/repo',
        activeRepoName: 'test-repo',
        mode: 'plain' as const,
        plainEnglishSummary: 'Updates user checkout',
        whyItMatters: 'Improves UX',
        suggestedVerification: ['Test checkout'],
        crossRepoImpacts: [],
        overallImpactStatus: 'safe' as const,
      },
    };

    vi.mocked(aiService.reviewWorkspaceChanges).mockResolvedValue(mockResult);

    const result = await handleReviewWorkspace({
      activeRepoPath: '/test/repo',
      workspaceRepoPaths: ['/test/repo', '/test/sibling'],
      mode: 'plain',
    });

    expect(aiService.reviewWorkspaceChanges).toHaveBeenCalledWith({
      activeRepoPath: '/test/repo',
      workspaceRepoPaths: ['/test/repo', '/test/sibling'],
      mode: 'plain',
    });
    expect(result).toEqual(mockResult);
  });

  it('returns failure if aiService.reviewWorkspaceChanges fails', async () => {
    vi.mocked(aiService.reviewWorkspaceChanges).mockResolvedValue({
      success: false,
      error: 'Not a valid Git repository.',
    });

    const result = await handleReviewWorkspace({
      activeRepoPath: '/invalid/path',
      workspaceRepoPaths: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not a valid Git repository.');
  });
});
