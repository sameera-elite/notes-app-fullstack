import express from 'express';
import crypto from 'node:crypto';
import defaultVaultDb, { resetVaultDatabase } from './vaultDb.js';

// In-memory rate limiting and cooldown state
const unlockAttempts = new Map(); // ip -> { count: number, lockedUntil: number }
const resetAttempts = new Map();  // ip -> { count: number, lastResetAt: number, resetHistory: number[] }

const SESSION_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes
const CHALLENGE_LIFETIME_MS = 60 * 1000;     // 60 seconds
const RESET_COOLDOWN_MS = 60 * 1000;         // 60 seconds between reset attempts

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Creates an Express Router for all /api/vault endpoints.
 * @param {import('node:sqlite').DatabaseSync} [db] - SQLite database instance
 * @returns {express.Router}
 */
export function createVaultRouter(db = defaultVaultDb) {
  const router = express.Router();

  // Helper to purge expired sessions lazily
  function cleanupExpiredSessions() {
    try {
      db.prepare('DELETE FROM vault_sessions WHERE expires_at <= ?').run(Date.now());
      db.prepare('DELETE FROM vault_challenges WHERE expires_at <= ?').run(Date.now());
    } catch {
      // Non-critical cleanup
    }
  }

  // =========================================================================
  // Authentication Middleware
  // =========================================================================

  function requireVaultSession(req, res, next) {
    cleanupExpiredSessions();

    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Missing or malformed Authorization header.' });
    }

    const rawToken = authHeader.substring(7).trim();
    if (!rawToken || rawToken.length < 32) {
      return res.status(401).json({ error: 'Invalid session token format.' });
    }

    const tokenHash = hashToken(rawToken);

    try {
      const stmt = db.prepare('SELECT token_hash, expires_at FROM vault_sessions WHERE token_hash = ?');
      const session = stmt.get(tokenHash);

      if (!session) {
        return res.status(401).json({ error: 'Invalid or revoked session. Please unlock the vault again.' });
      }

      if (session.expires_at <= Date.now()) {
        db.prepare('DELETE FROM vault_sessions WHERE token_hash = ?').run(tokenHash);
        return res.status(401).json({ error: 'Session has expired. Please unlock the vault again.' });
      }

      // Refresh last_used_at
      db.prepare('UPDATE vault_sessions SET last_used_at = ? WHERE token_hash = ?').run(Date.now(), tokenHash);

      req.sessionTokenHash = tokenHash;
      next();
    } catch (err) {
      console.error('Session verification error:', err.message);
      res.status(500).json({ error: 'Internal session verification error.' });
    }
  }

  // =========================================================================
  // Public Vault Handshake Endpoints
  // =========================================================================

  // GET /api/vault/status - Public vault status
  router.get('/status', (req, res) => {
    try {
      const meta = db.prepare('SELECT id, client_salt, kdf_type, kdf_params, encrypted_vault_key, key_iv FROM vault_meta WHERE id = 1').get();

      if (!meta) {
        return res.json({
          isInitialized: false,
        });
      }

      let parsedParams = {};
      try {
        parsedParams = JSON.parse(meta.kdf_params);
      } catch {
        parsedParams = {};
      }

      res.json({
        isInitialized: true,
        client_salt: meta.client_salt,
        kdf_type: meta.kdf_type,
        kdf_params: parsedParams,
        encrypted_vault_key: meta.encrypted_vault_key,
        key_iv: meta.key_iv,
      });
    } catch (err) {
      console.error('Vault status error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve vault status.' });
    }
  });

  // POST /api/vault/setup - First-time vault initialization
  router.post('/setup', (req, res) => {
    try {
      const existing = db.prepare('SELECT id FROM vault_meta WHERE id = 1').get();
      if (existing) {
        return res.status(400).json({ error: 'Vault has already been initialized. Use unlock or reset.' });
      }

      const {
        client_salt,
        kdf_type,
        kdf_params,
        client_auth_hash,
        encrypted_vault_key,
        key_iv,
      } = req.body || {};

      // Input validations
      if (!client_salt || typeof client_salt !== 'string' || client_salt.length < 32) {
        return res.status(400).json({ error: 'Valid client salt (hex string >= 32 chars) is required.' });
      }
      if (kdf_type !== 'argon2id') {
        return res.status(400).json({ error: 'kdf_type must be argon2id.' });
      }
      if (!kdf_params || typeof kdf_params !== 'object' || !kdf_params.iterations || !kdf_params.memorySize) {
        return res.status(400).json({ error: 'Valid kdf_params object is required.' });
      }
      if (!client_auth_hash || typeof client_auth_hash !== 'string' || client_auth_hash.length !== 64) {
        return res.status(400).json({ error: 'client_auth_hash must be a 64-character hex string.' });
      }
      if (!encrypted_vault_key || typeof encrypted_vault_key !== 'string') {
        return res.status(400).json({ error: 'encrypted_vault_key must be a non-empty Base64 string.' });
      }
      if (!key_iv || typeof key_iv !== 'string') {
        return res.status(400).json({ error: 'key_iv must be a non-empty Base64 string.' });
      }

      // Generate server-side salt and compute double-hashed verifier:
      // server_verifier = PBKDF2(client_auth_hash, server_salt, 100000, 32, sha256)
      const serverSalt = crypto.randomBytes(16).toString('hex');
      const serverVerifier = crypto.pbkdf2Sync(
        client_auth_hash,
        serverSalt,
        100000,
        32,
        'sha256'
      ).toString('hex');

      const now = new Date().toISOString();
      const insertStmt = db.prepare(`
        INSERT INTO vault_meta (
          id, client_salt, server_salt, kdf_type, kdf_params,
          server_verifier, encrypted_vault_key, key_iv, created_at, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        client_salt,
        serverSalt,
        kdf_type,
        JSON.stringify(kdf_params),
        serverVerifier,
        encrypted_vault_key,
        key_iv,
        now,
        now
      );

      res.status(201).json({
        message: 'Vault initialized successfully.',
        isInitialized: true,
      });
    } catch (err) {
      console.error('Vault setup error:', err.message);
      res.status(500).json({ error: 'Failed to initialize vault.' });
    }
  });

  // POST /api/vault/unlock - Verify ClientAuthHash and issue session token
  router.post('/unlock', (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();

    // Rate-limiting check
    const attemptInfo = unlockAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    if (attemptInfo.lockedUntil > now) {
      const waitSeconds = Math.ceil((attemptInfo.lockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Too many failed unlock attempts. Please wait ${waitSeconds} seconds before trying again.`,
        retryAfter: waitSeconds,
      });
    }

    try {
      const meta = db.prepare('SELECT server_salt, server_verifier FROM vault_meta WHERE id = 1').get();
      if (!meta) {
        return res.status(400).json({ error: 'Vault is not initialized. Please set up a master password first.' });
      }

      const { client_auth_hash } = req.body || {};
      if (!client_auth_hash || typeof client_auth_hash !== 'string' || client_auth_hash.length !== 64) {
        return res.status(400).json({ error: 'client_auth_hash must be a 64-character hex string.' });
      }

      // Compute server verifier using stored server salt
      const computedVerifier = crypto.pbkdf2Sync(
        client_auth_hash,
        meta.server_salt,
        100000,
        32,
        'sha256'
      ).toString('hex');

      // Constant-time comparison
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(computedVerifier, 'hex'),
        Buffer.from(meta.server_verifier, 'hex')
      );

      if (!isMatch) {
        // Increment failed attempts and apply exponential lockout
        attemptInfo.count += 1;
        if (attemptInfo.count >= 5) {
          const lockoutDelayMs = attemptInfo.count >= 8 ? 60000 : (attemptInfo.count >= 6 ? 30000 : 15000);
          attemptInfo.lockedUntil = now + lockoutDelayMs;
        }
        unlockAttempts.set(ip, attemptInfo);

        return res.status(401).json({ error: 'Invalid master password credentials.' });
      }

      // Password matched: reset rate-limiting counter
      unlockAttempts.delete(ip);

      // Generate high-entropy 256-bit bearer token and store its SHA-256 hash
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = now + SESSION_LIFETIME_MS;

      db.prepare(`
        INSERT INTO vault_sessions (token_hash, created_at, expires_at, last_used_at)
        VALUES (?, ?, ?, ?)
      `).run(tokenHash, new Date().toISOString(), expiresAt, now);

      res.json({
        message: 'Vault unlocked successfully.',
        token: rawToken,
        expires_at: expiresAt,
      });
    } catch (err) {
      console.error('Vault unlock error:', err.message);
      res.status(500).json({ error: 'Failed to process unlock request.' });
    }
  });

  // POST /api/vault/lock - Explicit session revocation
  router.post('/lock', requireVaultSession, (req, res) => {
    try {
      db.prepare('DELETE FROM vault_sessions WHERE token_hash = ?').run(req.sessionTokenHash);
      res.json({ message: 'Vault locked successfully and session revoked.' });
    } catch (err) {
      console.error('Vault lock error:', err.message);
      res.status(500).json({ error: 'Failed to revoke vault session.' });
    }
  });

  // =========================================================================
  // Vault Reset Protection (Two-Step Challenge-Response)
  // =========================================================================

  // POST /api/vault/reset-challenge - Request a single-use 60-second reset token
  router.post('/reset-challenge', (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();

    const history = resetAttempts.get(ip) || { count: 0, lastResetAt: 0, resetHistory: [] };
    // Filter history to last hour
    history.resetHistory = history.resetHistory.filter((t) => now - t < 3600000);

    if (history.resetHistory.length >= 3) {
      return res.status(429).json({ error: 'Maximum reset challenge limit reached for this hour. Please try again later.' });
    }
    if (now - history.lastResetAt < RESET_COOLDOWN_MS) {
      const wait = Math.ceil((RESET_COOLDOWN_MS - (now - history.lastResetAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait} seconds before requesting another reset challenge.` });
    }

    try {
      const challengeToken = crypto.randomBytes(32).toString('hex');
      const challengeHash = hashToken(challengeToken);
      const expiresAt = now + CHALLENGE_LIFETIME_MS;

      db.prepare('INSERT INTO vault_challenges (challenge_token_hash, created_at, expires_at) VALUES (?, ?, ?)')
        .run(challengeHash, new Date().toISOString(), expiresAt);

      history.resetHistory.push(now);
      history.lastResetAt = now;
      resetAttempts.set(ip, history);

      res.json({
        challenge_token: challengeToken,
        expires_in_seconds: 60,
        message: 'Reset challenge generated. Supply this token with the confirmation phrase within 60 seconds.',
      });
    } catch (err) {
      console.error('Reset challenge error:', err.message);
      res.status(500).json({ error: 'Failed to generate reset challenge.' });
    }
  });

  // POST /api/vault/reset - Execute permanent vault wipe upon verified challenge + phrase
  router.post('/reset', (req, res) => {
    const { challenge_token, confirmation_phrase } = req.body || {};

    if (!challenge_token || typeof challenge_token !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid reset challenge token.' });
    }

    const challengeHash = hashToken(challenge_token);

    try {
      const challenge = db.prepare('SELECT challenge_token_hash, expires_at FROM vault_challenges WHERE challenge_token_hash = ?').get(challengeHash);

      // Instantly delete challenge so it cannot be re-used under any circumstance
      db.prepare('DELETE FROM vault_challenges WHERE challenge_token_hash = ?').run(challengeHash);

      if (!challenge) {
        return res.status(400).json({ error: 'Invalid or already consumed reset challenge.' });
      }
      if (challenge.expires_at <= Date.now()) {
        return res.status(400).json({ error: 'Reset challenge has expired. Please request a new challenge.' });
      }

      if (confirmation_phrase !== 'PERMANENTLY DELETE') {
        return res.status(400).json({ error: 'confirmation_phrase must equal exact string "PERMANENTLY DELETE".' });
      }

      // Wipe and re-create schema
      resetVaultDatabase(db);

      res.json({
        message: 'Password Hub vault has been permanently reset. All previous credentials destroyed.',
        isInitialized: false,
      });
    } catch (err) {
      console.error('Vault reset error:', err.message);
      res.status(500).json({ error: 'Failed to reset vault database.' });
    }
  });

  // =========================================================================
  // Protected Credential Item CRUD Endpoints
  // =========================================================================

  // GET /api/vault/items - List all encrypted items
  router.get('/items', requireVaultSession, (req, res) => {
    try {
      const stmt = db.prepare('SELECT id, iv, ciphertext, created_at, updated_at FROM vault_items ORDER BY updated_at DESC, id DESC');
      const items = stmt.all();
      res.json(items);
    } catch (err) {
      console.error('Error fetching vault items:', err.message);
      res.status(500).json({ error: 'Failed to fetch vault items.' });
    }
  });

  // POST /api/vault/items - Store a new encrypted item
  router.post('/items', requireVaultSession, (req, res) => {
    try {
      const { iv, ciphertext } = req.body || {};

      if (!iv || typeof iv !== 'string' || iv.trim().length === 0) {
        return res.status(400).json({ error: 'Valid Base64 IV is required.' });
      }
      if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.trim().length === 0) {
        return res.status(400).json({ error: 'Valid Base64 ciphertext is required.' });
      }

      const now = new Date().toISOString();
      const insertStmt = db.prepare('INSERT INTO vault_items (iv, ciphertext, created_at, updated_at) VALUES (?, ?, ?, ?)');
      const result = insertStmt.run(iv.trim(), ciphertext.trim(), now, now);

      const newItem = db.prepare('SELECT id, iv, ciphertext, created_at, updated_at FROM vault_items WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(newItem);
    } catch (err) {
      console.error('Error storing vault item:', err.message);
      res.status(500).json({ error: 'Failed to store vault item.' });
    }
  });

  // PUT /api/vault/items/:id - Update an existing encrypted item
  router.put('/items/:id', requireVaultSession, (req, res) => {
    try {
      const { id } = req.params;
      const itemId = Number(id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid item ID.' });
      }

      const existing = db.prepare('SELECT id FROM vault_items WHERE id = ?').get(itemId);
      if (!existing) {
        return res.status(404).json({ error: 'Vault item not found.' });
      }

      const { iv, ciphertext } = req.body || {};
      if (!iv || typeof iv !== 'string' || iv.trim().length === 0) {
        return res.status(400).json({ error: 'Valid Base64 IV is required.' });
      }
      if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.trim().length === 0) {
        return res.status(400).json({ error: 'Valid Base64 ciphertext is required.' });
      }

      const now = new Date().toISOString();
      const updateStmt = db.prepare('UPDATE vault_items SET iv = ?, ciphertext = ?, updated_at = ? WHERE id = ?');
      updateStmt.run(iv.trim(), ciphertext.trim(), now, itemId);

      const updatedItem = db.prepare('SELECT id, iv, ciphertext, created_at, updated_at FROM vault_items WHERE id = ?').get(itemId);
      res.json(updatedItem);
    } catch (err) {
      console.error('Error updating vault item:', err.message);
      res.status(500).json({ error: 'Failed to update vault item.' });
    }
  });

  // DELETE /api/vault/items/:id - Delete an encrypted item
  router.delete('/items/:id', requireVaultSession, (req, res) => {
    try {
      const { id } = req.params;
      const itemId = Number(id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid item ID.' });
      }

      const existing = db.prepare('SELECT id FROM vault_items WHERE id = ?').get(itemId);
      if (!existing) {
        return res.status(404).json({ error: 'Vault item not found.' });
      }

      db.prepare('DELETE FROM vault_items WHERE id = ?').run(itemId);
      res.json({ message: 'Vault item deleted successfully.', id: itemId });
    } catch (err) {
      console.error('Error deleting vault item:', err.message);
      res.status(500).json({ error: 'Failed to delete vault item.' });
    }
  });

  return router;
}

const defaultVaultRouter = createVaultRouter(defaultVaultDb);
export default defaultVaultRouter;
