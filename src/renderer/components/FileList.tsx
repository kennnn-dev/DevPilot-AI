import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GitFileStatus } from '../../shared/types';

export interface FileListProps {
  /** Title of the collapsible section, e.g. "Staged Changes" */
  title: string;
  /** Number of files in this category */
  count: number;
  /** List of files */
  files: GitFileStatus[];
  /** Section identifier: 'staged' | 'unstaged' | 'untracked' */
  sectionId: 'staged' | 'unstaged' | 'untracked';
  /** Currently selected file (for staged active highlight) */
  selectedFile?: GitFileStatus | null;
  /** Whether files in this section are selectable for diff inspection */
  isSelectable?: boolean;
  /** Initial expansion state (default: true) */
  defaultExpanded?: boolean;
  /** Message displayed when file list is empty */
  emptyText?: string;
  /** Selection callback */
  onSelectFile?: (file: GitFileStatus) => void;
}

export function getStatusBadgeLabel(file: GitFileStatus): string {
  if (file.changeType === 'untracked') {
    return '??';
  }
  const trimmed = file.statusCode.trim();
  if (trimmed) {
    return trimmed;
  }
  switch (file.changeType) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    default:
      return (file.changeType as string).charAt(0).toUpperCase() || '?';
  }
}

export function getStatusTooltip(file: GitFileStatus): string {
  switch (file.changeType) {
    case 'added':
      return `Added file (A): ${file.path}`;
    case 'modified':
      return `Modified file (M): ${file.path}`;
    case 'deleted':
      return `Deleted file (D): ${file.path}`;
    case 'renamed':
      return `Renamed file (R): ${file.oldPath || ''} → ${file.path}`;
    case 'copied':
      return `Copied file (C): ${file.oldPath || ''} → ${file.path}`;
    case 'untracked':
      return `Untracked file (??): ${file.path}`;
    default:
      return `${file.changeType}: ${file.path}`;
  }
}

export const FileList: React.FC<FileListProps> = ({
  title,
  count,
  files,
  sectionId,
  selectedFile,
  isSelectable = false,
  defaultExpanded = true,
  emptyText,
  onSelectFile,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <section className="file-section" data-testid={`${sectionId}-section`}>
      <div
        className="section-header"
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpanded();
          }
        }}
        title={`Click to ${isExpanded ? 'collapse' : 'expand'} ${title}`}
      >
        <div className="section-header-left">
          {isExpanded ? (
            <ChevronDown size={14} className="section-chevron" aria-hidden="true" />
          ) : (
            <ChevronRight size={14} className="section-chevron" aria-hidden="true" />
          )}
          <span className="section-title">{title}</span>
        </div>
        <span className="section-count">{count}</span>
      </div>

      {isExpanded && (
        <div className="section-body">
          {files.length === 0 ? (
            <div className="section-empty">{emptyText || `No ${title.toLowerCase()}`}</div>
          ) : (
            <ul className="file-list">
              {files.map((file) => {
                const isSelected = selectedFile?.path === file.path;
                const badgeLabel = getStatusBadgeLabel(file);
                const tooltip = getStatusTooltip(file);

                return (
                  <li
                    key={`${sectionId}-${file.path}`}
                    className={`file-item ${isSelected ? 'selected' : ''} ${
                      !isSelectable ? 'file-item-readonly' : ''
                    }`}
                    onClick={() => {
                      if (isSelectable && onSelectFile) {
                        onSelectFile(file);
                      }
                    }}
                    data-testid={`file-item-${file.path}`}
                    title={tooltip}
                    role={isSelectable ? 'button' : undefined}
                    tabIndex={isSelectable ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (isSelectable && onSelectFile && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSelectFile(file);
                      }
                    }}
                  >
                    <span
                      className={`status-tag status-${file.changeType}`}
                      aria-label={`Status: ${file.changeType}`}
                    >
                      {badgeLabel}
                    </span>
                    <span className="file-path" title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>
                      {file.oldPath ? (
                        <>
                          <span className="file-rename-source">{file.oldPath} &rarr;</span>{' '}
                          <span className="file-name">{file.path}</span>
                        </>
                      ) : (
                        <span className="file-name">{file.path}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

export default FileList;
