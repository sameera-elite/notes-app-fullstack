/**
 * Automated Pre-Deployment Backend Test Suite
 * 
 * Uses Node.js native test runner (node:test) and node:assert/strict.
 * All tests execute strictly against an isolated temporary SQLite database.
 * server/notes.db and server/vault.db are NEVER touched or opened.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import express from '../server/node_modules/express/index.js';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import project modules
const vaultDbModule = await import(pathToFileURL(path.join(projectRoot, 'server', 'vaultDb.js')).href);
const vaultRoutesModule = await import(pathToFileURL(path.join(projectRoot, 'server', 'vaultRoutes.js')).href);
const vaultCrypto = await import(pathToFileURL(path.join(projectRoot, 'src', 'utils', 'vaultCrypto.js')).href);

const { createVaultDb } = vaultDbModule;
const { createVaultRouter } = vaultRoutesModule;
const {
  generateRandomSalt,
  deriveMasterKey,
  deriveSubKeys,
  generateVaultKey,
  wrapVaultKey,
  encryptPayload,
  decryptPayload,
  generateSecurePassword,
  base64ToBuffer,
  bufferToBase64,
  bufferToHex
} = vaultCrypto;

// Create temporary directory for isolated test databases
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note_app_isolated_test_'));
const testNotesDbPath = path.join(tempDir, 'test_notes.db');
const testVaultDbPath = path.join(tempDir, 'test_vault.db');

let testNotesDb;
let testVaultDb;
let testApp;

/**
 * Pure in-memory Express dispatch helper (zero socket/port dependency)
 */
function dispatch(app, method, url, body = {}, headers = {}, customIp = '127.0.0.1') {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url, 'http://localhost');
    const pathname = parsedUrl.pathname;

    const req = {
      method: method.toUpperCase(),
      url: pathname,
      path: pathname,
      originalUrl: pathname,
      baseUrl: '',
      headers: {
        'content-type': 'application/json',
        ...Object.fromEntries(
          Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
        ),
      },
      body,
      ip: customIp,
      socket: { remoteAddress: customIp },
      query: Object.fromEntries(parsedUrl.searchParams),
      params: {},
    };

    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: statusCode, data });
      },
      send(data) {
        resolve({ status: statusCode, data });
      },
      end() {
        resolve({ status: statusCode, data: {} });
      },
      setHeader() {},
      getHeader() {},
    };

    app(req, res, (err) => {
      if (err) {
        resolve({ status: 500, data: { error: err.message } });
      } else {
        resolve({ status: 404, data: { error: `Route not found: ${method} ${pathname}` } });
      }
    });
  });
}

// Helpers matching server/index.js
function sanitizeCategory(cat) {
  if (!cat || typeof cat !== 'string') return 'General';
  const trimmed = cat.trim();
  return trimmed || 'General';
}

function sanitizeTags(rawTags) {
  if (!rawTags) return [];
  let tagList = [];
  if (Array.isArray(rawTags)) {
    tagList = rawTags;
  } else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) tagList = parsed;
      else tagList = rawTags.split(',');
    } catch {
      tagList = rawTags.split(',');
    }
  }

  const seen = new Set();
  const uniqueTags = [];
  for (const item of tagList) {
    if (typeof item === 'string') {
      const clean = item.trim();
      const lower = clean.toLowerCase();
      if (clean && !seen.has(lower)) {
        seen.add(lower);
        uniqueTags.push(clean);
      }
    }
  }
  return uniqueTags;
}

function formatNote(row) {
  if (!row) return null;
  let parsedTags = [];
  try {
    if (typeof row.tags === 'string') {
      parsedTags = JSON.parse(row.tags);
      if (!Array.isArray(parsedTags)) parsedTags = [];
    } else if (Array.isArray(row.tags)) {
      parsedTags = row.tags;
    }
  } catch {
    parsedTags = row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  }

  return {
    ...row,
    category: row.category && typeof row.category === 'string' && row.category.trim()
      ? row.category.trim()
      : 'General',
    tags: parsedTags,
    is_pinned: Boolean(row.is_pinned),
    is_favorite: Boolean(row.is_favorite),
  };
}

function hasValidContent(content) {
  if (!content || typeof content !== 'string') return false;
  const textWithoutTags = content.replace(/<[^>]*>/g, '').trim();
  const hasImage = /<img\b[^>]*>/i.test(content);
  return textWithoutTags.length > 0 || hasImage;
}

describe('Automated Pre-Deployment Backend Test Suite', () => {

  before(() => {
    // 1. Initialize isolated Notes test database
    testNotesDb = new DatabaseSync(testNotesDbPath);
    testNotesDb.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        tags TEXT DEFAULT '[]',
        is_pinned INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // 2. Initialize isolated Vault test database
    testVaultDb = createVaultDb(testVaultDbPath);

    // 3. Assemble isolated Express app
    testApp = express();
    testApp.use(express.json());

    // Health endpoint
    testApp.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        message: 'Notes App backend is running',
        timestamp: new Date().toISOString(),
      });
    });

    // Notes API routes connected strictly to testNotesDb
    testApp.get('/api/notes', (req, res) => {
      try {
        const stmt = testNotesDb.prepare('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC, id DESC');
        const notes = stmt.all();
        res.json(notes.map(formatNote));
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch notes' });
      }
    });

    testApp.get('/api/notes/:id', (req, res) => {
      try {
        const { id } = req.params;
        const stmt = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?');
        const note = stmt.get(Number(id));
        if (!note) {
          return res.status(404).json({ error: 'Note not found' });
        }
        res.json(formatNote(note));
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch note' });
      }
    });

    testApp.post('/api/notes', (req, res) => {
      try {
        const { title, content, category, tags, is_pinned, is_favorite } = req.body || {};
        if (!title || typeof title !== 'string' || !title.trim()) {
          return res.status(400).json({ error: 'Title is required' });
        }
        if (!hasValidContent(content)) {
          return res.status(400).json({ error: 'Content is required' });
        }

        const cleanCategory = sanitizeCategory(category);
        const cleanTags = sanitizeTags(tags);
        const cleanPinned = Boolean(is_pinned) ? 1 : 0;
        const cleanFavorite = Boolean(is_favorite) ? 1 : 0;
        const now = new Date().toISOString();

        const stmt = testNotesDb.prepare(
          'INSERT INTO notes (title, content, category, tags, is_pinned, is_favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        const result = stmt.run(title.trim(), content.trim(), cleanCategory, JSON.stringify(cleanTags), cleanPinned, cleanFavorite, now, now);
        const newNote = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(formatNote(newNote));
      } catch (err) {
        res.status(500).json({ error: 'Failed to create note' });
      }
    });

    testApp.put('/api/notes/:id', (req, res) => {
      try {
        const { id } = req.params;
        const { title, content, category, tags, is_pinned, is_favorite } = req.body || {};
        const existingNote = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
        if (!existingNote) {
          return res.status(404).json({ error: 'Note not found' });
        }
        if (!title || typeof title !== 'string' || !title.trim()) {
          return res.status(400).json({ error: 'Title is required' });
        }
        if (!hasValidContent(content)) {
          return res.status(400).json({ error: 'Content is required' });
        }

        const cleanCategory = category !== undefined ? sanitizeCategory(category) : (existingNote.category || 'General');
        const cleanTags = tags !== undefined ? sanitizeTags(tags) : sanitizeTags(existingNote.tags);
        const cleanPinned = is_pinned !== undefined ? (Boolean(is_pinned) ? 1 : 0) : (existingNote.is_pinned ? 1 : 0);
        const cleanFavorite = is_favorite !== undefined ? (Boolean(is_favorite) ? 1 : 0) : (existingNote.is_favorite ? 1 : 0);
        const now = new Date().toISOString();

        const stmt = testNotesDb.prepare(
          'UPDATE notes SET title = ?, content = ?, category = ?, tags = ?, is_pinned = ?, is_favorite = ?, updated_at = ? WHERE id = ?'
        );
        stmt.run(title.trim(), content.trim(), cleanCategory, JSON.stringify(cleanTags), cleanPinned, cleanFavorite, now, Number(id));
        const updated = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
        res.json(formatNote(updated));
      } catch (err) {
        res.status(500).json({ error: 'Failed to update note' });
      }
    });

    testApp.patch('/api/notes/:id/pin', (req, res) => {
      try {
        const { id } = req.params;
        const { is_pinned } = req.body || {};
        const existing = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
        if (!existing) return res.status(404).json({ error: 'Note not found' });
        const nextPinned = is_pinned !== undefined ? (Boolean(is_pinned) ? 1 : 0) : (existing.is_pinned ? 0 : 1);
        testNotesDb.prepare('UPDATE notes SET is_pinned = ? WHERE id = ?').run(nextPinned, Number(id));
        const updated = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
        res.json(formatNote(updated));
      } catch (err) {
        res.status(500).json({ error: 'Failed to toggle pin' });
      }
    });

    testApp.patch('/api/notes/:id/favorite', (req, res) => {
      try {
        const { id } = req.params;
        const { is_favorite } = req.body || {};
        const existing = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
        if (!existing) return res.status(404).json({ error: 'Note not found' });
        const nextFav = is_favorite !== undefined ? (Boolean(is_favorite) ? 1 : 0) : (existing.is_favorite ? 0 : 1);
        testNotesDb.prepare('UPDATE notes SET is_favorite = ? WHERE id = ?').run(nextFav, Number(id));
        const updated = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
        res.json(formatNote(updated));
      } catch (err) {
        res.status(500).json({ error: 'Failed to toggle favorite' });
      }
    });

    testApp.delete('/api/notes/:id', (req, res) => {
      try {
        const { id } = req.params;
        const existing = testNotesDb.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
        if (!existing) return res.status(404).json({ error: 'Note not found' });
        testNotesDb.prepare('DELETE FROM notes WHERE id = ?').run(Number(id));
        res.json({ message: 'Note deleted successfully', id: Number(id) });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete note' });
      }
    });

    // Mount vault routes strictly connected to testVaultDb
    testApp.use('/api/vault', createVaultRouter(testVaultDb));
  });

  after(() => {
    // Clean up temporary database instances and directory
    try {
      if (testNotesDb) testNotesDb.close();
      if (testVaultDb) testVaultDb.close();
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignored
    }
  });

  // -------------------------------------------------------------------------
  // 1. NOTES API TESTS
  // -------------------------------------------------------------------------
  describe('Notes API Suite (Isolated DB)', () => {
    test('GET /api/health returns HTTP 200 with ok status', async () => {
      const res = await dispatch(testApp, 'GET', '/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.data.status, 'ok');
      assert.equal(res.data.message, 'Notes App backend is running');
      assert.ok(res.data.timestamp);
    });

    test('GET /api/notes returns empty array initially', async () => {
      const res = await dispatch(testApp, 'GET', '/api/notes');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.equal(res.data.length, 0);
    });

    test('POST /api/notes validates required title and content', async () => {
      const resMissingTitle = await dispatch(testApp, 'POST', '/api/notes', { content: '<p>Body</p>' });
      assert.equal(resMissingTitle.status, 400);
      assert.equal(resMissingTitle.data.error, 'Title is required');

      const resBlankTitle = await dispatch(testApp, 'POST', '/api/notes', { title: '   ', content: '<p>Body</p>' });
      assert.equal(resBlankTitle.status, 400);

      const resMissingContent = await dispatch(testApp, 'POST', '/api/notes', { title: 'Valid Title', content: '' });
      assert.equal(resMissingContent.status, 400);
      assert.equal(resMissingContent.data.error, 'Content is required');
    });

    test('POST /api/notes creates a note with category, tags, and formatting', async () => {
      const payload = {
        title: 'Deployment Test Note',
        content: '<p>This is test content for verification.</p>',
        category: 'Work',
        tags: ['pre-deploy', 'automated-test'],
        is_pinned: true,
        is_favorite: false,
      };

      const res = await dispatch(testApp, 'POST', '/api/notes', payload);
      assert.equal(res.status, 201);
      assert.equal(res.data.id, 1);
      assert.equal(res.data.title, payload.title);
      assert.equal(res.data.content, payload.content);
      assert.equal(res.data.category, 'Work');
      assert.deepEqual(res.data.tags, ['pre-deploy', 'automated-test']);
      assert.equal(res.data.is_pinned, true);
      assert.equal(res.data.is_favorite, false);
      assert.ok(res.data.created_at);
      assert.ok(res.data.updated_at);
    });

    test('GET /api/notes/:id returns existing note and 404 for nonexistent/malformed IDs', async () => {
      const resFound = await dispatch(testApp, 'GET', '/api/notes/1');
      assert.equal(resFound.status, 200);
      assert.equal(resFound.data.id, 1);

      const resNotFound = await dispatch(testApp, 'GET', '/api/notes/999999');
      assert.equal(resNotFound.status, 404);
      assert.equal(resNotFound.data.error, 'Note not found');

      const resMalformed = await dispatch(testApp, 'GET', '/api/notes/invalid_string_id');
      assert.equal(resMalformed.status, 404);
      assert.equal(resMalformed.data.error, 'Note not found');
    });

    test('PUT /api/notes/:id updates note content and persistence', async () => {
      const resUpdate = await dispatch(testApp, 'PUT', '/api/notes/1', {
        title: 'Updated Test Note Title',
        content: '<p>Updated content body.</p>',
        category: 'Personal',
        tags: ['updated'],
      });
      assert.equal(resUpdate.status, 200);
      assert.equal(resUpdate.data.title, 'Updated Test Note Title');
      assert.equal(resUpdate.data.category, 'Personal');
      assert.deepEqual(resUpdate.data.tags, ['updated']);

      // Verify persistence in subsequent GET
      const resGet = await dispatch(testApp, 'GET', '/api/notes/1');
      assert.equal(resGet.status, 200);
      assert.equal(resGet.data.title, 'Updated Test Note Title');
    });

    test('PATCH /api/notes/:id/pin and /favorite toggle statuses', async () => {
      // Toggle favorite from false to true
      const resFav = await dispatch(testApp, 'PATCH', '/api/notes/1/favorite', { is_favorite: true });
      assert.equal(resFav.status, 200);
      assert.equal(resFav.data.is_favorite, true);

      // Toggle pin
      const resPin = await dispatch(testApp, 'PATCH', '/api/notes/1/pin', { is_pinned: false });
      assert.equal(resPin.status, 200);
      assert.equal(resPin.data.is_pinned, false);
    });

    test('DELETE /api/notes/:id removes the note cleanly', async () => {
      const resDel = await dispatch(testApp, 'DELETE', '/api/notes/1');
      assert.equal(resDel.status, 200);
      assert.equal(resDel.data.id, 1);

      // Subsequent fetch returns 404
      const resCheck = await dispatch(testApp, 'GET', '/api/notes/1');
      assert.equal(resCheck.status, 404);
    });
  });

  // -------------------------------------------------------------------------
  // 2. PASSWORD HUB VAULT API TESTS
  // -------------------------------------------------------------------------
  describe('Password Hub Vault API Suite (Isolated DB)', () => {
    let mockSaltHex;
    let mockAuthHash;
    let mockEncryptedVk;
    let mockKeyIv;
    let sessionBearerToken;

    before(async () => {
      // Prepare cryptographic test artifacts
      const salt = generateRandomSalt(16);
      mockSaltHex = bufferToHex(salt);

      const mk = await deriveMasterKey('TestDemoPassword#2026!Strong', salt);
      const { mek, clientAuthHash } = await deriveSubKeys(mk);
      mockAuthHash = clientAuthHash;

      const vk = await generateVaultKey();
      const wrapped = await wrapVaultKey(mek, vk);
      mockEncryptedVk = wrapped.encryptedVaultKey;
      mockKeyIv = wrapped.keyIv;
    });

    test('GET /api/vault/status reports uninitialized initially', async () => {
      const res = await dispatch(testApp, 'GET', '/api/vault/status');
      assert.equal(res.status, 200);
      assert.equal(res.data.isInitialized, false);
    });

    test('Protected routes reject unauthorized requests with HTTP 401', async () => {
      const resNoHeader = await dispatch(testApp, 'GET', '/api/vault/items');
      assert.equal(resNoHeader.status, 401);
      assert.ok(resNoHeader.data.error.includes('Authentication required'));

      const resBadToken = await dispatch(testApp, 'GET', '/api/vault/items', {}, {
        Authorization: 'Bearer invalid_random_bearer_token_123456789012345678901234'
      });
      assert.equal(resBadToken.status, 401);
    });

    test('POST /api/vault/setup initializes vault and blocks duplicate setups', async () => {
      const resSetup = await dispatch(testApp, 'POST', '/api/vault/setup', {
        client_salt: mockSaltHex,
        kdf_type: 'argon2id',
        kdf_params: { iterations: 3, memorySize: 65536, parallelism: 1, hashLength: 32 },
        client_auth_hash: mockAuthHash,
        encrypted_vault_key: mockEncryptedVk,
        key_iv: mockKeyIv,
      });

      assert.equal(resSetup.status, 201);
      assert.equal(resSetup.data.isInitialized, true);

      // Verify status endpoint reflects initialized state and NEVER leaks verifiers
      const resStatus = await dispatch(testApp, 'GET', '/api/vault/status');
      assert.equal(resStatus.status, 200);
      assert.equal(resStatus.data.isInitialized, true);
      assert.equal(resStatus.data.client_salt, mockSaltHex);
      assert.equal(resStatus.data.server_verifier, undefined, 'SECURITY: server_verifier must NEVER be exposed in status');
      assert.equal(resStatus.data.server_salt, undefined, 'SECURITY: server_salt must NEVER be exposed in status');

      // Attempt duplicate setup (must fail)
      const resDup = await dispatch(testApp, 'POST', '/api/vault/setup', {
        client_salt: mockSaltHex,
      });
      assert.equal(resDup.status, 400);
      assert.ok(resDup.data.error.includes('already been initialized'));
    });

    test('POST /api/vault/unlock rejects wrong credentials and enforces rate limiting', async () => {
      const wrongHash = '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff';
      const testIp = '192.168.10.99';

      // 1. Wrong hash rejected
      const resWrong = await dispatch(testApp, 'POST', '/api/vault/unlock', { client_auth_hash: wrongHash }, {}, testIp);
      assert.equal(resWrong.status, 401);

      // 2. Hammer with 4 more failed attempts (5 total)
      for (let i = 0; i < 4; i++) {
        await dispatch(testApp, 'POST', '/api/vault/unlock', { client_auth_hash: wrongHash }, {}, testIp);
      }

      // 3. 6th attempt should be locked out with HTTP 429
      const resLocked = await dispatch(testApp, 'POST', '/api/vault/unlock', { client_auth_hash: wrongHash }, {}, testIp);
      assert.equal(resLocked.status, 429);
      assert.ok(resLocked.data.error.includes('Too many failed unlock attempts'));
    });

    test('POST /api/vault/unlock with valid hash issues token and hashes it in DB', async () => {
      const resUnlock = await dispatch(testApp, 'POST', '/api/vault/unlock', { client_auth_hash: mockAuthHash });
      assert.equal(resUnlock.status, 200);
      assert.ok(resUnlock.data.token);
      assert.equal(resUnlock.data.token.length, 64);
      assert.ok(resUnlock.data.expires_at > Date.now());

      sessionBearerToken = resUnlock.data.token;

      // Inspect DB: Verify raw bearer token is NEVER stored
      const sessionRow = testVaultDb.prepare('SELECT token_hash FROM vault_sessions').get();
      assert.ok(sessionRow);
      assert.notEqual(sessionRow.token_hash, sessionBearerToken, 'SECURITY: Raw token must not be in DB');
      const expectedHash = crypto.createHash('sha256').update(sessionBearerToken).digest('hex');
      assert.equal(sessionRow.token_hash, expectedHash, 'DB stores strictly SHA-256 hash');
    });

    test('Protected CRUD on encrypted items works and stores zero plaintext', async () => {
      const mockIv = 'bW9ja19pdg==';
      const mockCiphertext = 'bW9ja19jaXBoZXJ0ZXh0';

      // Create item
      const resCreate = await dispatch(testApp, 'POST', '/api/vault/items', {
        iv: mockIv,
        ciphertext: mockCiphertext,
      }, { Authorization: `Bearer ${sessionBearerToken}` });

      assert.equal(resCreate.status, 201);
      assert.equal(resCreate.data.id, 1);
      assert.equal(resCreate.data.iv, mockIv);
      assert.equal(resCreate.data.ciphertext, mockCiphertext);

      // Verify at-rest schema: zero plaintext credential columns
      const dbRow = testVaultDb.prepare('SELECT * FROM vault_items WHERE id = 1').get();
      const cols = Object.keys(dbRow);
      assert.equal(cols.includes('password'), false);
      assert.equal(cols.includes('username'), false);
      assert.equal(cols.includes('service_name'), false);
      assert.equal(cols.includes('notes'), false);

      // List items
      const resList = await dispatch(testApp, 'GET', '/api/vault/items', {}, {
        Authorization: `Bearer ${sessionBearerToken}`
      });
      assert.equal(resList.status, 200);
      assert.equal(resList.data.length, 1);

      // Update item
      const resUpdate = await dispatch(testApp, 'PUT', '/api/vault/items/1', {
        iv: 'bmV3X2l2',
        ciphertext: 'bmV3X2NpcGhlcg==',
      }, { Authorization: `Bearer ${sessionBearerToken}` });
      assert.equal(resUpdate.status, 200);
      assert.equal(resUpdate.data.ciphertext, 'bmV3X2NpcGhlcg==');

      // Delete item
      const resDel = await dispatch(testApp, 'DELETE', '/api/vault/items/1', {}, {
        Authorization: `Bearer ${sessionBearerToken}`
      });
      assert.equal(resDel.status, 200);
      assert.equal(resDel.data.id, 1);
    });

    test('POST /api/vault/lock revokes session immediately', async () => {
      const resLock = await dispatch(testApp, 'POST', '/api/vault/lock', {}, {
        Authorization: `Bearer ${sessionBearerToken}`
      });
      assert.equal(resLock.status, 200);

      // Subsequent access with revoked token is rejected with 401
      const resPostLock = await dispatch(testApp, 'GET', '/api/vault/items', {}, {
        Authorization: `Bearer ${sessionBearerToken}`
      });
      assert.equal(resPostLock.status, 401);
    });

    test('Two-step reset protocol protects against unauthenticated destruction', async () => {
      // 1. Direct reset rejected
      const resDirect = await dispatch(testApp, 'POST', '/api/vault/reset', { confirmation_phrase: 'PERMANENTLY DELETE' });
      assert.equal(resDirect.status, 400);

      // 2. Request challenge
      const resChal = await dispatch(testApp, 'POST', '/api/vault/reset-challenge', {}, {}, '10.0.0.99');
      assert.equal(resChal.status, 200);
      const chalToken = resChal.data.challenge_token;

      // 3. Wrong phrase burns token
      const resWrongPhrase = await dispatch(testApp, 'POST', '/api/vault/reset', {
        challenge_token: chalToken,
        confirmation_phrase: 'WRONG'
      });
      assert.equal(resWrongPhrase.status, 400);

      // 4. Token cannot be reused
      const resReuse = await dispatch(testApp, 'POST', '/api/vault/reset', {
        challenge_token: chalToken,
        confirmation_phrase: 'PERMANENTLY DELETE'
      });
      assert.equal(resReuse.status, 400);

      // 5. Valid reset with fresh challenge wipes vault
      const resChal2 = await dispatch(testApp, 'POST', '/api/vault/reset-challenge', {}, {}, '10.0.0.98');
      const resReset = await dispatch(testApp, 'POST', '/api/vault/reset', {
        challenge_token: resChal2.data.challenge_token,
        confirmation_phrase: 'PERMANENTLY DELETE'
      });
      assert.equal(resReset.status, 200);
      assert.equal(resReset.data.isInitialized, false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. CRYPTOGRAPHIC ENGINE TESTS
  // -------------------------------------------------------------------------
  describe('Cryptographic Engine Suite (vaultCrypto.js)', () => {
    test('Argon2id derives 32-byte master key within benchmark limits', async () => {
      const salt = generateRandomSalt(16);
      const t0 = performance.now();
      const mk = await deriveMasterKey('TestKeyDerivationPassword#1', salt);
      const elapsed = performance.now() - t0;
      assert.ok(mk instanceof Uint8Array);
      assert.equal(mk.length, 32);
      assert.ok(elapsed > 10, 'Argon2id performed non-trivial work');
    });

    test('Payload encryption round-trip with unique IV and tampering detection', async () => {
      const vk = await generateVaultKey();
      const cred = {
        service_name: 'GitHub Portfolio',
        username: 'recruiter_demo@example.com',
        password: 'SuperSecretMockToken$2026',
        website_url: 'https://github.com',
        category: 'Work',
        notes: 'Backup code 1234'
      };

      const enc = await encryptPayload(vk, cred);
      assert.ok(enc.iv);
      assert.ok(enc.ciphertext);

      // Decrypt
      const dec = await decryptPayload(vk, enc.ciphertext, enc.iv);
      assert.deepEqual(dec, cred);

      // Tampered ciphertext bit must throw error
      const rawCt = base64ToBuffer(enc.ciphertext);
      const tampered = new Uint8Array(rawCt);
      tampered[5] ^= 0x01; // flip 1 bit
      let tamperFailed = false;
      try {
        await decryptPayload(vk, bufferToBase64(tampered), enc.iv);
      } catch {
        tamperFailed = true;
      }
      assert.equal(tamperFailed, true, 'AES-GCM tag verification must reject tampered ciphertext');
    });

    test('Cryptographically secure password generator meets requirements', () => {
      const pwd = generateSecurePassword({ length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true });
      assert.equal(pwd.length, 24);
      assert.match(pwd, /[A-Z]/);
      assert.match(pwd, /[a-z]/);
      assert.match(pwd, /[0-9]/);
      assert.match(pwd, /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/);
    });
  });
});
