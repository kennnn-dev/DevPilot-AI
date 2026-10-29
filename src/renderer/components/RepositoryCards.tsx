import React from 'react';
import { GitBranch, Plus, X } from 'lucide-react';

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
  onAddRepo,
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
      {repoPaths.map((path) => {
        const isActive = path === activeRepoPath;
        const name = getBasename(path);
        const branchDisplay =
          isActive && activeBranch
            ? activeBranch
            : repoBranches[path]
            ? repoBranches[path]
            : 'main';

        const dotColor = isActive ? 'dot-cyan' : 'dot-yellow';

        return (
          <div
            key={path}
            className={`repo-card-pill ${isActive ? 'repo-card-active' : ''}`}
            onClick={() => onSelectRepo(path)}
            title={`${name} (${path})`}
            data-testid={`repo-card-${name}`}
          >
            <div className="repo-card-top">
              <div className="repo-card-identity">
                <GitBranch size={13} className={`repo-card-type-icon ${isActive ? 'text-cyan' : 'text-muted'}`} />
                <span className="repo-card-name">{name}</span>
              </div>
              <span className={`repo-card-dot ${dotColor}`} />
            </div>

            <div className="repo-card-bottom">
              <span className={`repo-card-branch ${!isActive ? 'text-amber' : ''}`}>
                <GitBranch size={11} className="mr-1" />
                <span>{branchDisplay}</span>
              </span>
              {isActive && (
                <span className="repo-card-hash">d48f9a2</span>
              )}
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

      {/* Quick Add Repository button card matching Image 1 */}
      <button
        type="button"
        className="repo-card-quick-add"
        onClick={onAddRepo}
        title="Add repository to this workspace"
        data-testid="quick-add-repo-btn"
      >
        <Plus size={15} />
      </button>
    </div>
  );
};

export default RepositoryCards;
