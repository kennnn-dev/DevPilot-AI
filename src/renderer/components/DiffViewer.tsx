import React, { useState } from 'react';
import {
  FileCode,
  Binary,
  RefreshCw,
  Code2,
  Info,
  CheckCircle2,
  GitCommit,
  Layers,
  X,
} from 'lucide-react';
import type { GitFileStatus, GitDiffResult } from '../../shared/types';
import EmptyState from './EmptyState';

export interface DiffViewerProps {
  /** Currently selected file from sidebar, or null */
  selectedFile: GitFileStatus | null;
  /** Query result of git diff */
  diffResult: GitDiffResult | null;
  /** Whether diff fetch is in flight */
  loading?: boolean;
  /** Callback to close the diff panel */
  onClose?: () => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  selectedFile,
  diffResult,
  loading = false,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'diff' | 'info'>('diff');

  const totalAdditions =
    diffResult?.hunks.reduce(
      (acc, h) => acc + h.lines.filter((l) => l.type === 'add').length,
      0
    ) ?? 0;
  const totalDeletions =
    diffResult?.hunks.reduce(
      (acc, h) => acc + h.lines.filter((l) => l.type === 'delete').length,
      0
    ) ?? 0;

  const isUntracked =
    selectedFile?.changeType === 'untracked' || selectedFile?.statusCode === '??';
  const isStaged =
    !isUntracked &&
    Boolean(
      selectedFile?.statusCode &&
        selectedFile.statusCode[0] !== ' ' &&
        selectedFile.statusCode[0] !== '?'
    );

  const fileStateLabel = isUntracked
    ? 'Untracked file'
    : isStaged
    ? 'Staged for commit'
    : 'Unstaged in working tree';

  return (
    <section className="app-diff-panel" data-testid="diff-viewer">
      <div className="diff-view-wrapper">
        {/* Top Tabs matching Image: <> Diff | (i) File Info + Close Button */}
        <div className="diff-tabs-bar">
          <div className="diff-tabs-group">
            <button
              type="button"
              className={`diff-tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
              onClick={() => setActiveTab('diff')}
            >
              <Code2 size={13} />
              <span>Diff</span>
            </button>
            <button
              type="button"
              className={`diff-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              <Info size={13} />
              <span>File Info</span>
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              className="diff-tab-close-btn"
              onClick={onClose}
              title="Close diff view"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* If no file is selected yet, render centered diff placeholder */}
        {!selectedFile ? (
          <div className="diff-empty-container">
            <EmptyState mode="no-file-selected" />
          </div>
        ) : (
          <>
            {/* File Header Bar matching Image: [icon] src/game-control.ts [A] +45 -0 */}
            <div className="diff-header" data-testid="diff-header">
              <div className="diff-file-info">
                <FileCode size={15} className="diff-file-icon" />
                <span className="diff-file-name">{selectedFile.path}</span>
                {selectedFile.oldPath && (
                  <span className="diff-old-path">renamed from {selectedFile.oldPath}</span>
                )}
                <span className={`diff-status-badge status-${selectedFile.changeType}`}>
                  {selectedFile.changeType === 'added'
                    ? 'A'
                    : selectedFile.changeType === 'modified'
                    ? 'M'
                    : selectedFile.changeType === 'deleted'
                    ? 'D'
                    : 'U'}
                </span>
                <span className="diff-line-stats">
                  <span className="stats-add">+{totalAdditions}</span>
                  <span className="stats-del">-{totalDeletions}</span>
                </span>
              </div>

              <div className="diff-header-meta">
                {diffResult && !diffResult.isBinary && !diffResult.isEmpty && (
                  <span className="diff-hunk-count">
                    {diffResult.hunks.length} {diffResult.hunks.length === 1 ? 'hunk' : 'hunks'}
                  </span>
                )}
                {diffResult?.isBinary && <span className="badge-binary">Binary File</span>}
                {diffResult?.isEmpty && <span className="badge-empty">Empty Diff</span>}
              </div>
            </div>

            {/* Diff Content / Info View */}
            {activeTab === 'info' ? (
              <div className="diff-info-view">
                <div className="diff-info-card">
                  <h3>File Details</h3>
                  <div className="info-grid">
                    <span className="info-key">Path:</span>
                    <span className="info-val">{selectedFile.path}</span>
                    {selectedFile.oldPath && (
                      <>
                        <span className="info-key">Renamed From:</span>
                        <span className="info-val">{selectedFile.oldPath}</span>
                      </>
                    )}
                    <span className="info-key">Change Type:</span>
                    <span className="info-val">{selectedFile.changeType.toUpperCase()}</span>
                    <span className="info-key">Git Status Code:</span>
                    <span className="info-val">{selectedFile.statusCode}</span>
                    <span className="info-key">State:</span>
                    <span
                      className={`info-val ${
                        isStaged ? 'text-green' : isUntracked ? 'text-cyan' : 'text-amber'
                      }`}
                    >
                      {fileStateLabel}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="diff-content" data-testid="diff-content">
                {loading && !diffResult ? (
                  <div className="diff-notice diff-loading-state" data-testid="diff-loading">
                    <RefreshCw className="spinning" size={24} />
                    <p>Loading staged diff...</p>
                  </div>
                ) : diffResult?.isBinary ? (
                  <div className="diff-notice binary-notice" data-testid="binary-diff-notice">
                    <Binary className="notice-icon" size={36} />
                    <h4>Binary file: diff not displayed</h4>
                    <p>Binary file diff cannot be viewed in text inspector.</p>
                  </div>
                ) : diffResult?.isEmpty ? (
                  <div className="diff-notice empty-notice" data-testid="empty-diff-notice">
                    <FileCode className="notice-icon" size={36} />
                    <h4>Empty file or no content changes</h4>
                    <p>File has zero modified lines or is an empty staged file.</p>
                  </div>
                ) : diffResult && diffResult.hunks.length > 0 ? (
                  <div className="diff-hunks-container">
                    {diffResult.hunks.map((hunk, hIdx) => (
                      <div key={`hunk-${hIdx}`} className="diff-hunk">
                        <div className="diff-hunk-header">{hunk.header}</div>
                        <div className="diff-hunk-lines">
                          {hunk.lines.map((line, lIdx) => (
                            <div
                              key={`line-${hIdx}-${lIdx}`}
                              className={`diff-line diff-line-${line.type}`}
                            >
                              <span className="line-num line-num-old">
                                {line.oldLineNumber !== undefined ? line.oldLineNumber : ''}
                              </span>
                              <span className="line-num line-num-new">
                                {line.newLineNumber !== undefined ? line.newLineNumber : ''}
                              </span>
                              <span className="line-marker">
                                {line.type === 'add'
                                  ? '+'
                                  : line.type === 'delete'
                                  ? '-'
                                  : line.type === 'meta'
                                  ? '\\'
                                  : ' '}
                              </span>
                              <pre className="line-text">{line.content}</pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="raw-diff-fallback">
                    {diffResult?.rawDiff || 'No diff content available.'}
                  </pre>
                )}
              </div>
            )}

            {/* Bottom Explainer Card matching Image */}
            <div className="diff-bottom-card" data-testid="diff-footer-card">
              <div className="diff-bottom-card-icon">
                {isStaged ? (
                  <CheckCircle2 size={16} className="text-green" />
                ) : isUntracked ? (
                  <Layers size={16} className="text-cyan" />
                ) : (
                  <GitCommit size={16} className="text-amber" />
                )}
              </div>
              <div className="diff-bottom-card-body">
                <span className="diff-bottom-card-title">
                  {isStaged ? 'Staged Changes' : isUntracked ? 'Untracked File' : 'Unstaged Changes'}
                </span>
                <span className="diff-bottom-card-desc">
                  {isStaged
                    ? 'This file is staged and ready for commit.'
                    : isUntracked
                    ? 'This file is newly created and not yet tracked by Git.'
                    : 'This file has modifications in your working tree that are not staged.'}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default DiffViewer;
