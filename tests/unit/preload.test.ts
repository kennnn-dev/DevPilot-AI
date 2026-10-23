import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke, mockExposeInMainWorld } = vi.hoisted(() => {
  return {
    mockInvoke: vi.fn(),
    mockExposeInMainWorld: vi.fn(),
  };
});

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mockInvoke,
  },
}));

describe('Preload Bridge (src/preload/index.ts)', () => {
  let exposedApi: any = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockExposeInMainWorld.mockReset();

    // Import preload module which runs contextBridge.exposeInMainWorld
    const preloadModule = await import('../../src/preload/index');
    exposedApi = preloadModule.api;
  });

  it('exposes devPilot API object on window main world with expected methods', () => {
    expect(mockExposeInMainWorld).toHaveBeenCalledWith('devPilot', exposedApi);
    expect(exposedApi).toBeDefined();
    expect(typeof exposedApi.openDirectory).toBe('function');
    expect(typeof exposedApi.getStatus).toBe('function');
    expect(typeof exposedApi.getStagedDiff).toBe('function');
  });

  it('openDirectory invokes dialog:open-directory and returns path or null', async () => {
    mockInvoke.mockResolvedValueOnce('/workspace/my-repo');
    const result = await exposedApi.openDirectory();
    expect(mockInvoke).toHaveBeenCalledWith('dialog:open-directory');
    expect(result).toBe('/workspace/my-repo');

    mockInvoke.mockResolvedValueOnce(null);
    const cancelResult = await exposedApi.openDirectory();
    expect(cancelResult).toBeNull();
  });

  it('getStatus validates repoPath before IPC invocation', async () => {
    const emptyResult = await exposedApi.getStatus('');
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.error).toContain('Repository path must be a non-empty string');
    expect(mockInvoke).not.toHaveBeenCalled();

    const whitespaceResult = await exposedApi.getStatus('   ');
    expect(whitespaceResult.success).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();

    const nonStringResult = await exposedApi.getStatus(null as unknown as string);
    expect(nonStringResult.success).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();

    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        repoPath: '/valid/repo',
        branch: 'main',
        isDetached: false,
        staged: [],
        unstaged: [],
        untracked: [],
      },
    });
    const validResult = await exposedApi.getStatus('/valid/repo');
    expect(mockInvoke).toHaveBeenCalledWith('git:get-status', '/valid/repo');
    expect(validResult.success).toBe(true);
    expect(validResult.data?.branch).toBe('main');
  });

  it('getStagedDiff validates parameters before IPC invocation', async () => {
    // 1. repoPath validation (empty, whitespace, non-string)
    const invalidRepo = await exposedApi.getStagedDiff('', 'file.ts');
    expect(invalidRepo.success).toBe(false);
    expect(invalidRepo.error).toContain('Repository path must be a non-empty string');
    expect(mockInvoke).not.toHaveBeenCalled();

    const whitespaceRepo = await exposedApi.getStagedDiff('   ', 'file.ts');
    expect(whitespaceRepo.success).toBe(false);
    expect(whitespaceRepo.error).toContain('Repository path must be a non-empty string');
    expect(mockInvoke).not.toHaveBeenCalled();

    const nullRepo = await exposedApi.getStagedDiff(null as unknown as string, 'file.ts');
    expect(nullRepo.success).toBe(false);
    expect(nullRepo.error).toContain('Repository path must be a non-empty string');
    expect(mockInvoke).not.toHaveBeenCalled();

    // 2. filePath validation (empty, whitespace, non-string)
    const invalidFile = await exposedApi.getStagedDiff('/repo', '');
    expect(invalidFile.success).toBe(false);
    expect(invalidFile.error).toContain('File path must be a non-empty string');
    expect(mockInvoke).not.toHaveBeenCalled();

    const whitespaceFile = await exposedApi.getStagedDiff('/repo', '   ');
    expect(whitespaceFile.success).toBe(false);
    expect(whitespaceFile.error).toContain('File path must be a non-empty string');
    expect(mockInvoke).not.toHaveBeenCalled();

    const nullFile = await exposedApi.getStagedDiff('/repo', null as unknown as string);
    expect(nullFile.success).toBe(false);
    expect(nullFile.error).toContain('File path must be a non-empty string');
    expect(mockInvoke).not.toHaveBeenCalled();

    // 3. Optional oldPath validation when provided
    const emptyOldPath = await exposedApi.getStagedDiff('/valid/repo', 'src/index.ts', '');
    expect(emptyOldPath.success).toBe(false);
    expect(emptyOldPath.error).toBe('Old file path must be a non-empty string when provided.');
    expect(mockInvoke).not.toHaveBeenCalled();

    const whitespaceOldPath = await exposedApi.getStagedDiff('/valid/repo', 'src/index.ts', '   ');
    expect(whitespaceOldPath.success).toBe(false);
    expect(whitespaceOldPath.error).toBe('Old file path must be a non-empty string when provided.');
    expect(mockInvoke).not.toHaveBeenCalled();

    const numberOldPath = await exposedApi.getStagedDiff('/valid/repo', 'src/index.ts', 12345 as unknown as string);
    expect(numberOldPath.success).toBe(false);
    expect(numberOldPath.error).toBe('Old file path must be a non-empty string when provided.');
    expect(mockInvoke).not.toHaveBeenCalled();

    const objectOldPath = await exposedApi.getStagedDiff('/valid/repo', 'src/index.ts', { evil: 'object' } as unknown as string);
    expect(objectOldPath.success).toBe(false);
    expect(objectOldPath.error).toBe('Old file path must be a non-empty string when provided.');
    expect(mockInvoke).not.toHaveBeenCalled();

    // 4. Valid invocation without oldPath (undefined)
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        repoPath: '/valid/repo',
        filePath: 'src/index.ts',
        rawDiff: '',
        isBinary: false,
        isEmpty: true,
        hunks: [],
      },
    });
    const validNoOldPath = await exposedApi.getStagedDiff('/valid/repo', 'src/index.ts');
    expect(mockInvoke).toHaveBeenCalledWith('git:get-staged-diff', {
      repoPath: '/valid/repo',
      filePath: 'src/index.ts',
      oldPath: undefined,
    });
    expect(validNoOldPath.success).toBe(true);

    // 5. Valid invocation with valid oldPath string
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        repoPath: '/valid/repo',
        filePath: 'src/index.ts',
        rawDiff: '',
        isBinary: false,
        isEmpty: true,
        hunks: [],
      },
    });
    const validResult = await exposedApi.getStagedDiff('/valid/repo', 'src/index.ts', 'src/old.ts');
    expect(mockInvoke).toHaveBeenCalledWith('git:get-staged-diff', {
      repoPath: '/valid/repo',
      filePath: 'src/index.ts',
      oldPath: 'src/old.ts',
    });
    expect(validResult.success).toBe(true);
    expect(validResult.data?.filePath).toBe('src/index.ts');
  });
});
