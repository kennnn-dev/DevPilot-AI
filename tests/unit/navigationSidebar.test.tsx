import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NavigationSidebar from '../../src/renderer/components/NavigationSidebar';
import type { Workspace } from '../../src/shared/types';

describe('NavigationSidebar Component (tests/unit/navigationSidebar.test.tsx)', () => {
  const mockWorkspaces: Workspace[] = [
    {
      id: 'ws-default',
      name: 'Default Workspace',
      createdAt: 1700000000000,
      repoPaths: ['/workspace/repo-1'],
    },
    {
      id: 'ws-secondary',
      name: 'Secondary Workspace',
      createdAt: 1700000001000,
      repoPaths: ['/workspace/repo-2'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Rendering & Test IDs
  // =========================================================================
  describe('Rendering & Structure', () => {
    it('renders navigation sidebar, brand logo, and nav items', () => {
      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
        />
      );

      expect(screen.getByTestId('nav-sidebar')).toBeInTheDocument();
      expect(screen.getByText('DevPilot AI')).toBeInTheDocument();
      expect(screen.getAllByText('Workspaces').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('About')).toBeInTheDocument();
      expect(screen.getByTestId('nav-settings-btn')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Settings Interaction & Callbacks
  // =========================================================================
  describe('Settings Trigger Action', () => {
    it('clicking data-testid="nav-settings-btn" calls onOpenSettings callback', () => {
      const handleOpenSettings = vi.fn();

      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenSettings={handleOpenSettings}
        />
      );

      const settingsBtn = screen.getByTestId('nav-settings-btn');
      fireEvent.click(settingsBtn);

      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('pressing Enter key triggers onOpenSettings callback', () => {
      const handleOpenSettings = vi.fn();

      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenSettings={handleOpenSettings}
        />
      );

      const settingsBtn = screen.getByTestId('nav-settings-btn');
      fireEvent.keyDown(settingsBtn, { key: 'Enter' });

      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('pressing Space key triggers onOpenSettings callback', () => {
      const handleOpenSettings = vi.fn();

      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenSettings={handleOpenSettings}
        />
      );

      const settingsBtn = screen.getByTestId('nav-settings-btn');
      fireEvent.keyDown(settingsBtn, { key: ' ' });

      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('does not error when onOpenSettings is undefined', () => {
      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
        />
      );

      const settingsBtn = screen.getByTestId('nav-settings-btn');
      expect(() => fireEvent.click(settingsBtn)).not.toThrow();
    });
  });

  // =========================================================================
  // 3. Active State Styling
  // =========================================================================
  describe('Settings Active State', () => {
    it('applies nav-item-active CSS class when isSettingsActive={true}', () => {
      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          isSettingsActive={true}
        />
      );

      const settingsBtn = screen.getByTestId('nav-settings-btn');
      expect(settingsBtn).toHaveClass('nav-item-active');
    });

    it('does not apply nav-item-active CSS class when isSettingsActive={false} or omitted', () => {
      const { rerender } = render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          isSettingsActive={false}
        />
      );

      let settingsBtn = screen.getByTestId('nav-settings-btn');
      expect(settingsBtn).not.toHaveClass('nav-item-active');

      rerender(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
        />
      );

      settingsBtn = screen.getByTestId('nav-settings-btn');
      expect(settingsBtn).not.toHaveClass('nav-item-active');
    });
  });

  // =========================================================================
  // 4. Accessibility
  // =========================================================================
  describe('Accessibility', () => {
    it('renders Settings item as an interactive, accessible button', () => {
      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
        />
      );

      const settingsBtn = screen.getByTestId('nav-settings-btn');
      expect(settingsBtn.tagName.toLowerCase()).toBe('button');
      expect(settingsBtn).toHaveAttribute('type', 'button');
      expect(settingsBtn).toHaveAttribute('title', 'Settings');
    });
  });

  // =========================================================================
  // 5. Workspace Features Regression Protection
  // =========================================================================
  describe('Workspace Regression Protection', () => {
    it('allows selecting workspaces without interference from settings button', () => {
      const handleSelectWorkspace = vi.fn();

      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={handleSelectWorkspace}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );

      const secondaryCard = screen.getByText('Secondary Workspace');
      fireEvent.click(secondaryCard);

      expect(handleSelectWorkspace).toHaveBeenCalledWith('ws-secondary');
    });

    it('renders workspace creation form when plus button is clicked', () => {
      render(
        <NavigationSidebar
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-default"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
          onRenameWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
        />
      );

      const createBtn = screen.getByTestId('create-workspace-btn');
      fireEvent.click(createBtn);

      expect(screen.getByPlaceholderText('Workspace name...')).toBeInTheDocument();
    });
  });
});
