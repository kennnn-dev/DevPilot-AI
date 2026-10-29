import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspaceReviewModal } from '../../src/renderer/components/WorkspaceReview/WorkspaceReviewModal';
import type { WorkspaceReviewResult } from '../../src/shared/types';

describe('WorkspaceReviewModal Component', () => {
  const mockReviewResult: WorkspaceReviewResult = {
    activeRepoPath: '/workspaces/ecommerce/backend',
    activeRepoName: 'backend-api',
    mode: 'plain',
    plainEnglishSummary: 'Added support for Apple Pay and Google Pay at checkout.',
    whyItMatters: 'Makes purchasing faster on mobile devices and increases conversion rates.',
    suggestedVerification: [
      'Open checkout on mobile device',
      'Select Apple Pay and complete dummy purchase',
    ],
    overallImpactStatus: 'potential_impact',
    crossRepoImpacts: [
      {
        repoPath: '/workspaces/ecommerce/frontend',
        repoName: 'frontend-web',
        status: 'potential_impact',
        summary: 'Frontend checkout page calls the updated payment endpoint.',
        affectedSymbolsOrEndpoints: ['/api/v1/checkout/applepay'],
        affectedFiles: ['src/pages/Checkout.tsx'],
      },
      {
        repoPath: '/workspaces/ecommerce/shared-types',
        repoName: 'shared-types',
        status: 'safe',
        summary: 'No changes required for shared types.',
      },
    ],
  };

  const defaultProps = {
    isOpen: true,
    activeRepoPath: '/workspaces/ecommerce/backend',
    workspaceRepoPaths: [
      '/workspaces/ecommerce/backend',
      '/workspaces/ecommerce/frontend',
      '/workspaces/ecommerce/shared-types',
    ],
    reviewResult: mockReviewResult,
    loading: false,
    error: null,
    mode: 'plain' as const,
    customPrompt: '',
    onClose: vi.fn(),
    onSetMode: vi.fn(),
    onSetCustomPrompt: vi.fn(),
    onRunReview: vi.fn().mockResolvedValue(undefined),
    onClearReview: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<WorkspaceReviewModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal header, subtitle with sibling count, and close button when isOpen is true', () => {
    render(<WorkspaceReviewModal {...defaultProps} />);

    expect(screen.getByTestId('workspace-review-modal')).toBeInTheDocument();
    expect(screen.getByText('Workspace Review & Impact Analysis')).toBeInTheDocument();
    expect(screen.getByText(/2 sibling repo\(s\)/)).toBeInTheDocument();
    expect(screen.getByTestId('close-review-modal-btn')).toBeInTheDocument();
  });

  it('renders audience mode switcher and displays Plain English content by default', () => {
    render(<WorkspaceReviewModal {...defaultProps} />);

    const plainTab = screen.getByTestId('audience-toggle-plain');
    const techTab = screen.getByTestId('audience-toggle-technical');

    expect(plainTab).toHaveClass('active');
    expect(techTab).not.toHaveClass('active');

    expect(screen.getByTestId('workspace-review-summary')).toHaveTextContent(
      'Added support for Apple Pay and Google Pay at checkout.'
    );
    expect(screen.getByTestId('workspace-review-why-matters')).toHaveTextContent(
      'Makes purchasing faster on mobile devices'
    );
  });

  it('switches to Technical Details when clicked, calling onSetMode and onRunReview', async () => {
    render(<WorkspaceReviewModal {...defaultProps} />);

    const techTab = screen.getByTestId('audience-toggle-technical');
    fireEvent.click(techTab);

    expect(defaultProps.onSetMode).toHaveBeenCalledWith('technical');
    expect(defaultProps.onRunReview).toHaveBeenCalledWith('technical');
  });

  it('renders cross-repository sibling impacts with status badges and touchpoints', () => {
    render(<WorkspaceReviewModal {...defaultProps} />);

    expect(screen.getByTestId('sibling-repo-impact-card-0')).toHaveTextContent('frontend-web');
    expect(screen.getByTestId('sibling-repo-impact-card-0')).toHaveTextContent('Potential Impact');
    expect(screen.getByTestId('sibling-repo-impact-card-0')).toHaveTextContent(
      '/api/v1/checkout/applepay'
    );

    expect(screen.getByTestId('sibling-repo-impact-card-1')).toHaveTextContent('shared-types');
    expect(screen.getByTestId('sibling-repo-impact-card-1')).toHaveTextContent('Isolated / Safe');
  });

  it('renders suggested verification steps for QA and non-devs', () => {
    render(<WorkspaceReviewModal {...defaultProps} />);

    expect(screen.getByTestId('workspace-review-verification')).toHaveTextContent(
      'Open checkout on mobile device'
    );
    expect(screen.getByTestId('workspace-review-verification')).toHaveTextContent(
      'Select Apple Pay and complete dummy purchase'
    );
  });

  it('renders loading indicator when loading is true', () => {
    render(<WorkspaceReviewModal {...defaultProps} loading={true} reviewResult={null} />);

    expect(screen.getByTestId('workspace-review-loading')).toBeInTheDocument();
    expect(
      screen.getByText(/Translating changes into plain English & checking workspace sibling repos/)
    ).toBeInTheDocument();
  });

  it('renders error alert when error is provided', () => {
    render(
      <WorkspaceReviewModal
        {...defaultProps}
        error="Ollama is offline. Run 'ollama serve' in your terminal."
      />
    );

    expect(screen.getByTestId('workspace-review-error')).toHaveTextContent(
      "Ollama is offline. Run 'ollama serve' in your terminal."
    );
  });

  it('copies review markdown to clipboard when Copy Report button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<WorkspaceReviewModal {...defaultProps} />);

    const copyBtn = screen.getByTestId('copy-review-btn');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
      expect(screen.getByText('Copied to Clipboard!')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked or Escape key is pressed', () => {
    render(<WorkspaceReviewModal {...defaultProps} />);

    const closeBtn = screen.getByTestId('close-review-modal-btn');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
  });
});
