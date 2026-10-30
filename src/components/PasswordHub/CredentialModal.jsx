import { useState, useEffect, useId } from 'react';
import { generateSecurePassword } from '../../utils/vaultCrypto';
import { CloseIcon, LightningIcon, EyeIcon, EyeOffIcon, DiceIcon } from '../Icons';

const DEFAULT_CATEGORIES = [
  'General',
  'Social',
  'Email',
  'Work',
  'Finance',
  'Entertainment',
  'Personal',
];

export default function CredentialModal({
  isOpen,
  initialData,
  onSave,
  onClose,
}) {
  const [serviceName, setServiceName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [category, setCategory] = useState('General');
  const [notes, setNotes] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [genLength, setGenLength] = useState(16);
  const [genUpper, setGenUpper] = useState(true);
  const [genLower, setGenLower] = useState(true);
  const [genNumbers, setGenNumbers] = useState(true);
  const [genSymbols, setGenSymbols] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const serviceNameId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const websiteUrlId = useId();
  const categoryId = useId();
  const notesId = useId();

  // Populate initial values when opening or changing initialData
  useEffect(() => {
    if (initialData) {
      setServiceName(initialData.service_name || '');
      setUsername(initialData.username || '');
      setPassword(initialData.password || '');
      setWebsiteUrl(initialData.website_url || '');
      setCategory(initialData.category || 'General');
      setNotes(initialData.notes || '');
    } else {
      setServiceName('');
      setUsername('');
      setPassword('');
      setWebsiteUrl('');
      setCategory('General');
      setNotes('');
    }
    setError('');
    setShowGenerator(false);
    setShowPassword(false);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleGeneratePassword = () => {
    const newPwd = generateSecurePassword({
      length: Number(genLength),
      uppercase: genUpper,
      lowercase: genLower,
      numbers: genNumbers,
      symbols: genSymbols,
    });
    setPassword(newPwd);
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!serviceName.trim()) {
      setError('Service / Account name is required (e.g. "Instagram", "Personal Gmail").');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    const payload = {
      service_name: serviceName.trim(),
      username: username.trim(),
      password,
      website_url: websiteUrl.trim(),
      category: category.trim() || 'General',
      notes: notes.trim(),
    };

    setIsSaving(true);
    try {
      await onSave(payload, initialData);
      onClose();
    } catch (err) {
      console.error('Save credential error:', err);
      setError(err.message || 'Failed to save credential.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={initialData ? 'Edit Credential' : 'Add New Credential'}>
      <div className="modal-card credential-modal-card">
        <div className="modal-header">
          <h3>{initialData ? 'Edit Stored Credential' : 'Add New Credential'}</h3>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="credential-modal-form">
          <div className="modal-body scrollable-modal-body">
            {error && (
              <div className="alert-error" role="alert">
                <span>{error}</span>
              </div>
            )}

            {/* Service / Account Name */}
            <div className="form-group">
              <label htmlFor={serviceNameId}>Service / Account Name *</label>
              <input
                id={serviceNameId}
                type="text"
                placeholder="e.g. Google, Instagram, GitHub..."
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                disabled={isSaving}
                autoFocus
                required
              />
            </div>

            {/* Username / Email */}
            <div className="form-group">
              <label htmlFor={usernameId}>Username / Email</label>
              <input
                id={usernameId}
                type="text"
                placeholder="e.g. username or user@example.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSaving}
                autoComplete="off"
              />
            </div>

            {/* Password with Generator Toggle */}
            <div className="form-group">
              <div className="label-row-with-action">
                <label htmlFor={passwordId}>Password *</label>
                <button
                  type="button"
                  className="btn-text-action"
                  onClick={() => setShowGenerator(!showGenerator)}
                >
                  {showGenerator ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CloseIcon size="0.85rem" /> Hide Generator
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <LightningIcon size="0.85rem" /> Generate Strong Password
                    </span>
                  )}
                </button>
              </div>

              <div className="password-input-wrapper">
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter or generate password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSaving}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="btn-toggle-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon size="1rem" /> : <EyeIcon size="1rem" />}
                </button>
              </div>

              {/* Password Generator Accordion */}
              {showGenerator && (
                <div className="password-generator-panel">
                  <div className="generator-header">
                    <span>Password Generator (crypto.getRandomValues)</span>
                  </div>
                  <div className="generator-slider-row">
                    <label>Length: <strong>{genLength}</strong></label>
                    <input
                      type="range"
                      min="8"
                      max="32"
                      value={genLength}
                      onChange={(e) => setGenLength(e.target.value)}
                    />
                  </div>
                  <div className="generator-toggles-row">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={genUpper}
                        onChange={(e) => setGenUpper(e.target.checked)}
                      />
                      ABC
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={genLower}
                        onChange={(e) => setGenLower(e.target.checked)}
                      />
                      abc
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={genNumbers}
                        onChange={(e) => setGenNumbers(e.target.checked)}
                      />
                      123
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={genSymbols}
                        onChange={(e) => setGenSymbols(e.target.checked)}
                      />
                      #$&
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn-generator-apply"
                    onClick={handleGeneratePassword}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <DiceIcon size="1rem" /> Generate & Use Password
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Category & Website URL (Two Columns on Desktop) */}
            <div className="form-row-two-col">
              <div className="form-group">
                <label htmlFor={categoryId}>Category</label>
                <select
                  id={categoryId}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isSaving}
                >
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor={websiteUrlId}>Website URL (Optional)</label>
                <input
                  id={websiteUrlId}
                  type="text"
                  placeholder="https://..."
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={isSaving}
                />
              </div>
            </div>

            {/* Notes (Optional) */}
            <div className="form-group">
              <label htmlFor={notesId}>Notes (Optional)</label>
              <textarea
                id={notesId}
                rows={3}
                placeholder="Optional recovery codes, security question reminders..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary-action"
              disabled={isSaving || !serviceName || !password}
            >
              {isSaving ? 'Encrypting & Saving...' : (initialData ? 'Save Changes' : 'Encrypt & Save Credential')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
