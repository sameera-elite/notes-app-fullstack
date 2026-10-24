import express from 'express';
import cors from 'cors';
import db from './db.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Notes App backend is running',
    timestamp: new Date().toISOString()
  });
});

// GET /api/notes - List all notes
app.get('/api/notes', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM notes ORDER BY id DESC');
    const notes = stmt.all();
    res.json(notes);
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

    res.json(note);
  } catch (err) {
    console.error('Error fetching note:', err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// POST /api/notes - Create a new note
app.post('/api/notes', (req, res) => {
  try {
    const { title, content } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(
      'INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(title.trim(), content.trim(), now, now);

    const newNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newNote);
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// PUT /api/notes/:id - Update an existing note
app.put('/api/notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body || {};

    const existingNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(
      'UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(title.trim(), content.trim(), now, Number(id));

    const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id));
    res.json(updatedNote);
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: 'Failed to update note' });
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
