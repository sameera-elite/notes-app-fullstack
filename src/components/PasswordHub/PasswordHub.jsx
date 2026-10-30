import { useState, useEffect, useRef, useCallback } from 'react';
import VaultSetup from './VaultSetup';
import VaultLock from './VaultLock';
import CredentialCard from './CredentialCard';
import CredentialModal from './CredentialModal';
import { encryptPayload, decryptPayload } from '../../utils/vaultCrypto';
import { VAULT_API_URL } from '../../utils/apiConfig';
import { TimerIcon, LockIcon, KeyIcon, ArrowLeftIcon, PlusIcon } from '../Icons';

const AUTO_LOCK_SECONDS = 300; // 5 minutes

export default function PasswordHub({
  onBack,
  apiBaseUrl = VAULT_API_URL,
}) {
  // Vault state: 'loading' | 'uninitialized' | 'locked' | 'unlocked'
  const [vaultState, setVaultState] = useState('loading');
  const [vaultMeta, setVaultMeta] = useState(null);

  // In-Memory ONLY Security State (NEVER written to localStorage, IndexedDB, or cookies)
  const [vaultKey, setVaultKey] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [decryptedItems, setDecryptedItems] = useState([]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(AUTO_LOCK_SECONDS);
  const [errorMessage, setErrorMessage] = useState('');

  // Refs for tracking timer without closure staleness
  const lastActivityRef = useRef(0);
  const autoLockTimerRef = useRef(null);
  const containerRef = useRef(null);

  // 1. Fetch vault initialization status on mount
  const fetchVaultStatus = useCallback(async () => {
    setVaultState('loading');
    setErrorMessage('');
    try {
      const res = await fetch(`${apiBaseUrl}/status`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check vault status.');
      }

      if (!data.isInitialized) {
        setVaultState('uninitialized');
        setVaultMeta(null);
      } else {
        setVaultState('locked');
        setVaultMeta(data);
      }
    } catch (err) {
      console.error('Fetch vault status error:', err);
      setErrorMessage('Unable to connect to the backend vault service. Please ensure the server is running.');
      setVaultState('locked');
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchVaultStatus();
  }, [fetchVaultStatus]);

  // 2. Fetch and decrypt credential items upon successful unlock
  const loadAndDecryptItems = useCallback(async (vk, token) => {
    try {
      const res = await fetch(`${apiBaseUrl}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch vault items.');
      }

      const decrypted = [];
      for (const item of data) {
        try {
          const payload = await decryptPayload(vk, item.ciphertext, item.iv);
          decrypted.push({
            id: item.id,
            created_at: item.created_at,
            updated_at: item.updated_at,
            ...payload,
          });
        } catch (decryptErr) {
          console.error(`Failed to decrypt item ${item.id}:`, decryptErr);
          // Skip or mark corrupted item without crashing
        }
      }

      setDecryptedItems(decrypted);
    } catch (err) {
      console.error('Error loading vault items:', err);
      setErrorMessage(err.message || 'Failed to load credentials.');
    }
  }, [apiBaseUrl]);

  // 3. Lock Vault Function (Zeroization of In-Memory State)
  const lockVault = useCallback(async () => {
    if (sessionToken) {
      // Best-effort session revocation on backend
      try {
        await fetch(`${apiBaseUrl}/lock`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } catch {
        // Ignored
      }
    }

    // Explicitly zero out and drop references to cryptographic keys and decrypted items
    setVaultKey(null);
    setSessionToken(null);
    setDecryptedItems([]);
    setEditingItem(null);
    setIsModalOpen(false);
    setSearchQuery('');
    setVaultState('locked');
  }, [apiBaseUrl, sessionToken]);

  // 4. Inactivity Auto-Lock Timer (5 minutes)
  useEffect(() => {
    if (vaultState !== 'unlocked') {
      if (autoLockTimerRef.current) clearInterval(autoLockTimerRef.current);
      return;
    }

    lastActivityRef.current = Date.now();
    setSecondsRemaining(AUTO_LOCK_SECONDS);

    // Activity reset handler
    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      setSecondsRemaining(AUTO_LOCK_SECONDS);
    };

    const target = containerRef.current || window;
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => target.addEventListener(ev, resetTimer, { passive: true }));

    // Ticking countdown
    autoLockTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, AUTO_LOCK_SECONDS - elapsed);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(autoLockTimerRef.current);
        lockVault();
      }
    }, 1000);

    return () => {
      events.forEach((ev) => target.removeEventListener(ev, resetTimer));
      if (autoLockTimerRef.current) clearInterval(autoLockTimerRef.current);
    };
  }, [vaultState, lockVault]);

  // 5. Successful Unlock Handler
  const handleUnlockSuccess = (vk, token, _expiresAt) => {
    setVaultKey(vk);
    setSessionToken(token);
    setVaultState('unlocked');
    setErrorMessage('');
    loadAndDecryptItems(vk, token);
  };

  // 6. Save Credential (Create or Update)
  const handleSaveCredential = async (payloadObject, originalItem) => {
    if (!vaultKey || !sessionToken) {
      throw new Error('Vault is locked. Please unlock again to save credentials.');
    }

    // Encrypt entire credential object client-side
    const { iv, ciphertext } = await encryptPayload(vaultKey, payloadObject);

    if (originalItem && originalItem.id) {
      // Update existing item
      const res = await fetch(`${apiBaseUrl}/items/${originalItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ iv, ciphertext }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update credential on server.');
      }

      setDecryptedItems((prev) =>
        prev.map((item) =>
          item.id === originalItem.id
            ? { ...item, ...payloadObject, updated_at: data.updated_at }
            : item
        )
      );
    } else {
      // Create new item
      const res = await fetch(`${apiBaseUrl}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ iv, ciphertext }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create credential on server.');
      }

      const newItem = {
        id: data.id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        ...payloadObject,
      };
      setDecryptedItems((prev) => [newItem, ...prev]);
    }
  };

  // 7. Delete Credential
  const handleDeleteCredential = async (id) => {
    if (!window.confirm('Are you sure you want to delete this credential? This action cannot be undone.')) {
      return;
    }
    if (!sessionToken) return;

    try {
      const res = await fetch(`${apiBaseUrl}/items/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete credential.');
      }

      setDecryptedItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Delete credential error:', err);
      alert(err.message || 'Failed to delete credential.');
    }
  };

  // Filtered credentials list based on search and category
  const categoriesList = ['All', ...new Set(decryptedItems.map((i) => i.category || 'General'))];

  const filteredItems = decryptedItems.filter((item) => {
    const matchesCategory = selectedCategory === 'All' || (item.category || 'General') === selectedCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      (item.service_name && item.service_name.toLowerCase().includes(query)) ||
      (item.username && item.username.toLowerCase().includes(query)) ||
      (item.website_url && item.website_url.toLowerCase().includes(query)) ||
      (item.notes && item.notes.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // =========================================================================
  // Render Branching
  // =========================================================================

  if (vaultState === 'loading') {
    return (
      <div className="password-hub-screen">
        <div className="vault-loading-box">
          <div className="vault-spinner" aria-hidden="true" />
          <p>Connecting to secure vault...</p>
        </div>
      </div>
    );
  }

  if (vaultState === 'uninitialized') {
    return (
      <div className="password-hub-screen">
        <div className="password-hub-nav-bar">
          <button type="button" className="btn-back-to-notes" onClick={onBack}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <ArrowLeftIcon size="1rem" /> Back to Notes
            </span>
          </button>
        </div>
        <VaultSetup onSetupSuccess={fetchVaultStatus} apiBaseUrl={apiBaseUrl} />
      </div>
    );
  }

  if (vaultState === 'locked') {
    return (
      <div className="password-hub-screen">
        <div className="password-hub-nav-bar">
          <button type="button" className="btn-back-to-notes" onClick={onBack}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <ArrowLeftIcon size="1rem" /> Back to Notes
            </span>
          </button>
        </div>
        <VaultLock
          vaultMeta={vaultMeta}
          onUnlockSuccess={handleUnlockSuccess}
          onVaultReset={fetchVaultStatus}
          apiBaseUrl={apiBaseUrl}
        />
      </div>
    );
  }

  // Unlocked Dashboard
  return (
    <div className="password-hub-screen" ref={containerRef}>
      {/* Top Navigation & Status Bar */}
      <header className="password-hub-nav-bar">
        <div className="nav-left">
          <button type="button" className="btn-back-to-notes" onClick={onBack}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <ArrowLeftIcon size="1rem" /> Back to Notes
            </span>
          </button>
          <div className="vault-status-indicator">
            <span className="status-dot-unlocked" aria-hidden="true" />
            <span className="status-text">Vault Unlocked</span>
          </div>
        </div>

        <div className="nav-right">
          <div className="auto-lock-countdown" title="Time remaining before automatic vault lock">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <TimerIcon size="1rem" /> Auto-locks in: <strong>{formatTimer(secondsRemaining)}</strong>
            </span>
          </div>
          <button
            type="button"
            className="btn-lock-vault"
            onClick={lockVault}
            title="Lock Password Hub immediately"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <LockIcon size="1rem" /> Lock Vault
            </span>
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="alert-error" role="alert">
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Bar (Search, Category Tabs, Add Button) */}
      <div className="password-hub-action-bar">
        <div className="vault-search-box">
          <input
            type="text"
            placeholder="Search accounts, usernames, or URLs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search stored credentials"
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn-primary-action btn-add-password"
          onClick={() => {
            setEditingItem(null);
            setIsModalOpen(true);
          }}
        >
          <span className="plus-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <PlusIcon size="1rem" />
          </span> Add New Password
        </button>
      </div>

      {/* Category Filter Pills */}
      {categoriesList.length > 1 && (
        <div className="vault-category-tabs" role="tablist" aria-label="Credential Categories">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              className={`vault-category-tab ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Credentials Grid */}
      <main className="credentials-grid" aria-label="Stored Credentials">
        {filteredItems.length === 0 ? (
          <div className="vault-empty-state">
            <div className="empty-icon" aria-hidden="true">
              <KeyIcon size="3rem" />
            </div>
            <h3>{searchQuery ? 'No credentials match your search' : 'No credentials stored yet'}</h3>
            <p>
              {searchQuery
                ? 'Try a different search term or select another category.'
                : 'Click "+ Add New Password" above to securely store your first account login.'}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <CredentialCard
              key={item.id}
              item={item}
              onEdit={(itemToEdit) => {
                setEditingItem(itemToEdit);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteCredential}
            />
          ))
        )}
      </main>

      {/* Add / Edit Credential Modal */}
      <CredentialModal
        isOpen={isModalOpen}
        initialData={editingItem}
        onSave={handleSaveCredential}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
      />
    </div>
  );
}
