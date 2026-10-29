import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import type { WorkspaceService, ServiceLogEntry, ServiceType } from '../../../shared/types';

export type StatusChangeCallback = (service: WorkspaceService) => void;
export type LogCallback = (log: ServiceLogEntry) => void;

/**
 * Checks if a given directory is a generic OS system directory or user profile folder
 * (e.g. root /, home, Desktop, Downloads) that should never be scanned as a single project root.
 */
export function isGenericSystemDirectory(dirPath: string): boolean {
  try {
    const resolved = path.resolve(dirPath);
    const home = path.resolve(os.homedir());

    // Root directory, home directory, or filesystem roots
    if (resolved === '/' || resolved === home || path.dirname(resolved) === resolved) {
      return true;
    }

    // Direct parent of home directory (e.g. /home or /Users)
    if (resolved === path.dirname(home)) {
      return true;
    }

    // Common user top-level personal folders directly in home
    const genericNames = [
      'desktop',
      'downloads',
      'documents',
      'pictures',
      'videos',
      'music',
      'workspaces',
      'projects',
      'repos',
      'src',
      'dev',
      'code',
    ];

    const baseLower = path.basename(resolved).toLowerCase();
    if (path.dirname(resolved) === home && genericNames.includes(baseLower)) {
      return true;
    }

    // Well-known system directories
    const rootDirs = ['/var', '/tmp', '/opt', '/usr', '/etc', '/bin', '/sbin', '/mnt', '/media'];
    if (rootDirs.includes(resolved)) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export class ServiceManager {
  private static instance: ServiceManager;
  private services: Map<string, WorkspaceService> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private stoppingServices: Set<string> = new Set();
  private logs: Map<string, ServiceLogEntry[]> = new Map();
  private statusListeners: Set<StatusChangeCallback> = new Set();
  private logListeners: Set<LogCallback> = new Set();

  public static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  public onStatusChange(callback: StatusChangeCallback): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  public onLog(callback: LogCallback): () => void {
    this.logListeners.add(callback);
    return () => this.logListeners.delete(callback);
  }

  private notifyStatus(service: WorkspaceService): void {
    for (const listener of this.statusListeners) {
      try {
        listener({ ...service });
      } catch (err) {
        console.error('[ServiceManager] Error in status listener:', err);
      }
    }
  }

  private appendLog(serviceId: string, type: 'stdout' | 'stderr' | 'system', text: string): void {
    const entry: ServiceLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      serviceId,
      timestamp: Date.now(),
      type,
      text: text.replace(/\r\n/g, '\n'),
    };

    if (!this.logs.has(serviceId)) {
      this.logs.set(serviceId, []);
    }
    const serviceLogs = this.logs.get(serviceId)!;
    serviceLogs.push(entry);
    if (serviceLogs.length > 1000) {
      serviceLogs.shift();
    }

    for (const listener of this.logListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('[ServiceManager] Error in log listener:', err);
      }
    }
  }

  /**
   * Helper to inspect a single directory for services (Laravel, Go, Node, custom configs, scripts).
   */
  private inspectDirectoryForServices(
    dirPath: string,
    label: string,
    discovered: WorkspaceService[],
    depth: number = 0,
    maxDepth: number = 2
  ): void {
    if (!fs.existsSync(dirPath)) return;
    const cleanId = label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    // Check .env for port if present
    let envPort: number | undefined;
    const envPath = path.join(dirPath, '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const portMatch = envContent.match(/(?:^|\n)\s*(?:SERVER_PORT|APP_PORT|^PORT)\s*=\s*([0-9]{2,5})/m);
        if (portMatch) {
          envPort = parseInt(portMatch[1], 10);
        } else {
          const appUrlMatch = envContent.match(/APP_URL\s*=\s*https?:\/\/[^:\s]+:([0-9]{2,5})/i);
          if (appUrlMatch) {
            envPort = parseInt(appUrlMatch[1], 10);
          }
        }
      } catch {
        // Ignore .env read error
      }
    }

    let foundPrimaryService = false;

    // 1. Laravel check (has artisan)
    if (fs.existsSync(path.join(dirPath, 'artisan'))) {
      foundPrimaryService = true;
      const sId = `laravel-${cleanId}`;
      discovered.push({
        id: sId,
        name: `${label} (Laravel)`,
        command: envPort ? `php artisan serve --port=${envPort}` : 'php artisan serve',
        cwd: dirPath,
        type: 'laravel',
        status: this.services.get(sId)?.status || 'stopped',
        detectedPort: envPort,
        detectedUrl: envPort ? `http://localhost:${envPort}` : undefined,
        pid: this.services.get(sId)?.pid,
      });
    }

    // 2. Go check (has go.mod or main.go)
    if (fs.existsSync(path.join(dirPath, 'go.mod')) || fs.existsSync(path.join(dirPath, 'main.go'))) {
      foundPrimaryService = true;
      const sId = `go-${cleanId}`;
      discovered.push({
        id: sId,
        name: `${label} (Go)`,
        command: 'go run .',
        cwd: dirPath,
        type: 'go',
        status: this.services.get(sId)?.status || 'stopped',
        detectedPort: envPort,
        pid: this.services.get(sId)?.pid,
      });
    }

    // 3. Node / Frontend check (has package.json) - Only if not a Laravel backend
    const pkgPath = path.join(dirPath, 'package.json');
    if (!foundPrimaryService && fs.existsSync(pkgPath)) {
      try {
        const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgRaw);
        const scripts = pkg.scripts || {};
        let scriptCmd: string | null = null;

        if (scripts.dev) {
          scriptCmd = 'npm run dev';
        } else if (scripts.start) {
          scriptCmd = 'npm start';
        } else if (scripts.serve) {
          scriptCmd = 'npm run serve';
        }

        if (scriptCmd) {
          foundPrimaryService = true;
          const sId = `node-${cleanId}`;
          discovered.push({
            id: sId,
            name: `${label} (${pkg.name || 'Node'})`,
            command: scriptCmd,
            cwd: dirPath,
            type: 'node',
            status: this.services.get(sId)?.status || 'stopped',
            detectedPort: envPort,
            pid: this.services.get(sId)?.pid,
          });
        }
      } catch {
        // Ignore package read error
      }
    }

    // 4. Custom service configs in this folder
    const customConfigPaths = [
      path.join(dirPath, '.devpilot-services.json'),
      path.join(dirPath, '.devpilot', 'services.json'),
    ];
    for (const configPath of customConfigPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item.name && item.command) {
                const sId = item.id || `custom-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                discovered.push({
                  id: sId,
                  name: item.name,
                  command: item.command,
                  args: item.args || [],
                  cwd: item.cwd ? path.resolve(dirPath, item.cwd) : dirPath,
                  type: (item.type as ServiceType) || 'custom',
                  status: this.services.get(sId)?.status || 'stopped',
                  detectedPort: item.port,
                  detectedUrl: item.url,
                  pid: this.services.get(sId)?.pid,
                });
              }
            }
          }
        } catch (err) {
          console.warn('[ServiceManager] Failed to parse custom services config:', err);
        }
      }
    }

    // 5. Runner shell scripts in this folder
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isFile() &&
          (entry.name.startsWith('run-') || entry.name.startsWith('start-') || entry.name.endsWith('.sh')) &&
          !entry.name.startsWith('.')
        ) {
          const sId = depth === 0
            ? `script-${entry.name.replace(/[^a-zA-Z0-9]/g, '-')}`
            : `script-${cleanId}-${entry.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
          discovered.push({
            id: sId,
            name: depth === 0 ? entry.name : `${label}/${entry.name}`,
            command: `bash ./${entry.name}`,
            cwd: dirPath,
            type: 'shell',
            status: this.services.get(sId)?.status || 'stopped',
            pid: this.services.get(sId)?.pid,
          });
        }
      }
    } catch {
      // Ignore read error
    }

    // 6. Subdirectory scanning (up to maxDepth)
    // If this folder is already identified as a leaf microservice / app (e.g. Laravel or Node),
    // do not drill down into internal source directories (app, tests, node_modules).
    if (depth < maxDepth && !foundPrimaryService) {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (
            entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === 'vendor' ||
            entry.name === 'pipeline' ||
            entry.name === 'pipelines' ||
            entry.name === 'storage' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'public' ||
            entry.name === 'database' ||
            entry.name === 'config' ||
            entry.name === 'tests' ||
            entry.name === 'routes' ||
            entry.name === 'resources'
          ) {
            continue;
          }

          const subDir = path.join(dirPath, entry.name);
          const subLabel = label ? (depth === 0 ? entry.name : `${label}/${entry.name}`) : entry.name;
          this.inspectDirectoryForServices(subDir, subLabel, discovered, depth + 1, maxDepth);
        }
      } catch {
        // Ignore read error
      }
    }
  }

  /**
   * Discovers runnable services across target directory path(s).
   * Supports a single directory string or an array of explicit repository paths.
   */
  public async discoverServices(target: string | string[]): Promise<WorkspaceService[]> {
    const rawPaths = (Array.isArray(target) ? target : [target]).filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0
    );

    if (rawPaths.length === 0) {
      return Array.from(this.services.values());
    }

    const resolvedPaths = rawPaths.map((p) => path.resolve(p.trim())).filter((p) => fs.existsSync(p));
    if (resolvedPaths.length === 0) {
      return Array.from(this.services.values());
    }

    const discovered: WorkspaceService[] = [];

    // Case 1: Multiple explicit repository paths (e.g. active workspace repositories)
    if (resolvedPaths.length > 1) {
      for (const repoPath of resolvedPaths) {
        const repoName = path.basename(repoPath);
        this.inspectDirectoryForServices(repoPath, repoName, discovered, 0, 1);
      }

      // Check if all repos share a direct dedicated parent directory (NOT a generic system folder like Desktop or Home)
      const parentDir = path.dirname(resolvedPaths[0]);
      const allShareParent = resolvedPaths.every((p) => path.dirname(p) === parentDir);
      if (allShareParent && !isGenericSystemDirectory(parentDir) && fs.existsSync(parentDir)) {
        try {
          const parentEntries = fs.readdirSync(parentDir, { withFileTypes: true });
          for (const entry of parentEntries) {
            if (
              entry.isFile() &&
              (entry.name.startsWith('run-') || entry.name.startsWith('start-') || entry.name.endsWith('.sh')) &&
              !entry.name.startsWith('.')
            ) {
              const sId = `script-root-${entry.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
              if (!discovered.some((d) => d.id === sId)) {
                discovered.unshift({
                  id: sId,
                  name: entry.name,
                  command: `bash ./${entry.name}`,
                  cwd: parentDir,
                  type: 'shell',
                  status: this.services.get(sId)?.status || 'stopped',
                  pid: this.services.get(sId)?.pid,
                });
              }
            }
          }
        } catch {
          // Ignore parent read error
        }
      }
    } else {
      // Case 2: Single path passed (e.g. a single repo or a user-selected folder)
      const singlePath = resolvedPaths[0];
      const baseLabel = path.basename(singlePath);
      this.inspectDirectoryForServices(singlePath, baseLabel, discovered, 0, 2);
    }

    // Deduplicate by ID
    const uniqueDiscovered: WorkspaceService[] = [];
    const seenIds = new Set<string>();
    for (const item of discovered) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueDiscovered.push(item);
      }
    }

    // Replace discovered services map for this workspace, keeping running status if any match
    const newServicesMap = new Map<string, WorkspaceService>();
    for (const service of uniqueDiscovered) {
      const existing = this.services.get(service.id);
      if (existing) {
        newServicesMap.set(service.id, {
          ...service,
          status: existing.status,
          pid: existing.pid,
          detectedPort: existing.detectedPort || service.detectedPort,
          detectedUrl: existing.detectedUrl || service.detectedUrl,
          startedAt: existing.startedAt,
        });
      } else {
        newServicesMap.set(service.id, service);
      }
    }

    this.services = newServicesMap;
    return Array.from(this.services.values());
  }

  public getServices(): WorkspaceService[] {
    return Array.from(this.services.values());
  }

  public getService(serviceId: string): WorkspaceService | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Starts a service by ID.
   */
  public async startService(serviceId: string): Promise<WorkspaceService> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    if (service.status === 'running' || service.status === 'starting') {
      return service;
    }

    service.status = 'starting';
    service.startedAt = Date.now();
    service.error = undefined;
    this.stoppingServices.delete(serviceId);
    this.notifyStatus(service);
    this.appendLog(serviceId, 'system', `[DevPilot] Starting ${service.name} ($ ${service.command}) in ${service.cwd}...`);

    try {
      const child = spawn(service.command, service.args || [], {
        cwd: service.cwd,
        shell: true,
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          FORCE_COLOR: '1',
        },
      });

      this.processes.set(serviceId, child);
      service.pid = child.pid;

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.appendLog(serviceId, 'stdout', text);
        this.detectPortAndUrl(service, text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.appendLog(serviceId, 'stderr', text);
        this.detectPortAndUrl(service, text);
      });

      child.on('error', (err) => {
        service.status = 'crashed';
        service.error = err.message;
        this.appendLog(serviceId, 'system', `[DevPilot Error] Process failed: ${err.message}`);
        this.processes.delete(serviceId);
        this.notifyStatus(service);
      });

      child.on('exit', (code, signal) => {
        const wasIntentionalStop = this.stoppingServices.has(serviceId);
        this.stoppingServices.delete(serviceId);
        this.processes.delete(serviceId);
        service.pid = undefined;
        service.exitCode = code;

        if (wasIntentionalStop || code === 0 || signal === 'SIGTERM') {
          service.status = 'stopped';
          this.appendLog(serviceId, 'system', `[DevPilot] Service stopped cleanly (exit code: ${code ?? 0}).`);
        } else {
          service.status = 'crashed';
          service.error = `Exited with code ${code} (${signal || 'abnormal exit'})`;
          this.appendLog(serviceId, 'system', `[DevPilot] Process crashed with exit code ${code}.`);
        }
        this.notifyStatus(service);
      });

      // If after 1.5 seconds it is still starting and alive, mark running
      setTimeout(() => {
        const current = this.services.get(serviceId);
        if (current && current.status === 'starting' && this.processes.has(serviceId)) {
          current.status = 'running';
          this.notifyStatus(current);
        }
      }, 1500);

      this.notifyStatus(service);
      return service;
    } catch (err) {
      service.status = 'crashed';
      service.error = err instanceof Error ? err.message : String(err);
      this.notifyStatus(service);
      throw err;
    }
  }

  /**
   * Scans stdout/stderr chunks to detect live URLs and server listening ports.
   */
  private detectPortAndUrl(service: WorkspaceService, text: string): void {
    let portMatched = false;

    // Pattern 1: Explicit HTTP(S) URLs: e.g. http://0.0.0.0:8000, http://172.30.20.121:3001, http://localhost:8080
    const urlMatch = text.match(/https?:\/\/(?:0\.0\.0\.0|localhost|127\.0\.0\.1|[0-9a-zA-Z.-]+):([0-9]{2,5})/i);
    if (urlMatch) {
      service.detectedPort = parseInt(urlMatch[1], 10);
      service.detectedUrl = urlMatch[0].replace('0.0.0.0', 'localhost');
      portMatched = true;
    }

    // Pattern 2: Gin debug: Listening and serving HTTP on :8082
    if (!portMatched) {
      const ginMatch = text.match(/Listening and serving HTTP on :([0-9]{2,5})/i);
      if (ginMatch) {
        service.detectedPort = parseInt(ginMatch[1], 10);
        service.detectedUrl = `http://localhost:${ginMatch[1]}`;
        portMatched = true;
      }
    }

    // Pattern 3: Port indicator: e.g. port 8000, :8000
    if (!portMatched) {
      const portOnlyMatch = text.match(/(?:listening on|serving on|port)\s*:?\s*([0-9]{4,5})/i);
      if (portOnlyMatch) {
        service.detectedPort = parseInt(portOnlyMatch[1], 10);
        service.detectedUrl = `http://localhost:${portOnlyMatch[1]}`;
        portMatched = true;
      }
    }

    if (portMatched && service.status === 'starting') {
      service.status = 'running';
      this.notifyStatus(service);
    }
  }

  /**
   * Stops a running service by ID.
   */
  public async stopService(serviceId: string): Promise<WorkspaceService> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    const child = this.processes.get(serviceId);
    if (!child || !child.pid) {
      service.status = 'stopped';
      service.pid = undefined;
      this.notifyStatus(service);
      return service;
    }

    this.stoppingServices.add(serviceId);
    this.appendLog(serviceId, 'system', `[DevPilot] Stopping service ${service.name} (PID: ${child.pid})...`);

    const pid = child.pid;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
      } else {
        // Kill the whole process group
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          process.kill(pid, 'SIGTERM');
        }
      }
    } catch (err) {
      console.warn(`[ServiceManager] Error terminating process ${pid}:`, err);
    }

    // Give it a grace period then SIGKILL if still present
    setTimeout(() => {
      if (this.processes.has(serviceId)) {
        try {
          if (process.platform !== 'win32') {
            try {
              process.kill(-pid, 'SIGKILL');
            } catch {
              process.kill(pid, 'SIGKILL');
            }
          }
        } catch {
          // Already dead
        }
      }
    }, 2500);

    service.status = 'stopped';
    service.pid = undefined;
    this.notifyStatus(service);
    return service;
  }

  /**
   * Restarts a service by stopping it and starting it again.
   */
  public async restartService(serviceId: string): Promise<WorkspaceService> {
    await this.stopService(serviceId);
    // Allow brief settle for port release
    await new Promise((resolve) => setTimeout(resolve, 300));
    return await this.startService(serviceId);
  }

  /**
   * Starts all registered services.
   */
  public async startAll(): Promise<WorkspaceService[]> {
    const list = Array.from(this.services.values());
    await Promise.all(
      list.map(async (svc) => {
        try {
          if (svc.status !== 'running') {
            await this.startService(svc.id);
          }
        } catch (err) {
          console.error(`[ServiceManager] Failed to start ${svc.name}:`, err);
        }
      })
    );
    return this.getServices();
  }

  /**
   * Gracefully stops all active services.
   */
  public async stopAll(): Promise<WorkspaceService[]> {
    const runningList = Array.from(this.services.values()).filter(
      (s) => s.status === 'running' || s.status === 'starting'
    );
    await Promise.all(
      runningList.map(async (svc) => {
        try {
          await this.stopService(svc.id);
        } catch (err) {
          console.error(`[ServiceManager] Failed to stop ${svc.name}:`, err);
        }
      })
    );
    return this.getServices();
  }

  /**
   * Gets buffered output logs for a service or all services.
   */
  public getLogs(serviceId?: string): ServiceLogEntry[] {
    if (serviceId) {
      return [...(this.logs.get(serviceId) || [])];
    }
    // Return merged and sorted logs across all services
    const allLogs: ServiceLogEntry[] = [];
    for (const list of this.logs.values()) {
      allLogs.push(...list);
    }
    return allLogs.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clears buffered logs for a service or all services.
   */
  public clearLogs(serviceId?: string): boolean {
    if (serviceId) {
      this.logs.set(serviceId, []);
    } else {
      this.logs.clear();
    }
    return true;
  }

  /**
   * Registers a manual custom service (e.g. added by the user in UI).
   */
  public addCustomService(service: Omit<WorkspaceService, 'status'>): WorkspaceService {
    const fullService: WorkspaceService = {
      ...service,
      status: 'stopped',
    };
    this.services.set(fullService.id, fullService);
    this.notifyStatus(fullService);
    return fullService;
  }

  /**
   * Dynamically updates the runtime port or command configuration for a service.
   */
  public updateServiceConfig(
    serviceId: string,
    updates: { port?: number | string; command?: string }
  ): WorkspaceService {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    if (updates.port !== undefined && updates.port !== null && String(updates.port).trim()) {
      const numPort = typeof updates.port === 'string' ? parseInt(updates.port, 10) : updates.port;
      if (!isNaN(numPort)) {
        service.detectedPort = numPort;
        service.detectedUrl = `http://localhost:${numPort}`;

        // Dynamically adjust command if it includes a port flag or env prefix
        if (service.type === 'laravel') {
          service.command = `php artisan serve --port=${numPort}`;
        } else if (service.type === 'node') {
          const stripped = service.command.replace(/^PORT=\d+\s*/i, '').trim();
          service.command = `PORT=${numPort} ${stripped}`;
        }
      }
    }

    if (updates.command !== undefined && updates.command.trim()) {
      service.command = updates.command.trim();
    }

    this.notifyStatus(service);
    return service;
  }
}

export const serviceManager = ServiceManager.getInstance();
