import React, { useRef, useEffect, useState } from 'react';
import {
  Server,
  Play,
  Square,
  RotateCw,
  Terminal,
  ExternalLink,
  Search,
  Trash2,
  Copy,
  Check,
  X,
  RefreshCw,
  Cpu,
  Layers,
  Code2,
  AlertTriangle,
  Folder,
  Edit2,
} from 'lucide-react';
import type { WorkspaceService, ServiceLogEntry, ServiceType } from '../../../shared/types';

export interface ServicesControlBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName?: string;
  scannedPath?: string | null;
  services: WorkspaceService[];
  filteredServices: WorkspaceService[];
  runningCount: number;
  logs: ServiceLogEntry[];
  allLogs: ServiceLogEntry[];
  activeLogServiceId: string | null;
  onSelectLogService: (serviceId: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading: boolean;
  actionLoadingId: string | null;
  error: string | null;
  onRescan: () => void;
  onSelectFolder?: () => void;
  onUpdatePort?: (serviceId: string, newPort: number | string) => void;
  onStartService: (serviceId: string) => void;
  onStopService: (serviceId: string) => void;
  onRestartService: (serviceId: string) => void;
  onStartAll: () => void;
  onStopAll: () => void;
  onClearLogs: (serviceId?: string) => void;
  onOpenTerminal: (service: WorkspaceService) => void;
}

export const ServicesControlBoardModal: React.FC<ServicesControlBoardModalProps> = ({
  isOpen,
  onClose,
  workspaceName,
  scannedPath,
  services,
  filteredServices,
  runningCount,
  logs,
  allLogs,
  activeLogServiceId,
  onSelectLogService,
  searchQuery,
  onSearchChange,
  loading,
  actionLoadingId,
  error,
  onRescan,
  onSelectFolder,
  onUpdatePort,
  onStartService,
  onStopService,
  onRestartService,
  onStartAll,
  onStopAll,
  onClearLogs,
  onOpenTerminal,
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [editingPortServiceId, setEditingPortServiceId] = useState<string | null>(null);
  const [editingPortValue, setEditingPortValue] = useState<string>('');

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const getServiceTypeBadge = (type: ServiceType) => {
    switch (type) {
      case 'laravel':
        return <span className="service-type-badge type-laravel">Laravel</span>;
      case 'go':
        return <span className="service-type-badge type-go">Go Gin</span>;
      case 'node':
        return <span className="service-type-badge type-node">Node/React</span>;
      case 'shell':
        return <span className="service-type-badge type-shell">Shell Script</span>;
      case 'docker':
        return <span className="service-type-badge type-docker">Docker</span>;
      default:
        return <span className="service-type-badge type-custom">Custom</span>;
    }
  };

  return (
    <div
      className="modal-overlay services-modal-overlay"
      data-testid="services-control-board-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="services-modal-container">
        {/* Modal Header */}
        <header className="services-modal-header">
          <div className="services-header-left">
            <div className="services-header-icon-box">
              <Server size={20} className="text-cyan" />
            </div>
            <div>
              <div className="services-header-title-row">
                <h2 className="services-modal-title">Universal Service Control Board</h2>
                {workspaceName && (
                  <span className="services-workspace-pill" title={`Active Workspace: ${workspaceName}`}>
                    <Folder size={11} />
                    <span>{workspaceName}</span>
                  </span>
                )}
                <span className="services-count-pill" data-testid="services-running-counter">
                  {runningCount} Active · {services.length} Discovered
                </span>
              </div>
              <p className="services-modal-subtitle">
                Inspect, run, and stream multi-service microservices, backend APIs, and scripts
              </p>
            </div>
          </div>

          <div className="services-header-actions">
            {onSelectFolder && (
              <button
                type="button"
                className="btn-services-action"
                onClick={onSelectFolder}
                title="Select a directory or workspace folder to scan"
                data-testid="btn-select-services-folder"
              >
                <Folder size={13} />
                <span>Select Folder</span>
              </button>
            )}

            <button
              type="button"
              className="btn-services-action"
              onClick={onRescan}
              disabled={loading}
              title="Rescan workspace for services"
              data-testid="btn-rescan-services"
            >
              <RefreshCw size={13} className={loading ? 'spinning' : ''} />
              <span>Rescan</span>
            </button>

            <button
              type="button"
              className="btn-services-action btn-start-all"
              onClick={onStartAll}
              disabled={loading || services.length === 0}
              title="Start all discovered services"
              data-testid="btn-start-all-services"
            >
              <Play size={13} fill="currentColor" />
              <span>Start All</span>
            </button>

            <button
              type="button"
              className="btn-services-action btn-stop-all"
              onClick={onStopAll}
              disabled={loading || runningCount === 0}
              title="Stop all active services"
              data-testid="btn-stop-all-services"
            >
              <Square size={13} fill="currentColor" />
              <span>Stop All</span>
            </button>

            <button
              type="button"
              className="btn-services-close"
              onClick={onClose}
              title="Close Service Control Board"
              data-testid="btn-close-services-modal"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="services-error-banner" data-testid="services-error-banner">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="services-filter-toolbar">
          <div className="services-search-box">
            <Search size={14} className="services-search-icon" />
            <input
              type="text"
              placeholder="Filter services by name, port, or command..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="services-search-input"
              data-testid="services-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="services-search-clear"
                onClick={() => onSearchChange('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Main Content: Split Grid + Log Terminal */}
        <div className="services-modal-body">
          {/* Top Section: Service Cards Grid */}
          <div className="services-cards-grid" data-testid="services-cards-grid">
            {filteredServices.length === 0 ? (
              <div className="services-empty-state">
                <Cpu size={36} className="text-muted" />
                <p className="services-empty-title">No runnable services discovered</p>
                <span className="services-empty-path">
                  {scannedPath ? `Scanned folder: ${scannedPath}` : 'No workspace folder selected'}
                </span>
                <span className="services-empty-hint">
                  DevPilot automatically scans for Laravel artisan apps, Go Gin microservices, React/Node apps, and runner scripts (*.sh like run-platform.sh).
                </span>
                {onSelectFolder && (
                  <button
                    type="button"
                    className="btn-select-folder-primary"
                    onClick={onSelectFolder}
                    data-testid="btn-empty-select-folder"
                  >
                    <Folder size={14} />
                    <span>Choose Workspace Directory to Scan...</span>
                  </button>
                )}
              </div>
            ) : (
              filteredServices.map((svc) => {
                const isRunning = svc.status === 'running';
                const isStarting = svc.status === 'starting';
                const isCrashed = svc.status === 'crashed';
                const isActionLoading = actionLoadingId === svc.id;

                return (
                  <div
                    key={svc.id}
                    className={`service-card ${svc.status}`}
                    data-testid={`service-card-${svc.id}`}
                  >
                    <div className="service-card-header">
                      <div className="service-card-title-box">
                        <div className="service-card-title-row">
                          <span className="service-card-name" title={svc.name}>
                            {svc.name}
                          </span>
                          {getServiceTypeBadge(svc.type)}
                        </div>
                        <span className="service-card-cmd" title={svc.command}>
                          <Code2 size={11} /> {svc.command}
                        </span>
                      </div>

                      <div className="service-card-status">
                        <span
                          className={`service-status-dot dot-${svc.status} ${isRunning ? 'pulse' : ''}`}
                          title={`Status: ${svc.status}`}
                        />
                        <span className="service-status-text">
                          {isStarting ? 'Starting...' : isRunning ? `Running (PID ${svc.pid})` : isCrashed ? 'Crashed' : 'Stopped'}
                        </span>
                      </div>
                    </div>

                    <div className="service-card-meta">
                      {editingPortServiceId === svc.id ? (
                        <div className="service-port-edit-box">
                          <span className="port-edit-label">PORT:</span>
                          <input
                            type="number"
                            className="port-edit-input"
                            value={editingPortValue}
                            onChange={(e) => setEditingPortValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (onUpdatePort && editingPortValue) {
                                  onUpdatePort(svc.id, editingPortValue);
                                }
                                setEditingPortServiceId(null);
                              } else if (e.key === 'Escape') {
                                setEditingPortServiceId(null);
                              }
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn-port-confirm"
                            onClick={() => {
                              if (onUpdatePort && editingPortValue) {
                                onUpdatePort(svc.id, editingPortValue);
                              }
                              setEditingPortServiceId(null);
                            }}
                            title="Save Port"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            type="button"
                            className="btn-port-cancel"
                            onClick={() => setEditingPortServiceId(null)}
                            title="Cancel"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <div className="service-port-row">
                          {svc.detectedUrl ? (
                            <a
                              href={svc.detectedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="service-port-link"
                              title="Open in Browser"
                            >
                              <span className="port-badge">PORT {svc.detectedPort || 'ACTIVE'}</span>
                              <span>{svc.detectedUrl}</span>
                              <ExternalLink size={11} />
                            </a>
                          ) : svc.detectedPort ? (
                            <span className="service-port-badge">PORT {svc.detectedPort}</span>
                          ) : (
                            <span className="service-cwd-text" title={svc.cwd}>
                              {svc.cwd.split(/[/\\]/).pop()}
                            </span>
                          )}

                          {onUpdatePort && (
                            <button
                              type="button"
                              className="btn-edit-port-trigger"
                              onClick={() => {
                                setEditingPortServiceId(svc.id);
                                setEditingPortValue(String(svc.detectedPort || 8000));
                              }}
                              title="Change Port Dynamically"
                              data-testid={`btn-edit-port-${svc.id}`}
                            >
                              <Edit2 size={10} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="service-card-actions">
                      {isRunning || isStarting ? (
                        <button
                          type="button"
                          className="btn-svc-action btn-svc-stop"
                          onClick={() => onStopService(svc.id)}
                          disabled={isActionLoading}
                          title="Stop service"
                          data-testid={`btn-stop-${svc.id}`}
                        >
                          <Square size={12} fill="currentColor" />
                          <span>Stop</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-svc-action btn-svc-start"
                          onClick={() => onStartService(svc.id)}
                          disabled={isActionLoading}
                          title="Start service"
                          data-testid={`btn-start-${svc.id}`}
                        >
                          <Play size={12} fill="currentColor" />
                          <span>Start</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-svc-action btn-svc-restart"
                        onClick={() => onRestartService(svc.id)}
                        disabled={isActionLoading || (!isRunning && !isStarting)}
                        title="Restart service"
                        data-testid={`btn-restart-${svc.id}`}
                      >
                        <RotateCw size={12} className={isActionLoading ? 'spinning' : ''} />
                        <span>Restart</span>
                      </button>

                      <button
                        type="button"
                        className="btn-svc-action btn-svc-terminal"
                        onClick={() => onOpenTerminal(svc)}
                        title={`Open terminal in ${svc.cwd}`}
                        data-testid={`btn-terminal-${svc.id}`}
                      >
                        <Terminal size={12} />
                        <span>Terminal</span>
                      </button>

                      <button
                        type="button"
                        className={`btn-svc-action btn-svc-logs ${activeLogServiceId === svc.id ? 'active' : ''}`}
                        onClick={() => onSelectLogService(activeLogServiceId === svc.id ? null : svc.id)}
                        title="Filter logs to this service"
                        data-testid={`btn-logs-${svc.id}`}
                      >
                        <Layers size={12} />
                        <span>{activeLogServiceId === svc.id ? 'Viewing Logs' : 'Logs'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Section: Live Log Output Stream */}
          <div className="services-logs-panel" data-testid="services-logs-panel">
            <div className="services-logs-header">
              <div className="services-logs-title-row">
                <Terminal size={14} className="text-cyan" />
                <span className="services-logs-title">
                  {activeLogServiceId
                    ? `Logs: ${services.find((s) => s.id === activeLogServiceId)?.name || activeLogServiceId}`
                    : `Live Process Output (${allLogs.length} lines)`}
                </span>
                {activeLogServiceId && (
                  <button
                    type="button"
                    className="btn-clear-filter"
                    onClick={() => onSelectLogService(null)}
                    title="View all service logs"
                  >
                    View All Services
                  </button>
                )}
              </div>

              <div className="services-logs-actions">
                <label className="autoscroll-toggle" title="Auto-scroll log output">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                  />
                  <span>Auto-scroll</span>
                </label>

                <button
                  type="button"
                  className="btn-log-action"
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  title="Copy log text"
                  data-testid="btn-copy-logs"
                >
                  {copiedLogs ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                  <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  className="btn-log-action"
                  onClick={() => onClearLogs(activeLogServiceId || undefined)}
                  disabled={logs.length === 0}
                  title="Clear log buffer"
                  data-testid="btn-clear-logs"
                >
                  <Trash2 size={12} />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <div
              className="services-logs-terminal"
              ref={logContainerRef}
              data-testid="services-logs-terminal"
            >
              {logs.length === 0 ? (
                <div className="logs-empty">
                  <span>No process output recorded yet. Click "Start" on a service to stream logs.</span>
                </div>
              ) : (
                logs.map((log) => {
                  const serviceName = services.find((s) => s.id === log.serviceId)?.name || log.serviceId;
                  const isErr = log.type === 'stderr' || log.text.toLowerCase().includes('error') || log.text.includes('FAIL');
                  const isSuccess = log.text.includes('successfully') || log.text.includes('INFO') || log.text.includes('200 OK');
                  const isWarn = log.text.includes('WARNING') || log.text.includes('warn');

                  return (
                    <div
                      key={log.id}
                      className={`log-line type-${log.type} ${isErr ? 'log-err' : ''} ${isSuccess ? 'log-success' : ''} ${isWarn ? 'log-warn' : ''}`}
                    >
                      <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="log-svc-tag">[{serviceName}]</span>
                      <span className="log-content">{log.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServicesControlBoardModal;
