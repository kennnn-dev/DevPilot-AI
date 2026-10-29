import { describe, it, expect } from 'vitest';
import {
  buildWorkspaceReviewSystemPrompt,
  buildWorkspaceReviewUserPrompt,
  parseWorkspaceReviewResponse,
} from '../../src/main/services/ai/promptBuilder';
import type { GitAllStagedDiffResult, SiblingRepoImpact } from '../../src/shared/types';

describe('Workspace Review Prompt Engineering & Parser', () => {
  describe('buildWorkspaceReviewSystemPrompt', () => {
    it('generates non-dev plain English instructions when mode is plain', () => {
      const prompt = buildWorkspaceReviewSystemPrompt('plain');
      expect(prompt).toContain('simple, everyday language');
      expect(prompt).toContain('DO NOT USE technical terms');
      expect(prompt).toContain('plainEnglishSummary');
      expect(prompt).toContain('whyItMatters');
      expect(prompt).toContain('suggestedVerification');
      expect(prompt).toContain('crossRepoImpacts');
    });

    it('generates technical architecture instructions when mode is technical', () => {
      const prompt = buildWorkspaceReviewSystemPrompt('technical');
      expect(prompt).toContain('Senior Software Architect');
      expect(prompt).toContain('technicalDetails');
      expect(prompt).toContain('architectural');
    });
  });

  describe('buildWorkspaceReviewUserPrompt', () => {
    it('packages active repository context, sibling candidates, and diff into prompt', () => {
      const mockDiffData: GitAllStagedDiffResult = {
        repoPath: '/workspace/backend',
        rawDiff: '+ export function handlePayment() { return true; }',
        stagedFiles: [{ path: 'src/payment.ts', changeType: 'modified', statusCode: 'M ' }],
        summary: { filesChanged: 1, insertions: 1, deletions: 0 },
        isEmpty: false,
      };

      const siblingImpacts: SiblingRepoImpact[] = [
        {
          repoPath: '/workspace/mobile-app',
          repoName: 'mobile-app',
          status: 'potential_impact',
          summary: 'Touchpoint detected in payment service',
          affectedSymbolsOrEndpoints: ['handlePayment'],
          affectedFiles: ['src/services/pay.ts'],
        },
      ];

      const prompt = buildWorkspaceReviewUserPrompt(
        '/workspace/backend',
        'backend-service',
        siblingImpacts,
        mockDiffData,
        'plain',
        'Check security'
      );

      expect(prompt).toContain('Active Repository: backend-service');
      expect(prompt).toContain('mobile-app');
      expect(prompt).toContain('handlePayment');
      expect(prompt).toContain('Check security');
      expect(prompt).toContain('+ export function handlePayment()');
    });
  });

  describe('parseWorkspaceReviewResponse', () => {
    const baselineImpacts: SiblingRepoImpact[] = [
      {
        repoPath: '/workspace/frontend',
        repoName: 'frontend-app',
        status: 'safe',
        summary: 'No shared touchpoints detected.',
      },
    ];

    it('parses valid JSON response and populates review result', () => {
      const rawJson = JSON.stringify({
        plainEnglishSummary: 'Users can now complete payments without waiting for an email confirmation.',
        whyItMatters: 'Reduces checkout abandonment rate.',
        suggestedVerification: ['Add item to cart', 'Click checkout and verify instant confirmation'],
        overallImpactStatus: 'safe',
        crossRepoImpacts: [
          {
            repoName: 'frontend-app',
            status: 'safe',
            summary: 'Frontend relies on separate payment webhook.',
          },
        ],
      });

      const result = parseWorkspaceReviewResponse(
        rawJson,
        '/workspace/backend',
        'backend',
        baselineImpacts,
        'plain'
      );

      expect(result.plainEnglishSummary).toBe(
        'Users can now complete payments without waiting for an email confirmation.'
      );
      expect(result.whyItMatters).toBe('Reduces checkout abandonment rate.');
      expect(result.suggestedVerification).toHaveLength(2);
      expect(result.crossRepoImpacts[0].status).toBe('safe');
      expect(result.overallImpactStatus).toBe('safe');
    });

    it('parses JSON wrapped inside markdown code fences', () => {
      const wrapped = `
Here is your review:
\`\`\`json
{
  "plainEnglishSummary": "Fixed login button timeout.",
  "whyItMatters": "Prevents users from getting stuck on login.",
  "suggestedVerification": ["Click login"],
  "overallImpactStatus": "safe",
  "crossRepoImpacts": []
}
\`\`\`
Hope this helps!
`;
      const result = parseWorkspaceReviewResponse(
        wrapped,
        '/workspace/backend',
        'backend',
        baselineImpacts,
        'plain'
      );

      expect(result.plainEnglishSummary).toBe('Fixed login button timeout.');
      expect(result.whyItMatters).toBe('Prevents users from getting stuck on login.');
      expect(result.overallImpactStatus).toBe('safe');
    });

    it('handles non-JSON freeform text response gracefully without throwing', () => {
      const freeform = 'This update improves server performance by caching database queries.';
      const result = parseWorkspaceReviewResponse(
        freeform,
        '/workspace/backend',
        'backend',
        baselineImpacts,
        'plain'
      );

      expect(result.plainEnglishSummary).toBe(freeform);
      expect(result.whyItMatters).toBeDefined();
      expect(result.suggestedVerification.length).toBeGreaterThan(0);
      expect(result.overallImpactStatus).toBe('safe');
    });
  });
});
