import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockApp,
  mockBrowserWindow,
  mockIpcMain,
  mockDialog,
  mockShell,
  mockSession,
  registeredHandlers,
} = vi.hoisted(() => {
  const handlers = new Map<string, Function>();

  return {
    registeredHandlers: handlers,
    mockApp: {
      requestSingleInstanceLock: vi.fn(() => true),
      on: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      quit: vi.fn(),
    },
    mockBrowserWindow: {
      getFocusedWindow: vi.fn(),
      getAllWindows: vi.fn(() => []),
    },
    mockIpcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
    },
    mockDialog: {
      showOpenDialog: vi.fn(),
    },
    mockShell: {
      openExternal: vi.fn(() => Promise.resolve()),
    },
    mockSession: {
      defaultSession: {
        setPermissionRequestHandler: vi.fn(),
        webRequest: {
          onHeadersReceived: vi.fn(),
        },
      },
    },
  };
});

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  dialog: mockDialog,
  shell: mockShell,
  session: mockSession,
}));

describe('Main Process Security Hardening (src/main/index.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
  });

  describe('resolvePreloadPath', () => {
    it('resolves to a preload script and never to main process index.js', async () => {
      const { resolvePreloadPath } = await import('../../src/main/index');
      const preloadPath = resolvePreloadPath();

      expect(typeof preloadPath).toBe('string');
      expect(preloadPath).toMatch(/preload/);
      expect(preloadPath).not.toMatch(/[/\\]main[/\\]index\.js$/);
      expect(preloadPath.endsWith('.js') || preloadPath.endsWith('.mjs')).toBe(true);
    });
  });

  describe('isAllowedNavigation URL Origin Validation', () => {
    const originalEnv = process.env.VITE_DEV_SERVER_URL;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.VITE_DEV_SERVER_URL;
      } else {
        process.env.VITE_DEV_SERVER_URL = originalEnv;
      }
    });

    it('blocks all navigations and redirects in production mode', async () => {
      delete process.env.VITE_DEV_SERVER_URL;
      const { isAllowedNavigation } = await import('../../src/main/index');

      expect(isAllowedNavigation('file:///etc/passwd')).toBe(false);
      expect(isAllowedNavigation('file:///path/to/dist/index.html')).toBe(false);
      expect(isAllowedNavigation('http://localhost:5173')).toBe(false);
      expect(isAllowedNavigation('https://github.com')).toBe(false);
      expect(isAllowedNavigation('javascript:alert(1)')).toBe(false);
      expect(isAllowedNavigation('invalid-url')).toBe(false);
    });

    it('in development mode, allows exact dev server origin and blocks spoofed origins', async () => {
      process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
      const { isAllowedNavigation } = await import('../../src/main/index');

      // Valid dev server navigations
      expect(isAllowedNavigation('http://localhost:5173')).toBe(true);
      expect(isAllowedNavigation('http://localhost:5173/')).toBe(true);
      expect(isAllowedNavigation('http://localhost:5173/diff-viewer?repo=/test')).toBe(true);
      expect(isAllowedNavigation('http://localhost:5173/#/staged')).toBe(true);

      // Spoofed origins must be BLOCKED
      expect(isAllowedNavigation('http://localhost:5173.attacker.com')).toBe(false);
      expect(isAllowedNavigation('http://localhost:51730')).toBe(false);
      expect(isAllowedNavigation('http://localhost:5173@attacker.com')).toBe(false);
      expect(isAllowedNavigation('http://127.0.0.1:5173')).toBe(false);
      expect(isAllowedNavigation('https://evil.com')).toBe(false);
      expect(isAllowedNavigation('file:///etc/passwd')).toBe(false);
      expect(isAllowedNavigation('not a valid url')).toBe(false);
    });
  });

  it('getWindowSecurityOptions enforces all security settings', async () => {
    const { getWindowSecurityOptions } = await import('../../src/main/index');
    const dummyPreload = '/path/to/preload.js';
    const options = getWindowSecurityOptions(dummyPreload);

    expect(options.show).toBe(false);
    expect(options.backgroundColor).toBe('#0f172a');
    expect(options.webPreferences).toBeDefined();
    expect(options.webPreferences?.preload).toBe(dummyPreload);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.nodeIntegrationInWorker).toBe(false);
    expect(options.webPreferences?.nodeIntegrationInSubFrames).toBe(false);
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.webSecurity).toBe(true);
    expect(options.webPreferences?.allowRunningInsecureContent).toBe(false);
    expect(options.webPreferences?.navigateOnDragDrop).toBe(false);
    expect(options.webPreferences?.spellcheck).toBe(false);
  });

  it('configureWebContentsSecurity blocks new windows and denies popups', async () => {
    const { configureWebContentsSecurity } = await import('../../src/main/index');
    let windowOpenHandler: ((details: { url: string }) => { action: 'deny' | 'allow' }) | null = null;
    const eventListeners: Record<string, Function> = {};

    const mockContents: any = {
      on: vi.fn((event: string, callback: Function) => {
        eventListeners[event] = callback;
      }),
      setWindowOpenHandler: vi.fn((fn: any) => {
        windowOpenHandler = fn;
      }),
    };

    configureWebContentsSecurity(mockContents);

    expect(mockContents.setWindowOpenHandler).toHaveBeenCalled();
    expect(windowOpenHandler).toBeDefined();

    // Verify popup denial and shell open for https link
    const httpsResult = windowOpenHandler!({ url: 'https://github.com' });
    expect(httpsResult).toEqual({ action: 'deny' });
    expect(mockShell.openExternal).toHaveBeenCalledWith('https://github.com');

    // Verify non-http blocked and not forwarded to shell
    mockShell.openExternal.mockClear();
    const fileResult = windowOpenHandler!({ url: 'file:///etc/passwd' });
    expect(fileResult).toEqual({ action: 'deny' });
    expect(mockShell.openExternal).not.toHaveBeenCalled();

    // Verify webview block
    const preventDefault = vi.fn();
    eventListeners['will-attach-webview']({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();

    // Verify navigation block
    const navPreventDefault = vi.fn();
    eventListeners['will-navigate']({ preventDefault: navPreventDefault }, 'http://malicious.com');
    expect(navPreventDefault).toHaveBeenCalled();

    // Verify local file navigation block in production
    const fileNavPreventDefault = vi.fn();
    eventListeners['will-navigate']({ preventDefault: fileNavPreventDefault }, 'file:///etc/passwd');
    expect(fileNavPreventDefault).toHaveBeenCalled();

    // Verify redirect block in production
    const redirectPreventDefault = vi.fn();
    eventListeners['will-redirect']({ preventDefault: redirectPreventDefault }, 'file:///etc/shadow');
    expect(redirectPreventDefault).toHaveBeenCalled();

    // In development mode, verify allowed dev origin vs blocked spoofed origin
    const originalEnv = process.env.VITE_DEV_SERVER_URL;
    try {
      process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
      const devValidNavPreventDefault = vi.fn();
      eventListeners['will-navigate']({ preventDefault: devValidNavPreventDefault }, 'http://localhost:5173/app');
      expect(devValidNavPreventDefault).not.toHaveBeenCalled();

      const devSpoofNavPreventDefault = vi.fn();
      eventListeners['will-navigate']({ preventDefault: devSpoofNavPreventDefault }, 'http://localhost:5173.attacker.com');
      expect(devSpoofNavPreventDefault).toHaveBeenCalled();
    } finally {
      if (originalEnv !== undefined) {
        process.env.VITE_DEV_SERVER_URL = originalEnv;
      } else {
        delete process.env.VITE_DEV_SERVER_URL;
      }
    }
  });

  it('configureSessionSecurity sets permission denial and CSP', async () => {
    const { configureSessionSecurity } = await import('../../src/main/index');
    let permissionHandler: Function | null = null;
    let headersHandler: Function | null = null;

    const mockSess: any = {
      setPermissionRequestHandler: vi.fn((cb) => {
        permissionHandler = cb;
      }),
      webRequest: {
        onHeadersReceived: vi.fn((cb) => {
          headersHandler = cb;
        }),
      },
    };

    configureSessionSecurity(mockSess);

    expect(permissionHandler).toBeDefined();
    const permissionCallback = vi.fn();
    permissionHandler!(null, 'camera', permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);

    expect(headersHandler).toBeDefined();
    const responseCallback = vi.fn();
    headersHandler!({ responseHeaders: {} }, responseCallback);
    expect(responseCallback).toHaveBeenCalled();
    const callArgs = responseCallback.mock.calls[0][0];
    expect(callArgs.responseHeaders['Content-Security-Policy']).toBeDefined();
    expect(callArgs.responseHeaders['Content-Security-Policy'][0]).toContain("default-src 'self'");
  });

  it('registerIpcHandlers registers dialog:open-directory, git:get-status, and git:get-staged-diff', async () => {
    const { registerIpcHandlers } = await import('../../src/main/index');
    registerIpcHandlers();

    expect(registeredHandlers.has('dialog:open-directory')).toBe(true);
    expect(registeredHandlers.has('git:get-status')).toBe(true);
    expect(registeredHandlers.has('git:get-staged-diff')).toBe(true);

    // Test dialog:open-directory handler
    mockDialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/workspace/test-repo'],
    });
    const openDirHandler = registeredHandlers.get('dialog:open-directory')!;
    const openResult = await openDirHandler();
    expect(openResult).toBe('/workspace/test-repo');

    // Test git:get-status handler
    const getStatusHandler = registeredHandlers.get('git:get-status')!;
    const emptyStatusResult = await getStatusHandler(null, '');
    expect(emptyStatusResult.success).toBe(false);
    expect(emptyStatusResult.error).toContain('Repository path must be a non-empty string');

    const stubStatusResult = await getStatusHandler(null, '/some/nonexistent/repo');
    expect(stubStatusResult.success).toBe(false);
    expect(stubStatusResult.error).toBeDefined();

    // Test git:get-staged-diff handler
    const getDiffHandler = registeredHandlers.get('git:get-staged-diff')!;
    const invalidDiffResult = await getDiffHandler(null, null);
    expect(invalidDiffResult.success).toBe(false);
    expect(invalidDiffResult.error).toContain('Invalid diff parameters');

    const emptyDiffResult = await getDiffHandler(null, { repoPath: '', filePath: '' });
    expect(emptyDiffResult.success).toBe(false);
    expect(emptyDiffResult.error).toContain('Invalid diff parameters');

    const whitespaceDiffResult = await getDiffHandler(null, { repoPath: '   ', filePath: '   ' });
    expect(whitespaceDiffResult.success).toBe(false);
    expect(whitespaceDiffResult.error).toContain('Invalid diff parameters');

    const invalidOldPathResult = await getDiffHandler(null, { repoPath: '/some/repo', filePath: 'index.ts', oldPath: '   ' });
    expect(invalidOldPathResult.success).toBe(false);
    expect(invalidOldPathResult.error).toContain('Invalid diff parameters');

    const nonStringOldPathResult = await getDiffHandler(null, { repoPath: '/some/repo', filePath: 'index.ts', oldPath: 12345 as any });
    expect(nonStringOldPathResult.success).toBe(false);
    expect(nonStringOldPathResult.error).toContain('Invalid diff parameters');

    const stubDiffResult = await getDiffHandler(null, { repoPath: '/some/nonexistent/repo', filePath: 'index.ts' });
    expect(stubDiffResult.success).toBe(false);
    expect(stubDiffResult.error).toBeDefined();

    const validOldPathStubResult = await getDiffHandler(null, { repoPath: '/some/nonexistent/repo', filePath: 'index.ts', oldPath: 'old.ts' });
    expect(validOldPathStubResult.success).toBe(false);
    expect(validOldPathStubResult.error).toBeDefined();
  });
});
