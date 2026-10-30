import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultVaultDbPath = path.join(__dirname, 'vault.db');

/**
 * Initializes the Password Hub database schema on a DatabaseSync instance.
 * @param {DatabaseSync} db - SQLite database instance
 */
export function initVaultSchema(db) {
  // 1. Vault metadata (single row with id=1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      client_salt TEXT NOT NULL,
      server_salt TEXT NOT NULL,
      kdf_type TEXT NOT NULL,
      kdf_params TEXT NOT NULL,
      server_verifier TEXT NOT NULL,
      encrypted_vault_key TEXT NOT NULL,
      key_iv TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 2. Encrypted credential items (zero plaintext credential fields)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 3. Vault sessions (stores only cryptographic SHA-256 hashes of bearer tokens)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_sessions (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    )
  `);

  // 4. One-time reset challenges (stores SHA-256 hashes of challenge tokens)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_challenges (
      challenge_token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
}

/**
 * Permanently wipes and reinitializes the vault schema.
 * @param {DatabaseSync} db - SQLite database instance
 */
export function resetVaultDatabase(db) {
  db.exec('DROP TABLE IF EXISTS vault_challenges');
  db.exec('DROP TABLE IF EXISTS vault_sessions');
  db.exec('DROP TABLE IF EXISTS vault_items');
  db.exec('DROP TABLE IF EXISTS vault_meta');
  initVaultSchema(db);
}

/**
 * Creates and initializes a new DatabaseSync connection.
 * @param {string} [customPath] - Path to SQLite database file
 * @returns {DatabaseSync}
 */
export function createVaultDb(customPath = defaultVaultDbPath) {
  const db = new DatabaseSync(customPath);
  initVaultSchema(db);
  return db;
}

const vaultDb = createVaultDb(defaultVaultDbPath);

export default vaultDb;
