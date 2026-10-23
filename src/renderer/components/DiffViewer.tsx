import React from 'react';
import { FileCode, Binary, RefreshCw } from 'lucide-react';
import type { GitFileStatus, GitDiffResult } from '../../shared/types';
import EmptyState from './EmptyState';

export interface DiffViewerProps {
  /** Currently selected file from sidebar, or null */
  selectedFile: GitFileStatus | null;
  /** Query result of git diff --staged */
  diffResult: GitDiffResult | null;
  /** Whether diff fetch is in flight */
  loading?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  selectedFile,
  diffResult,
  loading = false,
}) => {
  return (
    <section className="app-diff-panel" data-testid="diff-viewer">
      {!selectedFile ? (
        <EmptyState mode="no-file-selected" />
      ) : (
        <div className="diff-view-wrapper">
          {/* Diff Header */}
          <div className="diff-header" data-testid="diff-header">
            <div className="diff-file-info">
              <span className={`status-tag status-${selectedFile.changeType}`}>
                {selectedFile.changeType}
              </span>
              <span className="diff-file-name">{selectedFile.path}</span>
              {selectedFile.oldPath && (
                <span className="diff-old-path">renamed from {selectedFile.oldPath}</span>
              )}
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

          {/* Diff Content */}
          <div className="diff-content" data-testid="diff-content">
            {loading ? (
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
                {diffResult?.rawDiff || 'Loading diff content...'}
              </pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default DiffViewer;
