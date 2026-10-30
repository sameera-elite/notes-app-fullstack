import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'notes.db');
const db = new DatabaseSync(dbPath);

// Initialize notes table
db.exec(`
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

// Safe backward-compatible migration for existing databases
const tableInfo = db.prepare('PRAGMA table_info(notes)').all();
const existingColumns = tableInfo.map((col) => col.name);

if (!existingColumns.includes('category')) {
  db.exec("ALTER TABLE notes ADD COLUMN category TEXT DEFAULT 'General'");
}

if (!existingColumns.includes('tags')) {
  db.exec("ALTER TABLE notes ADD COLUMN tags TEXT DEFAULT '[]'");
}

if (!existingColumns.includes('is_pinned')) {
  db.exec("ALTER TABLE notes ADD COLUMN is_pinned INTEGER DEFAULT 0");
}

if (!existingColumns.includes('is_favorite')) {
  db.exec("ALTER TABLE notes ADD COLUMN is_favorite INTEGER DEFAULT 0");
}

export default db;
