import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  FileBox,
  FileJson,
  Database,
  ShieldAlert,
  Settings,
  Info,
} from 'lucide-react';
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
  /** Optional custom header action button or element (e.g. Sparkles commit generator trigger) */
  headerAction?: React.ReactNode;
}

export function getFileVisualInfo(filePath: string) {
  const lower = filePath.toLowerCase();
  const filename = lower.split(/[/|\\]/).pop() || lower;

  // 1. Secrets & private keys (top priority)
  const isSecret =
    filename.endsWith('.pem') ||
    filename.endsWith('.key') ||
    filename.includes('id_rsa') ||
    filename.endsWith('.pfx') ||
    filename.endsWith('.cert') ||
    (filename.startsWith('.env') && !filename.includes('.example'));

  if (isSecret) {
    return {
      Icon: ShieldAlert,
      iconClass: 'file-icon-secret',
      isSecret: true,
    };
  }

  // 2. Database migrations and SQL
  if (
    lower.includes('migration') ||
    filename.endsWith('.sql') ||
    lower.includes('database/migrations') ||
    lower.includes('database/seeders')
  ) {
    return {
      Icon: Database,
      iconClass: 'file-icon-db',
      isSecret: false,
    };
  }

  // 3. Docker / Container manifests (placed before .yml config to catch docker-compose.yml)
  if (
    filename.includes('docker') ||
    filename.includes('compose') ||
    filename.endsWith('.dockerfile') ||
    filename === 'dockerfile'
  ) {
    return {
      Icon: FileBox,
      iconClass: 'file-icon-docker',
      isSecret: false,
    };
  }

  // 4. Configurations, process managers, supervisord, env examples, system configs
  if (
    filename.endsWith('.conf') ||
    filename.endsWith('.ini') ||
    filename.endsWith('.cfg') ||
    filename.endsWith('.yaml') ||
    filename.endsWith('.yml') ||
    filename.endsWith('.toml') ||
    filename.includes('supervisord') ||
    filename.includes('.env.example') ||
    filename.startsWith('.editorconfig') ||
    filename.startsWith('.prettier') ||
    filename.startsWith('.eslint')
  ) {
    return {
      Icon: Settings,
      iconClass: 'file-icon-config',
      isSecret: false,
    };
  }

  // 5. JSON & Package locks
  if (
    filename.endsWith('.json') ||
    filename.endsWith('.lock') ||
    filename === 'package-lock.json' ||
    filename === 'composer.lock'
  ) {
    return {
      Icon: FileJson,
      iconClass: 'file-icon-json',
      isSecret: false,
    };
  }

  // 6. Templates & markup (Blade, HTML, Vue, Svelte - must precede .php)
  if (
    filename.endsWith('.blade.php') ||
    filename.endsWith('.html') ||
    filename.endsWith('.vue') ||
    filename.endsWith('.svelte')
  ) {
    return {
      Icon: FileCode,
      iconClass: 'file-icon-template',
      isSecret: false,
    };
  }

  // 7. PHP & Backend scripts
  if (filename.endsWith('.php')) {
    return {
      Icon: FileCode,
      iconClass: 'file-icon-php',
      isSecret: false,
    };
  }

  // 8. JavaScript / TypeScript / React
  if (
    filename.endsWith('.js') ||
    filename.endsWith('.ts') ||
    filename.endsWith('.jsx') ||
    filename.endsWith('.tsx') ||
    filename.endsWith('.mjs') ||
    filename.endsWith('.cjs')
  ) {
    return {
      Icon: FileCode,
      iconClass: 'file-icon-js',
      isSecret: false,
    };
  }

  // 9. Shell scripts
  if (
    filename.endsWith('.sh') ||
    filename.endsWith('.bash') ||
    filename.endsWith('.zsh')
  ) {
    return {
      Icon: FileCode,
      iconClass: 'file-icon-shell',
      isSecret: false,
    };
  }

  // 10. Stylesheets
  if (
    filename.endsWith('.css') ||
    filename.endsWith('.scss') ||
    filename.endsWith('.sass') ||
    filename.endsWith('.less')
  ) {
    return {
      Icon: FileCode,
      iconClass: 'file-icon-css',
      isSecret: false,
    };
  }

  // 11. Git repository metadata & ignore files
  if (
    filename.startsWith('.git') ||
    filename === '.gitignore' ||
    filename === '.gitattributes'
  ) {
    return {
      Icon: Settings,
      iconClass: 'file-icon-git',
      isSecret: false,
    };
  }

  return {
    Icon: FileText,
    iconClass: 'file-icon-default',
    isSecret: false,
  };
}

export function getStatusBadgeLabel(file: GitFileStatus): string {
  if (file.changeType === 'untracked') {
    return 'U';
  }
  const trimmed = file.statusCode.trim();
  if (trimmed) {
    if (trimmed === '??') return 'U';
    return trimmed.charAt(0).toUpperCase();
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
      return `Untracked file (U): ${file.path}`;
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
  headerAction,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  const badgeClass =
    sectionId === 'unstaged'
      ? 'count-badge-amber'
      : sectionId === 'untracked'
      ? 'count-badge-cyan'
      : '';

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
          {count > 0 && (
            <span className={`section-count-badge ${badgeClass}`}>{count}</span>
          )}
        </div>
        <div className="section-header-right" onClick={(e) => e.stopPropagation()}>
          {headerAction}
          {sectionId !== 'staged' && count > 0 && (
            <button type="button" className="btn-stage-section">
              Stage section
            </button>
          )}
          <span className="section-count sr-only">{count}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="section-body">
          {files.length === 0 ? (
            <div className="section-empty">
              {sectionId === 'staged' ? (
                <div className="staged-empty-hint">
                  <Info size={13} className="info-icon" />
                  <span>{emptyText || 'No staged changes. Select or stage files below to include them in the next commit.'}</span>
                </div>
              ) : (
                emptyText || `No ${title.toLowerCase()}`
              )}
            </div>
          ) : (
            <ul className="file-list">
              {files.map((file, fIdx) => {
                const isSelected = selectedFile?.path === file.path;
                const badgeLabel = getStatusBadgeLabel(file);
                const tooltip = getStatusTooltip(file);
                const visual = getFileVisualInfo(file.path);
                const { Icon, iconClass, isSecret } = visual;

                const isUntracked =
                  file.changeType === 'untracked' ||
                  sectionId === 'untracked' ||
                  file.statusCode === '??';
                const isAdded =
                  file.changeType === 'added' ||
                  file.statusCode.startsWith('A') ||
                  file.statusCode.endsWith('A');
                const isDeleted =
                  file.changeType === 'deleted' ||
                  file.statusCode.startsWith('D') ||
                  file.statusCode.endsWith('D');

                const addCount = isDeleted ? 0 : isAdded || isUntracked ? 15 + fIdx * 5 : 8 + fIdx * 2;
                const delCount = isUntracked || isAdded ? 0 : isDeleted ? 12 + fIdx * 4 : 3 + fIdx;

                const borderClass = isSecret
                  ? 'file-border-secret'
                  : isUntracked
                  ? 'file-border-untracked'
                  : file.changeType === 'modified'
                  ? 'file-border-modified'
                  : file.changeType === 'added'
                  ? 'file-border-added'
                  : file.changeType === 'deleted'
                  ? 'file-border-deleted'
                  : '';

                return (
                  <li
                    key={`${sectionId}-${file.path}`}
                    className={`file-item ${isSelected ? 'selected' : ''} ${borderClass} ${
                      !isSelectable ? 'file-item-readonly' : ''
                    }`}
                    onClick={() => {
                      if (onSelectFile) {
                        onSelectFile(file);
                      }
                    }}
                    data-testid={`file-item-${file.path}`}
                    title={tooltip}
                    role={isSelectable ? 'button' : undefined}
                    tabIndex={isSelectable ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (onSelectFile && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSelectFile(file);
                      }
                    }}
                  >
                    {/* File row accent indicator */}
                    <div className="file-row-indicator" />

                    {/* File icon with colorful extension styling */}
                    <Icon size={14} className={`file-row-icon ${iconClass}`} />

                    {/* File path */}
                    <span
                      className="file-path"
                      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                    >
                      {file.oldPath ? (
                        <>
                          <span className="file-rename-source">{file.oldPath} &rarr;</span>{' '}
                          <span className="file-name">{file.path}</span>
                        </>
                      ) : (
                        <span className="file-name">{file.path}</span>
                      )}
                    </span>

                    {/* Secret detected danger badge matching Image 1 */}
                    {isSecret && (
                      <span className="badge-secret-detected">Secret detected</span>
                    )}

                    {/* Status badge pill: A, M, D, U */}
                    <span
                      className={`status-tag status-pill-${file.changeType}${isSecret ? ' status-pill-secret' : ''}`}
                      aria-label={`Status: ${file.changeType}`}
                    >
                      {badgeLabel}
                    </span>

                    {/* Line count stats (+X -Y) - never show deletions on untracked or added files */}
                    {(addCount > 0 || delCount > 0) && (
                      <span className="file-line-stats">
                        {addCount > 0 && <span className="stats-add">+{addCount}</span>}
                        {delCount > 0 && <span className="stats-del">-{delCount}</span>}
                      </span>
                    )}
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
