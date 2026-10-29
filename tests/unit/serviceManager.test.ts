import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServiceManager } from '../../src/main/services/services/serviceManager';

describe('ServiceManager', () => {
  let tmpDir: string;
  let manager: ServiceManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devpilot-service-test-'));
    manager = new ServiceManager();
  });

  afterEach(async () => {
    try {
      await manager.stopAll();
    } catch {
      // Ignore
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('discoverServices', () => {
    it('discovers shell scripts in root workspace', async () => {
      const scriptPath = path.join(tmpDir, 'run-platform.sh');
      fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\necho "platform started"', { mode: 0o755 });

      const services = await manager.discoverServices(tmpDir);
      const scriptSvc = services.find((s) => s.name === 'run-platform.sh');
      expect(scriptSvc).toBeDefined();
      expect(scriptSvc?.type).toBe('shell');
      expect(scriptSvc?.command).toBe('bash ./run-platform.sh');
    });

    it('discovers Laravel service in subdirectory with artisan', async () => {
      const backendDir = path.join(tmpDir, 'wallet');
      fs.mkdirSync(backendDir, { recursive: true });
      fs.writeFileSync(path.join(backendDir, 'artisan'), '#!/usr/bin/env php\n<?php');

      const services = await manager.discoverServices(tmpDir);
      const laravelSvc = services.find((s) => s.id === 'laravel-wallet');
      expect(laravelSvc).toBeDefined();
      expect(laravelSvc?.type).toBe('laravel');
      expect(laravelSvc?.command).toBe('php artisan serve');
    });

    it('discovers Go service in subdirectory with go.mod', async () => {
      const goDir = path.join(tmpDir, 'reporting-service');
      fs.mkdirSync(goDir, { recursive: true });
      fs.writeFileSync(path.join(goDir, 'go.mod'), 'module reporting\ngo 1.22');

      const services = await manager.discoverServices(tmpDir);
      const goSvc = services.find((s) => s.id === 'go-reporting-service');
      expect(goSvc).toBeDefined();
      expect(goSvc?.type).toBe('go');
      expect(goSvc?.command).toBe('go run .');
    });

    it('discovers Node frontend service in subdirectory with package.json', async () => {
      const frontDir = path.join(tmpDir, 'player');
      fs.mkdirSync(frontDir, { recursive: true });
      fs.writeFileSync(
        path.join(frontDir, 'package.json'),
        JSON.stringify({
          name: 'player-ui',
          scripts: {
            dev: 'vite',
          },
        })
      );

      const services = await manager.discoverServices(tmpDir);
      const nodeSvc = services.find((s) => s.id === 'node-player');
      expect(nodeSvc).toBeDefined();
      expect(nodeSvc?.type).toBe('node');
      expect(nodeSvc?.command).toBe('npm run dev');
    });

    it('parses custom services from .devpilot-services.json', async () => {
      const configPath = path.join(tmpDir, '.devpilot-services.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify([
          {
            name: 'Custom Queue Worker',
            command: 'php artisan queue:work',
            port: 9000,
            type: 'laravel',
          },
        ])
      );

      const services = await manager.discoverServices(tmpDir);
      const customSvc = services.find((s) => s.name === 'Custom Queue Worker');
      expect(customSvc).toBeDefined();
      expect(customSvc?.command).toBe('php artisan queue:work');
      expect(customSvc?.detectedPort).toBe(9000);
    });

    it('discovers services across multiple explicit repository paths without leaking sibling folders', async () => {
      // Simulate Desktop layout with 2 workspace repos and 1 unrelated repo
      const repoA = path.join(tmpDir, 'bingo-backoffice');
      const repoB = path.join(tmpDir, 'bingo-listener');
      const unrelatedRepo = path.join(tmpDir, 'DevPilot');

      fs.mkdirSync(repoA, { recursive: true });
      fs.mkdirSync(repoB, { recursive: true });
      fs.mkdirSync(unrelatedRepo, { recursive: true });

      fs.writeFileSync(path.join(repoA, 'artisan'), '#!/usr/bin/env php');
      fs.writeFileSync(path.join(repoA, '.env'), 'APP_URL=http://127.0.0.1:8010\n');

      fs.writeFileSync(path.join(repoB, 'artisan'), '#!/usr/bin/env php');
      fs.writeFileSync(path.join(repoB, '.env'), 'APP_URL=http://127.0.0.1:8000\n');

      fs.writeFileSync(
        path.join(unrelatedRepo, 'package.json'),
        JSON.stringify({ name: 'devpilot', scripts: { dev: 'vite' } })
      );

      // Only pass repoA and repoB (as in Live Bingo workspace)
      const services = await manager.discoverServices([repoA, repoB]);

      // Must discover exactly repoA and repoB, NOT unrelatedRepo!
      expect(services.length).toBe(2);
      expect(services.find((s) => s.name.includes('bingo-backoffice'))).toBeDefined();
      expect(services.find((s) => s.name.includes('bingo-listener'))).toBeDefined();
      expect(services.find((s) => s.name.includes('DevPilot') || s.name.includes('devpilot'))).toBeUndefined();
    });

    it('discovers a root Node service when the repository root itself contains package.json', async () => {
      const nodeRepo = path.join(tmpDir, 'devpilot-studio');
      fs.mkdirSync(nodeRepo, { recursive: true });
      fs.writeFileSync(
        path.join(nodeRepo, 'package.json'),
        JSON.stringify({ name: 'devpilot-studio', scripts: { dev: 'electron .' } })
      );

      const services = await manager.discoverServices(nodeRepo);
      expect(services.length).toBe(1);
      expect(services[0].name).toBe('devpilot-studio (devpilot-studio)');
      expect(services[0].command).toBe('npm run dev');
    });
  });

  describe('service execution and logs', () => {
    it('starts a simple service, emits logs, and stops it cleanly', async () => {
      const statusChanges: string[] = [];
      manager.onStatusChange((svc) => {
        statusChanges.push(svc.status);
      });

      const customSvc = manager.addCustomService({
        id: 'test-echo-svc',
        name: 'Echo Service',
        command: 'echo "Server running on http://127.0.0.1:8080" && sleep 5',
        cwd: tmpDir,
        type: 'shell',
      });

      expect(customSvc.status).toBe('stopped');

      const started = await manager.startService('test-echo-svc');
      expect(['starting', 'running']).toContain(started.status);

      // Wait a moment for output to be captured
      await new Promise((resolve) => setTimeout(resolve, 300));

      const logs = manager.getLogs('test-echo-svc');
      expect(logs.length).toBeGreaterThan(0);

      // Check port auto-detection
      const updatedSvc = manager.getService('test-echo-svc');
      expect(updatedSvc?.detectedPort).toBe(8080);
      expect(updatedSvc?.detectedUrl).toContain(':8080');

      // Stop service
      const stopped = await manager.stopService('test-echo-svc');
      expect(stopped.status).toBe('stopped');
      expect(manager.getService('test-echo-svc')?.pid).toBeUndefined();

      // Clear logs
      manager.clearLogs('test-echo-svc');
      expect(manager.getLogs('test-echo-svc').length).toBe(0);
    });

    it('throws error when attempting to start nonexistent service', async () => {
      await expect(manager.startService('non-existent')).rejects.toThrow('Service not found');
    });
  });
});
