import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface ErrorBannerProps {
  /** Error message to display, or null to hide banner */
  message: string | null;
  /** Callback triggered when user dismisses the banner */
  onDismiss: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onDismiss,
}) => {
  if (!message) return null;

  return (
    <div
      className="error-banner"
      data-testid="error-banner"
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="error-icon" size={16} aria-hidden="true" />
      <span className="error-message">{message}</span>
      <button
        type="button"
        className="btn-dismiss"
        onClick={onDismiss}
        title="Dismiss error"
        aria-label="Dismiss error"
      >
        &times;
      </button>
    </div>
  );
};

export default ErrorBanner;
