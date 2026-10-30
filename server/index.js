import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import vaultRoutes from './vaultRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 5000;

// Enable reverse proxy trust in production (e.g. Render, Railway, cloud load balancers)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Whitelist configured production frontend origin and local development origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/+$/, '')] : []),
];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, health checks, or mobile clients with no origin header
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// Password Hub Isolated Vault API
app.use('/api/vault', vaultRoutes);

// Configure Multer for secure image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    cb(null, `img_${uniqueSuffix}${safeExt}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Sanitization & Formatting Helpers
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Notes App backend is running',
    timestamp: new Date().toISOString()
  });
});

// POST /api/upload - Upload an image
app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image size exceeds the 10 MB limit.' });
      }
      return res.status(400).json({ error: err.message || 'Failed to upload image' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol;
    const relativeUrl = `/uploads/${req.file.filename}`;
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    res.status(201).json({
      url: fullUrl,
      relativeUrl,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  });
});

// GET /api/notes - List all notes (ordered by pinned first, then updated_at DESC, id DESC)
app.get('/api/notes', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC, id DESC');
    const notes = stmt.all();
    res.json(notes.map(formatNote));
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// GET /api/notes/:id - Get a single note by ID
app.get('/api/notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM notes WHERE id = ?');
    const note = stmt.get(Number(id));

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(formatNote(note));
  } catch (err) {
    console.error('Error fetching note:', err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// POST /api/notes - Create a new note
app.post('/api/notes', (req, res) => {
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

    const stmt = db.prepare(
      'INSERT INTO notes (title, content, category, tags, is_pinned, is_favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      title.trim(),
      content.trim(),
      cleanCategory,
      JSON.stringify(cleanTags),
      cleanPinned,
      cleanFavorite,
      now,
      now
    );

    const newNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(formatNote(newNote));
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// PUT /api/notes/:id - Update an existing note
app.put('/api/notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, tags, is_pinned, is_favorite } = req.body || {};

    const existingNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
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

    const stmt = db.prepare(
      'UPDATE notes SET title = ?, content = ?, category = ?, tags = ?, is_pinned = ?, is_favorite = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(
      title.trim(),
      content.trim(),
      cleanCategory,
      JSON.stringify(cleanTags),
      cleanPinned,
      cleanFavorite,
      now,
      Number(id)
    );

    const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    res.json(formatNote(updatedNote));
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// PATCH /api/notes/:id/pin - Toggle or set pin status
app.patch('/api/notes/:id/pin', (req, res) => {
  try {
    const { id } = req.params;
    const { is_pinned } = req.body || {};

    const existingNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const nextPinned = is_pinned !== undefined
      ? (Boolean(is_pinned) ? 1 : 0)
      : (existingNote.is_pinned ? 0 : 1);

    db.prepare('UPDATE notes SET is_pinned = ? WHERE id = ?').run(
      nextPinned,
      Number(id)
    );

    const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    res.json(formatNote(updatedNote));
  } catch (err) {
    console.error('Error toggling pin status:', err);
    res.status(500).json({ error: 'Failed to toggle pin status' });
  }
});

// PATCH /api/notes/:id/favorite - Toggle or set favorite status
app.patch('/api/notes/:id/favorite', (req, res) => {
  try {
    const { id } = req.params;
    const { is_favorite } = req.body || {};

    const existingNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const nextFavorite = is_favorite !== undefined
      ? (Boolean(is_favorite) ? 1 : 0)
      : (existingNote.is_favorite ? 0 : 1);

    // Note: Do not modify updated_at, created_at, title, content, category, tags, or is_pinned
    db.prepare('UPDATE notes SET is_favorite = ? WHERE id = ?').run(
      nextFavorite,
      Number(id)
    );

    const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    res.json(formatNote(updatedNote));
  } catch (err) {
    console.error('Error toggling favorite status:', err);
    res.status(500).json({ error: 'Failed to toggle favorite status' });
  }
});

// DELETE /api/notes/:id - Delete a note by ID
app.delete('/api/notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existingNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    db.prepare('DELETE FROM notes WHERE id = ?').run(Number(id));
    res.json({ message: 'Note deleted successfully', id: Number(id) });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
