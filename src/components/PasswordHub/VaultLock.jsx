import { useState, useEffect, useId } from 'react';
import {
  deriveMasterKey,
  deriveSubKeys,
  unwrapVaultKey,
  hexToBuffer,
} from '../../utils/vaultCrypto';
import { VAULT_API_URL } from '../../utils/apiConfig';
import { LockIcon, EyeIcon, EyeOffIcon, AlertIcon } from '../Icons';

export default function VaultLock({
  vaultMeta,
  onUnlockSuccess,
  onVaultReset,
  apiBaseUrl = VAULT_API_URL,
}) {
  const [masterPassword, setMasterPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const passwordInputId = useId();
  const resetConfirmInputId = useId();

  // Reset modal state
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetChallenge, setResetChallenge] = useState('');
  const [resetConfirmationPhrase, setResetConfirmationPhrase] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (cooldownSeconds > 0) return;
    setError('');

    if (!masterPassword) {
      setError('Please enter your Master Password.');
      return;
    }

    setIsLoading(true);

    try {
      if (!vaultMeta?.client_salt || !vaultMeta?.encrypted_vault_key || !vaultMeta?.key_iv) {
        throw new Error('Vault metadata is missing or corrupted.');
      }

      // 1. Convert client salt hex to Uint8Array
      const saltBytes = hexToBuffer(vaultMeta.client_salt);

      // 2. Derive Master Key via Argon2id (64 MB, 3 iterations)
      const mk = await deriveMasterKey(masterPassword, saltBytes);

      // 3. Derive independent MEK and ClientAuthHash via RFC 5869 HKDF
      const { mek, clientAuthHash } = await deriveSubKeys(mk);

      // 4. Authenticate with backend
      const res = await fetch(`${apiBaseUrl}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_auth_hash: clientAuthHash }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          const waitTime = data.retryAfter || 15;
          setCooldownSeconds(waitTime);
          throw new Error(`Too many failed unlock attempts. Please wait ${waitTime} seconds.`);
        }
        throw new Error(data.error || 'Incorrect Master Password. Please try again.');
      }

      const sessionToken = data.token;
      const expiresAt = data.expires_at;

      // 5. Client-side envelope decryption: unwrap Vault Key (VK) with MEK
      // Throws OperationError automatically if MEK does not match
      const vk = await unwrapVaultKey(mek, vaultMeta.encrypted_vault_key, vaultMeta.key_iv);

      // Clear password string from component state
      setMasterPassword('');

      // Pass unlocked key and session to parent in-memory state
      if (onUnlockSuccess) {
        onUnlockSuccess(vk, sessionToken, expiresAt);
      }
    } catch (err) {
      console.error('Vault unlock error:', err);
      setError(err.message || 'Authentication failed. Please verify your Master Password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1 of Reset: Request challenge token
  const handleOpenResetModal = async () => {
    setIsResetOpen(true);
    setResetError('');
    setResetConfirmationPhrase('');
    setResetChallenge('');

    try {
      const res = await fetch(`${apiBaseUrl}/reset-challenge`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to request reset challenge.');
      }
      setResetChallenge(data.challenge_token);
    } catch (err) {
      setResetError(err.message || 'Unable to initialize reset challenge.');
    }
  };

  // Step 2 of Reset: Confirm permanent wipe
  const handleConfirmReset = async (e) => {
    e.preventDefault();
    if (resetConfirmationPhrase !== 'PERMANENTLY DELETE') {
      setResetError('You must type exact confirmation phrase "PERMANENTLY DELETE".');
      return;
    }
    if (!resetChallenge) {
      setResetError('Reset challenge is missing. Please close and re-open this modal.');
      return;
    }

    setIsResetting(true);
    setResetError('');

    try {
      const res = await fetch(`${apiBaseUrl}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_token: resetChallenge,
          confirmation_phrase: resetConfirmationPhrase,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset vault.');
      }

      setIsResetOpen(false);
      if (onVaultReset) {
        onVaultReset();
      }
    } catch (err) {
      setResetError(err.message || 'An error occurred while resetting the vault.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="vault-lock-container">
      <div className="vault-card lock-card">
        <div className="vault-header-icon" aria-hidden="true">
          <LockIcon size="2.5rem" />
        </div>
        <h2>Password Hub Locked</h2>
        <p className="vault-subtitle">
          Enter your Master Password to decrypt your stored credentials.
        </p>

        {error && (
          <div className="alert-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {cooldownSeconds > 0 && (
          <div className="alert-warning" role="alert">
            <span>Lockout active: Please wait <strong>{cooldownSeconds}s</strong> before retrying.</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="vault-form">
          <div className="form-group">
            <label htmlFor={passwordInputId}>Master Password</label>
            <div className="password-input-wrapper">
              <input
                id={passwordInputId}
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter master password..."
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                disabled={isLoading || cooldownSeconds > 0}
                autoFocus
                autoComplete="current-password"
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
          </div>

          <button
            type="submit"
            className="btn-primary-action"
            disabled={isLoading || cooldownSeconds > 0 || !masterPassword}
          >
            {isLoading ? 'Decrypting Vault...' : 'Unlock Vault'}
          </button>
        </form>

        <div className="vault-footer-links">
          <button
            type="button"
            className="btn-link-action"
            onClick={handleOpenResetModal}
          >
            Forgot Master Password?
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {isResetOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Reset Vault Confirmation">
          <div className="modal-card reset-modal-card">
            <div className="modal-header danger-header">
              <h3>Permanently Reset Password Vault</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setIsResetOpen(false)}
                aria-label="Close reset modal"
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="alert-danger-box">
                <span className="danger-icon" aria-hidden="true">
                  <AlertIcon size="1.25rem" />
                </span>
                <div>
                  <strong>Irreversible Action:</strong>
                  <p>
                    Because encryption is strictly client-side zero-knowledge, your master password cannot be reset or emailed.
                    Resetting will <strong>permanently erase all stored credentials</strong> in your vault.
                  </p>
                </div>
              </div>

              {resetError && (
                <div className="alert-error" role="alert">
                  <span>{resetError}</span>
                </div>
              )}

              <form onSubmit={handleConfirmReset}>
                <div className="form-group">
                  <label htmlFor={resetConfirmInputId}>
                    To confirm permanent deletion, type: <strong>PERMANENTLY DELETE</strong>
                  </label>
                  <input
                    id={resetConfirmInputId}
                    type="text"
                    value={resetConfirmationPhrase}
                    onChange={(e) => setResetConfirmationPhrase(e.target.value)}
                    placeholder="PERMANENTLY DELETE"
                    disabled={isResetting}
                    required
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsResetOpen(false)}
                    disabled={isResetting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-danger-action"
                    disabled={isResetting || resetConfirmationPhrase !== 'PERMANENTLY DELETE'}
                  >
                    {isResetting ? 'Wiping Vault...' : 'Erase Everything & Reset'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
