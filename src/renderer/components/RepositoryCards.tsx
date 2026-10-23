import React from 'react';
import { GitBranch, Settings, X } from 'lucide-react';

export interface RepositoryCardsProps {
  repoPaths: string[];
  activeRepoPath: string | null;
  activeBranch?: string | null;
  repoBranches?: Record<string, string>;
  onSelectRepo: (path: string) => void;
  onRemoveRepo: (path: string) => void;
  onAddRepo: () => void;
}

export const RepositoryCards: React.FC<RepositoryCardsProps> = ({
  repoPaths,
  activeRepoPath,
  activeBranch,
  repoBranches = {},
  onSelectRepo,
  onRemoveRepo,
}) => {
  const getBasename = (p: string) => {
    return p.split(/[/\\]/).filter(Boolean).pop() || p;
  };

  // If no repositories added yet, keep the UI clean without redundant empty strips
  if (repoPaths.length === 0) {
    return null;
  }

  return (
    <div className="repo-cards-row" data-testid="repo-cards-row">
      {repoPaths.map((path, idx) => {
        const isActive = path === activeRepoPath;
        const name = getBasename(path);
        const branchDisplay =
          isActive && activeBranch
            ? activeBranch
            : repoBranches[path]
            ? repoBranches[path]
            : '...';

        const isFirst = idx === 0;
        const dotColor = isFirst ? 'dot-cyan' : idx % 2 === 1 ? 'dot-yellow' : 'dot-green';

        return (
          <div
            key={path}
            className={`repo-card-pill ${isActive ? 'repo-card-active' : ''}`}
            onClick={() => onSelectRepo(path)}
            title={`${name} (${path})`}
            data-testid={`repo-card-${name}`}
          >
            <div className="repo-card-top">
              {isFirst ? (
                <GitBranch size={14} className="repo-card-type-icon" />
              ) : (
                <Settings size={14} className="repo-card-type-icon text-muted" />
              )}
              <span className="repo-card-name">{name}</span>
            </div>

            <div className="repo-card-bottom">
              <span className="repo-card-branch">
                <GitBranch size={11} className="mr-1" />
                {branchDisplay}
              </span>
              <span className={`repo-card-dot ${dotColor}`} />
            </div>

            <button
              type="button"
              className="repo-card-remove-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveRepo(path);
              }}
              title={`Remove ${name} from workspace`}
              data-testid={`remove-repo-${name}`}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default RepositoryCards;
