import { app, BrowserWindow, shell, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerDialogHandlers } from './ipc/dialogHandlers';
import { registerGitHandlers } from './ipc/gitHandlers';
import { stopWatchingRepo } from './git/repoWatcher';

// Resolve current directory reliably in both CJS and ESM environments
const currentDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

// Suppress harmless Linux Chromium GPU VSync warnings in terminal
if (app?.commandLine?.appendSwitch) {
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

let mainWindow: BrowserWindow | null = null;

/**
 * Resolves the absolute path to the preload bundle.
 * Handles different build outputs and dev vs production environments.
 */
export function resolvePreloadPath(): string {
  const candidates = [
    path.join(currentDir, '../preload/index.js'),
    path.join(currentDir, '../preload/index.mjs'),
    path.join(currentDir, 'preload.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to standard vite-plugin-electron output
  return path.join(currentDir, '../preload/index.js');
}

/**
 * Resolves the application window icon if available.
 */
export function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(currentDir, '../../build/icon.png'),
    path.join(currentDir, '../renderer/assets/logo.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(currentDir, 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Generates BrowserWindow options with strict security hardening:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: true
 * - webSecurity: true
 * - allowRunningInsecureContent: false
 */
export function getWindowSecurityOptions(preloadPath: string): Electron.BrowserWindowConstructorOptions {
  const iconPath = resolveAppIconPath();
  return {
    title: 'DevPilot AI',
    ...(iconPath ? { icon: iconPath } : {}),
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false, // Prevent white flash before content is loaded
    backgroundColor: '#0f172a', // Sleek dark slate background
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    },
  };
}

/**
 * Validates whether a navigation or redirect target URL is permitted.
 * - In development: strictly permits only URLs matching the Vite dev server origin.
 * - In production: blocks all top-level navigations/redirects (DevPilot AI is an SPA).
 */
export function isAllowedNavigation(targetUrl: string): boolean {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!devServerUrl) {
    return false;
  }

  try {
    const targetOrigin = new URL(targetUrl).origin;
    const devOrigin = new URL(devServerUrl).origin;
    return targetOrigin === devOrigin;
  } catch {
    return false;
  }
}

/**
 * Configures security guards on WebContents:
 * - Blocks unapproved in-app navigation
 * - Blocks new window creation (popups / target="_blank")
 * - Opens approved external HTTP(S) links in OS default browser
 * - Blocks <webview> tag attachments
 */
export function configureWebContentsSecurity(contents: Electron.WebContents): void {
  // Navigation blocking
  contents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl)) {
      event.preventDefault();
      console.warn(`[Security] Blocked unauthorized navigation attempt to: ${navigationUrl}`);
    }
  });

  // Redirect blocking
  contents.on('will-redirect', (event, redirectUrl) => {
    if (!isAllowedNavigation(redirectUrl)) {
      event.preventDefault();
      console.warn(`[Security] Blocked unauthorized redirect attempt to: ${redirectUrl}`);
    }
  });

  // New-window opening blocking (popups, window.open, target="_blank")
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch((err) => {
        console.error('[DevPilot] Failed to open external URL:', err);
      });
    } else {
      console.warn(`[Security] Blocked opening non-http external URL: ${url}`);
    }
    return { action: 'deny' };
  });

  // Prevent webview tag injection
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[Security] Blocked attempt to attach webview');
  });
}

/**
 * Configures session-level security (CSP headers, permission handler)
 */
export function configureSessionSecurity(sess: Electron.Session): void {
  // Deny all permission requests (camera, microphone, geolocation, notifications)
  sess.setPermissionRequestHandler((_webContents, permission, callback) => {
    console.warn(`[Security] Denied permission request: ${permission}`);
    callback(false);
  });

  // Apply Content Security Policy via HTTP response headers
  sess.webRequest.onHeadersReceived((details, callback) => {
    const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' data:; connect-src 'self' ws: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self';";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

/**
 * Registers safe read-only IPC handlers.
 * Connects native directory picker and full Milestone 2 Git operations.
 */
export function registerIpcHandlers(): void {
  registerDialogHandlers(() => mainWindow);
  registerGitHandlers();
}

/**
 * Loads the renderer content: Vite dev server or production index.html
 */
export function loadRenderer(win: BrowserWindow): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl).catch((err) => {
      console.error('[DevPilot] Failed to load dev server URL:', err);
    });
    // In dev mode, optionally open devtools
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(currentDir, '../renderer/index.html');
    win.loadFile(indexPath).catch((_err) => {
      // Fallback path if bundled in different relative structure
      const altPath = path.join(currentDir, '../../dist/index.html');
      win.loadFile(altPath).catch((innerErr) => {
        console.error('[DevPilot] Failed to load production index.html:', innerErr);
      });
    });
  }
}

/**
 * Creates the main application window with all security configurations
 */
export function createWindow(): BrowserWindow {
  const preloadPath = resolvePreloadPath();
  const options = getWindowSecurityOptions(preloadPath);

  mainWindow = new BrowserWindow(options);

  // Apply WebContents security guards
  configureWebContentsSecurity(mainWindow.webContents);

  // Gracefully show window once renderer has painted
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle window close
  mainWindow.on('closed', () => {
    stopWatchingRepo();
    mainWindow = null;
  });

  // Load the application
  loadRenderer(mainWindow);

  return mainWindow;
}

/**
 * Application Lifecycle & Single Instance Management
 */
export function bootstrap(): void {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.info('[DevPilot] Another instance is already running. Quitting.');
    app.quit();
    return;
  }

  // Restore focus if a second instance attempts to launch
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Session security
    configureSessionSecurity(session.defaultSession);

    // Register safe IPC handlers
    registerIpcHandlers();

    // Create main window
    createWindow();

    // macOS activate event
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  // Quit when all windows are closed on non-macOS platforms
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// Start application if running directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
