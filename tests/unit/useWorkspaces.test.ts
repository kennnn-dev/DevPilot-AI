import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaces } from '../../src/renderer/hooks/useWorkspaces';

describe('useWorkspaces Hook (src/renderer/hooks/useWorkspaces.ts)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('initializes with default workspace and empty repositories', () => {
    const { result } = renderHook(() => useWorkspaces());

    expect(result.current.workspaces.length).toBe(1);
    expect(result.current.activeWorkspace.name).toBe('Default Workspace');
    expect(result.current.activeWorkspace.repoPaths).toEqual([]);
    expect(result.current.activeRepoPath).toBeNull();
  });

  it('creates new workspaces and sets them active', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.createWorkspace('Frontend Team');
    });

    expect(result.current.workspaces.length).toBe(2);
    expect(result.current.activeWorkspace.name).toBe('Frontend Team');
    expect(result.current.currentRepoPaths).toEqual([]);
  });

  it('renames an existing workspace', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.renameWorkspace('default', 'DevPilot Core');
    });

    expect(result.current.activeWorkspace.name).toBe('DevPilot Core');
  });

  it('deletes workspace if more than one exists and switches to remaining', () => {
    const { result } = renderHook(() => useWorkspaces());

    let ws2Id = '';
    act(() => {
      const ws2 = result.current.createWorkspace('Secondary');
      ws2Id = ws2.id;
    });

    expect(result.current.workspaces.length).toBe(2);

    act(() => {
      result.current.deleteWorkspace(ws2Id);
    });

    expect(result.current.workspaces.length).toBe(1);
    expect(result.current.activeWorkspace.id).toBe('default');
  });

  it('does not delete the last remaining workspace', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.deleteWorkspace('default');
    });

    expect(result.current.workspaces.length).toBe(1);
  });

  it('adds repositories to active workspace and selects newly added repo', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.addRepoToWorkspace('/home/dev/repo-a');
    });

    expect(result.current.currentRepoPaths).toEqual(['/home/dev/repo-a']);
    expect(result.current.activeRepoPath).toBe('/home/dev/repo-a');

    act(() => {
      result.current.addRepoToWorkspace('/home/dev/repo-b');
    });

    expect(result.current.currentRepoPaths).toEqual([
      '/home/dev/repo-a',
      '/home/dev/repo-b',
    ]);
    expect(result.current.activeRepoPath).toBe('/home/dev/repo-b');
  });

  it('prevents adding duplicate repository paths to the same workspace', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.addRepoToWorkspace('/home/dev/repo-a');
    });

    act(() => {
      const added = result.current.addRepoToWorkspace('/home/dev/repo-a');
      expect(added).toBe(false);
    });

    expect(result.current.currentRepoPaths).toEqual(['/home/dev/repo-a']);
  });

  it('removes repository from workspace and updates active repo', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.addRepoToWorkspace('/home/dev/repo-a');
      result.current.addRepoToWorkspace('/home/dev/repo-b');
    });

    expect(result.current.activeRepoPath).toBe('/home/dev/repo-b');

    act(() => {
      result.current.removeRepoFromWorkspace('/home/dev/repo-b');
    });

    expect(result.current.currentRepoPaths).toEqual(['/home/dev/repo-a']);
    expect(result.current.activeRepoPath).toBe('/home/dev/repo-a');
  });

  it('switches between workspaces and restores active repository', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.addRepoToWorkspace('/home/dev/repo-default');
    });

    act(() => {
      result.current.createWorkspace('Workspace 2');
      result.current.addRepoToWorkspace('/home/dev/repo-ws2');
    });

    expect(result.current.activeWorkspace.name).toBe('Workspace 2');
    expect(result.current.activeRepoPath).toBe('/home/dev/repo-ws2');

    act(() => {
      result.current.selectWorkspace('default');
    });

    expect(result.current.activeWorkspace.id).toBe('default');
    expect(result.current.activeRepoPath).toBe('/home/dev/repo-default');
  });

  it('ensures new workspace has zero repositories and does not copy from existing workspaces', () => {
    const { result } = renderHook(() => useWorkspaces());

    act(() => {
      result.current.addRepoToWorkspace('/home/dev/existing-repo-1');
      result.current.addRepoToWorkspace('/home/dev/existing-repo-2');
    });

    expect(result.current.currentRepoPaths.length).toBe(2);

    act(() => {
      result.current.createWorkspace('Brand New Isolated Workspace');
    });

    expect(result.current.activeWorkspace.name).toBe('Brand New Isolated Workspace');
    expect(result.current.currentRepoPaths).toEqual([]);
    expect(result.current.activeWorkspace.repoPaths).toEqual([]);
    expect(result.current.activeRepoPath).toBeNull();
  });
});
