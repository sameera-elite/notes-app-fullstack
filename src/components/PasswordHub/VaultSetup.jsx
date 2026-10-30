import { useState, useId } from 'react';
import {
  generateRandomSalt,
  deriveMasterKey,
  deriveSubKeys,
  generateVaultKey,
  wrapVaultKey,
  bufferToHex,
  ARGON2_PARAMS,
} from '../../utils/vaultCrypto';
import { VAULT_API_URL } from '../../utils/apiConfig';
import { LockIcon, EyeIcon, EyeOffIcon, WarningIcon } from '../Icons';

export default function VaultSetup({ onSetupSuccess, apiBaseUrl = VAULT_API_URL }) {
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const masterPasswordId = useId();
  const confirmPasswordId = useId();

  // Password strength evaluation
  const evaluateStrength = (pwd) => {
    if (!pwd) return { score: 0, label: 'Empty', color: 'transparent' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (pwd.length >= 16) score += 1;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pwd)) score += 1;

    if (score <= 2) return { score, label: 'Weak', color: '#ef4444' };
    if (score <= 4) return { score, label: 'Fair', color: '#f59e0b' };
    if (score <= 5) return { score, label: 'Good', color: '#10b981' };
    return { score, label: 'Strong', color: '#059669' };
  };

  const strength = evaluateStrength(masterPassword);

  const handleSetup = async (e) => {
    e.preventDefault();
    setError('');

    if (!masterPassword || masterPassword.length < 12) {
      setError('Master Password must be at least 12 characters long for strong security.');
      return;
    }
    if (masterPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Generate fresh 16-byte random salt
      const clientSalt = generateRandomSalt(16);

      // 2. Derive Master Key (MK) using Argon2id (64 MB, 3 iterations)
      const mk = await deriveMasterKey(masterPassword, clientSalt);

      // 3. Derive independent Master Encryption Key (MEK) and Client Auth Hash via RFC 5869 HKDF
      const { mek, clientAuthHash } = await deriveSubKeys(mk);

      // 4. Generate fresh 256-bit Vault Key (VK)
      const vk = await generateVaultKey();

      // 5. Wrap Vault Key with MEK using AES-256-GCM
      const { encryptedVaultKey, keyIv } = await wrapVaultKey(mek, vk);

      // 6. Send setup payload to backend
      const res = await fetch(`${apiBaseUrl}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_salt: bufferToHex(clientSalt),
          kdf_type: 'argon2id',
          kdf_params: ARGON2_PARAMS,
          client_auth_hash: clientAuthHash,
          encrypted_vault_key: encryptedVaultKey,
          key_iv: keyIv,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Setup failed with status ${res.status}`);
      }

      // Clear plain password references immediately
      setMasterPassword('');
      setConfirmPassword('');

      // Notify parent to transition
      if (onSetupSuccess) {
        onSetupSuccess();
      }
    } catch (err) {
      console.error('Vault setup error:', err);
      setError(err.message || 'An error occurred during vault setup.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="vault-setup-container">
      <div className="vault-card setup-card">
        <div className="vault-header-icon" aria-hidden="true">
          <LockIcon size="2.5rem" />
        </div>
        <h2>Create Your Master Password</h2>
        <p className="vault-subtitle">
          Your Master Password encrypts your Password Hub vault client-side.
          It is never sent to the server and cannot be recovered if forgotten.
        </p>

        {error && (
          <div className="alert-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSetup} className="vault-form">
          <div className="form-group">
            <label htmlFor={masterPasswordId}>Master Password</label>
            <div className="password-input-wrapper">
              <input
                id={masterPasswordId}
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 12 characters..."
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                disabled={isLoading}
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
            {masterPassword && (
              <div className="strength-meter-box">
                <div className="strength-bar-bg">
                  <div
                    className="strength-bar-fill"
                    style={{
                      width: `${(strength.score / 6) * 100}%`,
                      backgroundColor: strength.color,
                    }}
                  />
                </div>
                <span className="strength-label" style={{ color: strength.color }}>
                  Strength: {strength.label}
                </span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor={confirmPasswordId}>Confirm Master Password</label>
            <input
              id={confirmPasswordId}
              type={showPassword ? 'text' : 'password'}
              placeholder="Re-enter your master password..."
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="vault-warning-box">
            <span className="warning-icon" aria-hidden="true">
              <WarningIcon size="1.25rem" />
            </span>
            <div className="warning-text">
              <strong>Strict Zero-Knowledge Notice:</strong>
              <p>
                There is no &quot;Forgot Password&quot; reset link. If you forget your Master Password,
                all stored credentials will be permanently unrecoverable.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary-action"
            disabled={isLoading || !masterPassword || !confirmPassword}
          >
            {isLoading ? 'Deriving Keys & Creating Vault...' : 'Create Master Password & Vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
