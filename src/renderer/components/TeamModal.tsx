import React, { useEffect } from 'react';
import { Users, X, UserPlus, GitCommit } from 'lucide-react';

export interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  initials: string;
  status: 'online' | 'active' | 'idle';
  activity: string;
}

export const TeamModal: React.FC<TeamModalProps> = ({
  isOpen,
  onClose,
  workspaceName = 'Current Workspace',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mockTeamMembers: TeamMember[] = [
    {
      id: '1',
      name: 'wks-dev-17 (You)',
      role: 'Owner & Full-Stack Engineer',
      avatarColor: 'bg-emerald',
      initials: 'ME',
      status: 'active',
      activity: 'Active in DevPilot IDE',
    },
    {
      id: '2',
      name: 'DevPilot Agent',
      role: 'Autonomous AI Co-pilot',
      avatarColor: 'bg-purple',
      initials: 'AI',
      status: 'online',
      activity: 'Autonomous review & safe dispatch',
    },
    {
      id: '3',
      name: 'Backend Core Team',
      role: 'Repository Collaborator',
      avatarColor: 'bg-blue',
      initials: 'BE',
      status: 'online',
      activity: 'Tracking staging branch',
    },
  ];

  return (
    <div
      className="modal-overlay team-modal-backdrop"
      onClick={onClose}
      data-testid="team-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-modal-title"
    >
      <div
        className="team-modal-container"
        onClick={(e) => e.stopPropagation()}
        data-testid="team-modal"
      >
        {/* Header */}
        <div className="team-modal-header">
          <div className="team-modal-title-group">
            <div className="team-modal-icon-badge">
              <Users size={18} className="text-cyan" />
            </div>
            <div>
              <h2 id="team-modal-title" className="team-modal-title">
                Team Collaboration
              </h2>
              <p className="team-modal-subtitle">
                Active collaborators & contributors in {workspaceName}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="team-modal-close"
            onClick={onClose}
            title="Close"
            data-testid="team-modal-close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Team Members List */}
        <div className="team-members-list">
          <span className="team-list-heading">Active Workspace Members (3)</span>
          {mockTeamMembers.map((member) => (
            <div key={member.id} className="team-member-row">
              <div className={`team-avatar ${member.avatarColor}`}>
                <span>{member.initials}</span>
                <span className={`team-status-dot status-${member.status}`} />
              </div>
              <div className="team-member-info">
                <div className="team-member-name-row">
                  <span className="team-member-name">{member.name}</span>
                  <span className="team-member-role">{member.role}</span>
                </div>
                <span className="team-member-activity">{member.activity}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Collaboration Tools Bar */}
        <div className="team-modal-actions">
          <button
            type="button"
            className="btn-team-action btn-team-invite"
            onClick={() => alert('Invite link copied to clipboard!')}
          >
            <UserPlus size={14} />
            <span>Invite Team Member</span>
          </button>
          <button
            type="button"
            className="btn-team-action btn-team-sync"
            onClick={onClose}
          >
            <GitCommit size={14} />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamModal;
