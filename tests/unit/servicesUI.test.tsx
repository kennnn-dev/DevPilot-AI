import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ServicesControlBoardModal from '../../src/renderer/components/ServicesControlBoard/ServicesControlBoardModal';
import type { WorkspaceService, ServiceLogEntry } from '../../src/shared/types';

describe('ServicesControlBoardModal UI', () => {
  const mockServices: WorkspaceService[] = [
    {
      id: 'laravel-wallet',
      name: 'wallet (Laravel)',
      command: 'php artisan serve',
      cwd: '/home/user/platform/wallet',
      type: 'laravel',
      status: 'running',
      detectedPort: 8000,
      detectedUrl: 'http://localhost:8000',
      pid: 12345,
    },
    {
      id: 'go-reporting',
      name: 'reporting-service (Go)',
      command: 'go run .',
      cwd: '/home/user/platform/reporting-service',
      type: 'go',
      status: 'stopped',
    },
  ];

  const mockLogs: ServiceLogEntry[] = [
    {
      id: 'log-1',
      serviceId: 'laravel-wallet',
      timestamp: Date.now(),
      type: 'stdout',
      text: 'Server running on [http://0.0.0.0:8000].',
    },
  ];

  it('renders modal when open with services and running counter', () => {
    render(
      <ServicesControlBoardModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceName="Platform"
        services={mockServices}
        filteredServices={mockServices}
        runningCount={1}
        logs={mockLogs}
        allLogs={mockLogs}
        activeLogServiceId={null}
        onSelectLogService={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        loading={false}
        actionLoadingId={null}
        error={null}
        onRescan={vi.fn()}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onClearLogs={vi.fn()}
        onOpenTerminal={vi.fn()}
      />
    );

    expect(screen.getByTestId('services-control-board-modal')).toBeInTheDocument();
    expect(screen.getByText('Universal Service Control Board')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByTestId('services-running-counter')).toHaveTextContent('1 Active · 2 Discovered');
    expect(screen.getByText('wallet (Laravel)')).toBeInTheDocument();
    expect(screen.getByText('reporting-service (Go)')).toBeInTheDocument();
    expect(screen.getByText('PORT 8000')).toBeInTheDocument();
  });

  it('triggers start, stop, restart, and terminal callbacks on button click', () => {
    const handleStart = vi.fn();
    const handleStop = vi.fn();
    const handleRestart = vi.fn();
    const handleTerminal = vi.fn();

    render(
      <ServicesControlBoardModal
        isOpen={true}
        onClose={vi.fn()}
        services={mockServices}
        filteredServices={mockServices}
        runningCount={1}
        logs={mockLogs}
        allLogs={mockLogs}
        activeLogServiceId={null}
        onSelectLogService={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        loading={false}
        actionLoadingId={null}
        error={null}
        onRescan={vi.fn()}
        onStartService={handleStart}
        onStopService={handleStop}
        onRestartService={handleRestart}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onClearLogs={vi.fn()}
        onOpenTerminal={handleTerminal}
      />
    );

    // Stop button on running service
    const stopBtn = screen.getByTestId('btn-stop-laravel-wallet');
    fireEvent.click(stopBtn);
    expect(handleStop).toHaveBeenCalledWith('laravel-wallet');

    // Start button on stopped service
    const startBtn = screen.getByTestId('btn-start-go-reporting');
    fireEvent.click(startBtn);
    expect(handleStart).toHaveBeenCalledWith('go-reporting');

    // Terminal button
    const terminalBtn = screen.getByTestId('btn-terminal-laravel-wallet');
    fireEvent.click(terminalBtn);
    expect(handleTerminal).toHaveBeenCalledWith(mockServices[0]);
  });

  it('allows dynamically editing the service port', () => {
    const handleUpdatePort = vi.fn();
    render(
      <ServicesControlBoardModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceName="Platform"
        services={mockServices}
        filteredServices={mockServices}
        runningCount={1}
        logs={mockLogs}
        allLogs={mockLogs}
        activeLogServiceId={null}
        onSelectLogService={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        loading={false}
        actionLoadingId={null}
        error={null}
        onRescan={vi.fn()}
        onUpdatePort={handleUpdatePort}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onClearLogs={vi.fn()}
        onOpenTerminal={vi.fn()}
      />
    );

    const editPortBtn = screen.getByTestId('btn-edit-port-laravel-wallet');
    fireEvent.click(editPortBtn);

    const portInput = screen.getByRole('spinbutton');
    expect(portInput).toBeInTheDocument();
    fireEvent.change(portInput, { target: { value: '8080' } });
    fireEvent.keyDown(portInput, { key: 'Enter', code: 'Enter' });

    expect(handleUpdatePort).toHaveBeenCalledWith('laravel-wallet', '8080');
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ServicesControlBoardModal
        isOpen={false}
        onClose={vi.fn()}
        services={mockServices}
        filteredServices={mockServices}
        runningCount={0}
        logs={[]}
        allLogs={[]}
        activeLogServiceId={null}
        onSelectLogService={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        loading={false}
        actionLoadingId={null}
        error={null}
        onRescan={vi.fn()}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onClearLogs={vi.fn()}
        onOpenTerminal={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
