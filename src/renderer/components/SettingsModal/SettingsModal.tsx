import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  X,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Server,
  Key,
} from 'lucide-react';
import {
  getWebhookUrl,
  getWebhookToken,
  setWebhookUrl,
  setWebhookToken,
  clearWebhookConfig,
  validateWebhookUrl,
  resolveEffectiveWebhookConfig,
} from '../../services/webhookConfig';
import type { ConfigSource } from '../../../shared/types';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional initial env defaults for testing or preloaded context */
  initialEnvDefaults?: {
    webhookUrl?: string;
    hasToken?: boolean;
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialEnvDefaults,
}) => {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [source, setSource] = useState<ConfigSource>('none');
  const [envDefaults, setEnvDefaults] = useState<{ webhookUrl: string; hasToken: boolean }>({
    webhookUrl: '',
    hasToken: false,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Initialize and populate values whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Initial synchronous read from localStorage to avoid input flicker
    const initialUserUrl = getWebhookUrl();
    const initialUserToken = getWebhookToken();
    setUrl(initialUserUrl);
    setToken(initialUserToken);

    if (initialUserUrl) {
      setSource('user');
    }

    if (initialEnvDefaults) {
      setEnvDefaults({
        webhookUrl: initialEnvDefaults.webhookUrl || '',
        hasToken: Boolean(initialEnvDefaults.hasToken),
      });
      if (!initialUserUrl && initialEnvDefaults.webhookUrl) {
        setSource('env');
      }
    }

    // Asynchronous hybrid resolution querying main process via IPC
    resolveEffectiveWebhookConfig()
      .then((resolved) => {
        if (!isMounted) return;
        setEnvDefaults(resolved.envDefaults);
        if (!getWebhookUrl()) {
          setSource(resolved.source);
        } else {
          setSource('user');
        }
      })
      .catch((err) => {
        console.warn('Failed to resolve webhook config:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialEnvDefaults]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // AutoFocus on Webhook URL input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        urlInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Focus trap inside modal
  const handleKeyDownTrap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;

    const container = modalContainerRef.current;
    if (!container) return;

    const focusable = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedUrl = url.trim();
    const trimmedToken = token.trim();

    const validation = validateWebhookUrl(trimmedUrl);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Please enter a valid HTTP or HTTPS webhook URL.');
      return;
    }

    try {
      setWebhookUrl(trimmedUrl);
      setWebhookToken(trimmedToken);
      setSource('user');
      setSuccessMessage('Settings saved successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
      setErrorMessage(msg);
    }
  };

  const handleReset = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      clearWebhookConfig();
      setUrl('');
      setToken('');
      const resolved = await resolveEffectiveWebhookConfig();
      setSource(resolved.source);
      setEnvDefaults(resolved.envDefaults);

      if (resolved.source === 'env') {
        setSuccessMessage('Settings reset to .env fallback defaults.');
      } else {
        setSuccessMessage('Configuration cleared.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset configuration.';
      setErrorMessage(msg);
    }
  };

  if (!isOpen) {
    return null;
  }

  const getSourceBadgeText = (src: ConfigSource) => {
    switch (src) {
      case 'user':
        return 'User Settings';
      case 'env':
        return '.env Fallback';
      case 'none':
      default:
        return 'Unconfigured';
    }
  };

  return (
    <div
      className="settings-modal-backdrop"
      data-testid="settings-modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDownTrap}
    >
      <div
        className="settings-modal-dialog"
        data-testid="settings-modal"
        ref={modalContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="settings-modal-header">
          <div className="settings-header-left">
            <div className="settings-header-icon">
              <Settings size={18} />
            </div>
            <div className="settings-title-group">
              <h2 id="settings-modal-title" className="settings-modal-title">
                Webhook Settings
              </h2>
              <span className="settings-modal-subtitle">
                Configure AI Webhook endpoint and credentials
              </span>
            </div>
          </div>
          <button
            type="button"
            className="settings-header-close-btn"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        {/* Modal Body */}
        <form className="settings-modal-body" onSubmit={handleSave}>
          {/* Configuration Source Indicator */}
          <div className="settings-source-container">
            <span className="settings-source-label">Active Source</span>
            <span
              className={`settings-source-badge source-${source}`}
              data-testid="settings-source-badge"
            >
              {getSourceBadgeText(source)}
            </span>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div
              className="settings-alert settings-alert-error"
              data-testid="settings-error-alert"
              role="alert"
            >
              <AlertCircle size={15} className="settings-alert-icon" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              className="settings-alert settings-alert-success"
              data-testid="settings-success-alert"
              role="status"
            >
              <CheckCircle2 size={15} className="settings-alert-icon" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="settings-form-group">
            <label htmlFor="settings-webhook-url-input" className="settings-field-label">
              <span>AI Webhook URL</span>
              <span className="settings-field-required">* Required</span>
            </label>
            <div className="settings-input-wrapper">
              <Server size={14} className="settings-input-icon" />
              <input
                id="settings-webhook-url-input"
                ref={urlInputRef}
                type="url"
                className="settings-input with-icon"
                data-testid="settings-webhook-url-input"
                placeholder={envDefaults.webhookUrl || 'https://api.example.com/webhook/...'}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                  if (successMessage) setSuccessMessage(null);
                }}
              />
            </div>
            {envDefaults.webhookUrl && (
              <span className="settings-field-hint" data-testid="settings-env-fallback-preview">
                .env fallback: <code>{envDefaults.webhookUrl}</code>
              </span>
            )}
          </div>

          <div className="settings-form-group">
            <label htmlFor="settings-webhook-token-input" className="settings-field-label">
              <span>API / Bearer Token</span>
              <span className="settings-field-optional">Optional</span>
            </label>
            <div className="settings-input-wrapper">
              <Key size={14} className="settings-input-icon" />
              <input
                id="settings-webhook-token-input"
                type={showToken ? 'text' : 'password'}
                className="settings-input with-icon settings-input-password"
                data-testid="settings-webhook-token-input"
                placeholder="Bearer token or API key"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                  if (successMessage) setSuccessMessage(null);
                }}
              />
              <button
                type="button"
                className="settings-password-toggle"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <span className="settings-field-hint">
              Used for <code>Authorization: Bearer &lt;token&gt;</code> or{' '}
              <code>X-API-KEY</code> header dispatch.
            </span>
          </div>

          {/* Hidden submit trigger for Enter key support */}
          <button type="submit" className="sr-only" tabIndex={-1}>
            Submit
          </button>
        </form>

        {/* Action Buttons Footer */}
        <footer className="settings-modal-footer">
          <div className="settings-footer-left">
            <button
              type="button"
              className="btn-settings-reset"
              data-testid="settings-reset-btn"
              onClick={handleReset}
              title="Clear user configuration and revert to .env defaults"
            >
              <RotateCcw size={13} />
              <span>Reset to Defaults</span>
            </button>
          </div>

          <div className="settings-footer-right">
            <button
              type="button"
              className="btn-settings-close"
              data-testid="settings-close-btn"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="btn-settings-save"
              data-testid="settings-save-btn"
              onClick={() => handleSave()}
            >
              <Save size={13} />
              <span>Save Changes</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SettingsModal;
