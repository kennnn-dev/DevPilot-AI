import React, { useState } from 'react';
import logoImg from '../assets/logo.png';
import {
  Layers,
  Settings,
  Info,
  Folder,
  Plus,
  Check,
  X,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { Workspace } from '../../shared/types';

export interface NavigationSidebarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => Workspace;
  onRenameWorkspace: (id: string, newName: string) => void;
  onDeleteWorkspace: (id: string) => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const handleStartCreate = () => {
    setNewWsName('');
    setIsCreating(true);
    setRenamingId(null);
  };

  const handleConfirmCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (newWsName.trim()) {
      onCreateWorkspace(newWsName.trim());
    }
    setIsCreating(false);
    setNewWsName('');
  };

  const handleStartRename = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(ws.id);
    setRenameVal(ws.name);
    setIsCreating(false);
  };

  const handleConfirmRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (renameVal.trim()) {
      onRenameWorkspace(id, renameVal.trim());
    }
    setRenamingId(null);
  };

  const handleDelete = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspaces.length <= 1) return;
    const confirmed = window.confirm(
      `Delete workspace "${ws.name}"? (Local repository files on disk will not be deleted)`
    );
    if (confirmed) {
      onDeleteWorkspace(ws.id);
    }
  };

  return (
    <aside className="nav-sidebar" data-testid="nav-sidebar">
      {/* Top Brand Logo matching Image */}
      <div className="nav-brand">
        <div className="nav-brand-icon">
          <img src={logoImg} alt="DevPilot AI" className="nav-brand-logo-img" />
        </div>
        <span className="nav-brand-title">DevPilot AI</span>
      </div>

      {/* Main Navigation Menu */}
      <nav className="nav-menu">
        <div className="nav-item nav-item-active" title="Workspaces">
          <Layers size={16} className="nav-item-icon" />
          <span>Workspaces</span>
        </div>
        <div className="nav-item" title="Settings">
          <Settings size={16} className="nav-item-icon" />
          <span>Settings</span>
        </div>
        <div className="nav-item" title="About DevPilot AI">
          <Info size={16} className="nav-item-icon" />
          <span>About</span>
        </div>
      </nav>

      {/* Workspaces Section Header */}
      <div className="workspaces-section-header">
        <span className="section-title">Workspaces</span>
        <button
          type="button"
          className="btn-create-ws"
          onClick={handleStartCreate}
          title="Create a new workspace"
          data-testid="create-workspace-btn"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Inline Create Form */}
      {isCreating && (
        <form className="ws-inline-form" onSubmit={handleConfirmCreate}>
          <input
            type="text"
            className="ws-inline-input"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            placeholder="Workspace name..."
            autoFocus
          />
          <button type="submit" className="ws-action-btn ws-confirm" title="Save">
            <Check size={12} />
          </button>
          <button
            type="button"
            className="ws-action-btn ws-cancel"
            onClick={() => setIsCreating(false)}
            title="Cancel"
          >
            <X size={12} />
          </button>
        </form>
      )}

      {/* Workspaces List matching Image cards */}
      <div className="workspaces-list">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          const isRenamingThis = ws.id === renamingId;

          if (isRenamingThis) {
            return (
              <form
                key={ws.id}
                className="ws-inline-form"
                onSubmit={(e) => handleConfirmRename(ws.id, e)}
              >
                <input
                  type="text"
                  className="ws-inline-input"
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="ws-action-btn ws-confirm" title="Save">
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  className="ws-action-btn ws-cancel"
                  onClick={() => setRenamingId(null)}
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </form>
            );
          }

          return (
            <div
              key={ws.id}
              className={`workspace-card ${isActive ? 'active' : ''}`}
              onClick={() => onSelectWorkspace(ws.id)}
              data-testid={`workspace-card-${ws.id}`}
            >
              <div className="ws-card-icon-box">
                <Folder size={15} className="ws-card-folder-icon" />
              </div>

              <div className="ws-card-info">
                <span className="ws-card-name">{ws.name}</span>
                <span className="ws-card-count">
                  {ws.repoPaths.length}{' '}
                  {ws.repoPaths.length === 1 ? 'repository' : 'repositories'}
                </span>
              </div>

              <div className="ws-card-actions">
                {/* Active indicator dot matching Image */}
                <span
                  className={`ws-indicator-dot ${isActive ? 'dot-active' : 'dot-inactive'}`}
                  title={isActive ? 'Active workspace' : 'Inactive'}
                />

                <button
                  type="button"
                  className="ws-hover-btn"
                  onClick={(e) => handleStartRename(ws, e)}
                  title="Rename workspace"
                >
                  <Edit2 size={11} />
                </button>

                {workspaces.length > 1 && (
                  <button
                    type="button"
                    className="ws-hover-btn ws-hover-delete"
                    onClick={(e) => handleDelete(ws, e)}
                    title="Delete workspace"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default NavigationSidebar;
