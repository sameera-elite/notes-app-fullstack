import { useState, useRef, useEffect } from 'react';
import { EditIcon, TrashIcon, CheckIcon, EyeIcon, EyeOffIcon, InfoIcon, ExternalLinkIcon } from '../Icons';

export default function CredentialCard({ item, onEdit, onDelete }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(null); // 'username' | 'password' | null
  const [feedbackTimerMessage, setFeedbackTimerMessage] = useState('');
  const lastCopiedPasswordRef = useRef(null);
  const clearTimerRef = useRef(null);

  // Clean up any timers on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  const handleCopyUsername = async () => {
    if (!item.username) return;
    try {
      await navigator.clipboard.writeText(item.username);
      setCopyFeedback('username');
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleCopyPassword = async () => {
    if (!item.password) return;
    try {
      await navigator.clipboard.writeText(item.password);
      lastCopiedPasswordRef.current = item.password;
      setCopyFeedback('password');
      setFeedbackTimerMessage('Password copied (Best-effort notice: Clipboard history / Win+V is not cleared)');

      // Cancel previous timer if any
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }

      // 45-second best-effort notice / clear attempt
      clearTimerRef.current = setTimeout(() => {
        setCopyFeedback(null);
        setFeedbackTimerMessage('');
        lastCopiedPasswordRef.current = null;
      }, 45000);

      // Reset the visual "Copied!" pill after 3s
      setTimeout(() => {
        if (copyFeedback === 'password') setCopyFeedback(null);
      }, 3000);
    } catch {
      // Fallback
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <article className="credential-card" aria-label={`Credential for ${item.service_name}`}>
      <div className="credential-card-header">
        <div className="credential-title-group">
          <h3 className="credential-service-name">{item.service_name}</h3>
          {item.category && (
            <span className="credential-category-badge">{item.category}</span>
          )}
        </div>
        <div className="credential-card-actions">
          <button
            type="button"
            className="btn-card-action btn-card-edit"
            onClick={() => onEdit(item)}
            title="Edit credential"
            aria-label={`Edit ${item.service_name}`}
          >
            <EditIcon size="0.95rem" />
          </button>
          <button
            type="button"
            className="btn-card-action btn-card-delete"
            onClick={() => onDelete(item.id)}
            title="Delete credential"
            aria-label={`Delete ${item.service_name}`}
          >
            <TrashIcon size="0.95rem" />
          </button>
        </div>
      </div>

      <div className="credential-card-body">
        {/* Username / Email Field */}
        <div className="credential-field">
          <span className="field-label">Username / Email:</span>
          <div className="field-value-row">
            <span className="field-value-text">{item.username || '—'}</span>
            {item.username && (
              <button
                type="button"
                className="btn-copy-small"
                onClick={handleCopyUsername}
                title="Copy username"
                aria-label="Copy username"
              >
                {copyFeedback === 'username' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                    <CheckIcon size="0.85rem" /> Copied
                  </span>
                ) : (
                  'Copy'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Password Field with Masking */}
        <div className="credential-field">
          <span className="field-label">Password:</span>
          <div className="field-value-row">
            <span className="field-value-text font-mono">
              {isRevealed ? item.password : '••••••••••••'}
            </span>
            <div className="field-action-buttons">
              <button
                type="button"
                className="btn-reveal-small"
                onClick={() => setIsRevealed(!isRevealed)}
                aria-label={isRevealed ? 'Hide password' : 'Show password'}
              >
                {isRevealed ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <EyeOffIcon size="0.85rem" /> Hide
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <EyeIcon size="0.85rem" /> Reveal
                  </span>
                )}
              </button>
              <button
                type="button"
                className="btn-copy-small"
                onClick={handleCopyPassword}
                title="Copy password"
                aria-label="Copy password"
              >
                {copyFeedback === 'password' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                    <CheckIcon size="0.85rem" /> Copied
                  </span>
                ) : (
                  'Copy'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Website URL Link */}
        {item.website_url && (
          <div className="credential-field">
            <span className="field-label">Website:</span>
            <div className="field-value-row">
              <a
                href={item.website_url.startsWith('http') ? item.website_url : `https://${item.website_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="credential-url-link"
              >
                {item.website_url} <ExternalLinkIcon size="0.85rem" />
              </a>
            </div>
          </div>
        )}

        {/* Notes (Optional) */}
        {item.notes && (
          <div className="credential-field credential-notes-field">
            <span className="field-label">Notes:</span>
            <p className="credential-notes-text">{item.notes}</p>
          </div>
        )}

        {/* Best-Effort Clipboard Notice */}
        {feedbackTimerMessage && (
          <div className="clipboard-notice-pill" role="status">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <InfoIcon size="0.95rem" /> {feedbackTimerMessage}
            </span>
          </div>
        )}
      </div>

      <div className="credential-card-footer">
        <span className="credential-updated-date">
          Updated {formatDate(item.updated_at)}
        </span>
      </div>
    </article>
  );
}
