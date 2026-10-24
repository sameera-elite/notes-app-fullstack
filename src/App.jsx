import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:5000/api/notes'

function App() {
  const [notes, setNotes] = useState([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // View modal state
  const [viewingNote, setViewingNote] = useState(null)

  // Edit modal state
  const [editingNote, setEditingNote] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [editError, setEditError] = useState('')

  // Fetch all notes on initial load
  const fetchNotes = async () => {
    setIsLoading(true)
    setErrorMessage('')
    try {
      const res = await fetch(API_URL)
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`)
      }
      const data = await res.json()
      setNotes(data)
    } catch (err) {
      console.error('Fetch notes error:', err)
      setErrorMessage('Unable to load notes. Please ensure the backend server is running.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNotes()
  }, [])

  // Create a new note
  const handleCreateNote = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setErrorMessage('Please provide both a title and content for your note.')
      return
    }

    setIsCreating(true)
    setErrorMessage('')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create note (${res.status})`)
      }

      const newNote = await res.json()
      setNotes((prevNotes) => [newNote, ...prevNotes])
      setTitle('')
      setContent('')
    } catch (err) {
      console.error('Create note error:', err)
      setErrorMessage(err.message || 'Could not save note.')
    } finally {
      setIsCreating(false)
    }
  }

  // Delete a note
  const handleDeleteNote = async (id, noteTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${noteTitle}"?`)) {
      return
    }

    try {
      const res = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to delete note (${res.status})`)
      }

      // If currently viewing or editing the deleted note, close the modals
      if (viewingNote && viewingNote.id === id) {
        setViewingNote(null)
      }
      if (editingNote && editingNote.id === id) {
        setEditingNote(null)
      }

      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== id))
    } catch (err) {
      console.error('Delete note error:', err)
      setErrorMessage(err.message || 'Could not delete note.')
    }
  }

  // Open edit modal
  const openEditModal = (note) => {
    setEditingNote(note)
    setEditTitle(note.title)
    setEditContent(note.content)
    setEditError('')
  }

  // Close edit modal
  const closeEditModal = () => {
    setEditingNote(null)
    setEditTitle('')
    setEditContent('')
    setEditError('')
  }

  // Submit edit note
  const handleUpdateNote = async (e) => {
    e.preventDefault()
    if (!editTitle.trim() || !editContent.trim()) {
      setEditError('Title and content cannot be empty.')
      return
    }

    setIsUpdating(true)
    setEditError('')
    try {
      const res = await fetch(`${API_URL}/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to update note (${res.status})`)
      }

      const updated = await res.json()
      setNotes((prevNotes) =>
        prevNotes.map((note) => (note.id === updated.id ? updated : note))
      )

      // If currently viewing this note, update the view modal as well
      if (viewingNote && viewingNote.id === updated.id) {
        setViewingNote(updated)
      }

      closeEditModal()
    } catch (err) {
      console.error('Update note error:', err)
      setEditError(err.message || 'Could not update note.')
    } finally {
      setIsUpdating(false)
    }
  }

  // Format date helper
  const formatDate = (isoString) => {
    if (!isoString) return ''
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>My Notes</h1>
        <p className="app-subtitle">Capture your thoughts, ideas, and reminders</p>
      </header>

      <main className="app-main">
        {errorMessage && (
          <div className="alert-error" role="alert">
            <span>{errorMessage}</span>
            <button
              type="button"
              className="btn-retry"
              onClick={fetchNotes}
            >
              Retry
            </button>
          </div>
        )}

        <section className="note-form-card">
          <h2>Create a New Note</h2>
          <form className="note-form" onSubmit={handleCreateNote}>
            <div className="form-group">
              <label htmlFor="note-title">Title</label>
              <input
                id="note-title"
                type="text"
                placeholder="Enter note title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="form-group">
              <label htmlFor="note-content">Content</label>
              <textarea
                id="note-content"
                rows="4"
                placeholder="Write your note here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <button
              type="submit"
              className="btn-create"
              disabled={isCreating}
            >
              {isCreating ? 'Creating Note...' : 'Create Note'}
            </button>
          </form>
        </section>

        <section className="notes-list-section">
          <div className="notes-header-row">
            <h2>Your Notes</h2>
            {notes.length > 0 && (
              <span className="notes-badge">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="status-message">
              <div className="spinner" aria-hidden="true"></div>
              <span>Loading notes...</span>
            </div>
          ) : notes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">📝</div>
              <h3>No notes yet</h3>
              <p>You have not created any notes. Use the form above to add your first note!</p>
            </div>
          ) : (
            <div className="notes-grid">
              {notes.map((note) => (
                <article
                  key={note.id}
                  className="note-card"
                  onClick={() => setViewingNote(note)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setViewingNote(note)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View note titled ${note.title}`}
                >
                  <div className="note-card-header">
                    <h3 className="note-title">{note.title}</h3>
                    <div
                      className="note-card-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="btn-card-action btn-card-view"
                        onClick={(e) => {
                          e.stopPropagation()
                          setViewingNote(note)
                        }}
                        title="View note"
                        aria-label={`View note titled ${note.title}`}
                      >
                        <span aria-hidden="true">👁</span> View
                      </button>
                      <button
                        type="button"
                        className="btn-card-action btn-card-edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditModal(note)
                        }}
                        title="Edit note"
                        aria-label={`Edit note titled ${note.title}`}
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                      <button
                        type="button"
                        className="btn-card-action btn-card-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteNote(note.id, note.title)
                        }}
                        title="Delete note"
                        aria-label={`Delete note titled ${note.title}`}
                      >
                        <span aria-hidden="true">&times;</span>
                      </button>
                    </div>
                  </div>
                  {note.content && <p className="note-content">{note.content}</p>}
                  <footer className="note-footer">
                    <time className="note-date">
                      {note.updated_at && note.updated_at !== note.created_at
                        ? `Updated ${formatDate(note.updated_at)}`
                        : formatDate(note.created_at)}
                    </time>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* View Note Modal */}
      {viewingNote && (
        <div className="modal-backdrop" onClick={() => setViewingNote(null)}>
          <div
            className="modal-content view-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-modal-title"
          >
            <div className="modal-header">
              <h2 id="view-modal-title" className="view-modal-title">
                {viewingNote.title}
              </h2>
              <button
                type="button"
                className="btn-close"
                onClick={() => setViewingNote(null)}
                aria-label="Close view dialog"
              >
                &times;
              </button>
            </div>

            <div className="view-modal-body">
              <div className="view-note-content">
                {viewingNote.content}
              </div>

              <div className="view-note-metadata">
                <div className="meta-item">
                  <span className="meta-label">Created:</span>
                  <time className="meta-value">{formatDate(viewingNote.created_at)}</time>
                </div>
                {viewingNote.updated_at && viewingNote.updated_at !== viewingNote.created_at && (
                  <div className="meta-item">
                    <span className="meta-label">Last Updated:</span>
                    <time className="meta-value">{formatDate(viewingNote.updated_at)}</time>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-action-view btn-edit-from-view"
                onClick={() => {
                  const noteToEdit = viewingNote
                  setViewingNote(null)
                  openEditModal(noteToEdit)
                }}
              >
                ✎ Edit Note
              </button>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setViewingNote(null)}
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-header">
              <h2 id="modal-title">Edit Note</h2>
              <button
                type="button"
                className="btn-close"
                onClick={closeEditModal}
                aria-label="Close edit dialog"
              >
                &times;
              </button>
            </div>

            {editError && (
              <div className="alert-error" role="alert">
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateNote} className="note-form">
              <div className="form-group">
                <label htmlFor="edit-title">Title</label>
                <input
                  id="edit-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  disabled={isUpdating}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-content">Content</label>
                <textarea
                  id="edit-content"
                  rows="5"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  disabled={isUpdating}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={closeEditModal}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-create"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
