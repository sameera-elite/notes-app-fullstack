import { useState, useEffect } from 'react'
import notevaultLogo from './assets/notevault-logo.png'
import RichTextEditor from './components/RichTextEditor'
import PasswordHub from './components/PasswordHub/PasswordHub'
import {
  sanitizeNoteHtml,
  getPlainTextSnippet,
  hasImageAttachment
} from './utils/richText'
import { NOTES_API_URL } from './utils/apiConfig'
import {
  NoteIcon,
  SettingsIcon,
  LockIcon,
  PinIcon,
  StarIcon,
  SearchIcon,
  ImageIcon,
  EditIcon,
  TrashIcon,
  CheckIcon,
  SunIcon,
  MoonIcon,
  FlowerIcon,
  LeafIcon,
  MonitorIcon,
  EmptyNotesIllustration,
  EmptyFavoritesIllustration,
  EmptySearchIllustration,
  PlusIcon,
  InfoIcon,
} from './components/Icons'
import './App.css'

const API_URL = NOTES_API_URL

// Helper to sort notes: pinned notes first, then updated_at DESC, with id DESC as tie-breaker
const sortNotes = (list) => {
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => {
    const pinA = Boolean(a.is_pinned)
    const pinB = Boolean(b.is_pinned)
    if (pinA !== pinB) {
      return pinA ? -1 : 1
    }
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime()
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime()
    if (timeB !== timeA) {
      return timeB - timeA
    }
    return Number(b.id) - Number(a.id)
  })
}

function App() {
  const [notes, setNotes] = useState([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('General')
  const [tagsInput, setTagsInput] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [currentView, setCurrentView] = useState('notes') // 'notes' | 'password-hub'

  // Theme state: 'system' | 'light' | 'dark' | 'dark-floral' | 'white-floral'
  const [themePreference, setThemePreference] = useState(() => {
    try {
      const saved = localStorage.getItem('notes_app_theme')
      const validThemes = ['light', 'dark', 'system', 'dark-floral', 'white-floral']
      return validThemes.includes(saved) ? saved : 'system'
    } catch {
      return 'system'
    }
  })
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'favorites'

  // View modal state
  const [viewingNote, setViewingNote] = useState(null)

  // Edit modal state
  const [editingNote, setEditingNote] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState('General')
  const [editTagsInput, setEditTagsInput] = useState('')
  const [editIsPinned, setEditIsPinned] = useState(false)
  const [editIsFavorite, setEditIsFavorite] = useState(false)
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
      setNotes(sortNotes(data))
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

  // Listen to device/browser color scheme changes in real-time
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => {
      setSystemIsDark(e.matches)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Resolve active visual theme
  const resolvedTheme =
    themePreference === 'system' ? (systemIsDark ? 'dark' : 'light') : themePreference

  // Apply resolved theme attribute and sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('notes_app_theme', themePreference)
    } catch (err) {
      console.warn('Could not persist theme to localStorage:', err)
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    document.documentElement.style.colorScheme =
      resolvedTheme === 'dark' || resolvedTheme === 'dark-floral' ? 'dark' : 'light'
  }, [themePreference, resolvedTheme])

  // Create a new note
  const handleCreateNote = async (e) => {
    e.preventDefault()
    const plainSnippet = getPlainTextSnippet(content)
    const hasImage = hasImageAttachment(content)
    if (!title.trim() || (!plainSnippet && !hasImage)) {
      setErrorMessage('Please provide both a title and content for your note.')
      return
    }

    setIsCreating(true)
    setErrorMessage('')
    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category: category.trim() || 'General',
          tags: parsedTags,
          is_pinned: isPinned,
          is_favorite: isFavorite,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create note (${res.status})`)
      }

      const newNote = await res.json()
      setNotes((prevNotes) => sortNotes([newNote, ...prevNotes]))
      setTitle('')
      setContent('')
      setCategory('General')
      setTagsInput('')
      setIsPinned(false)
      setIsFavorite(false)
      setIsFormOpen(false)
    } catch (err) {
      console.error('Create note error:', err)
      setErrorMessage(err.message || 'Could not save note.')
    } finally {
      setIsCreating(false)
    }
  }

  // Toggle Pin/Unpin status
  const handleTogglePin = async (id, currentPinned) => {
    const nextPinned = !currentPinned

    // Optimistically update local state for immediate UI feedback
    setNotes((prevNotes) =>
      sortNotes(
        prevNotes.map((note) =>
          note.id === id ? { ...note, is_pinned: nextPinned } : note
        )
      )
    )

    if (viewingNote && viewingNote.id === id) {
      setViewingNote((prev) => ({ ...prev, is_pinned: nextPinned }))
    }

    try {
      const res = await fetch(`${API_URL}/${id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: nextPinned }),
      })

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }

      const updated = await res.json()
      setNotes((prevNotes) =>
        sortNotes(
          prevNotes.map((note) => (note.id === updated.id ? updated : note))
        )
      )

      if (viewingNote && viewingNote.id === updated.id) {
        setViewingNote(updated)
      }
    } catch (err) {
      console.error('Toggle pin error:', err)
      // Revert optimistic update on failure
      setNotes((prevNotes) =>
        sortNotes(
          prevNotes.map((note) =>
            note.id === id ? { ...note, is_pinned: currentPinned } : note
          )
        )
      )
      if (viewingNote && viewingNote.id === id) {
        setViewingNote((prev) => ({ ...prev, is_pinned: currentPinned }))
      }
      setErrorMessage('Could not update pin status. Please try again.')
    }
  }

  // Toggle Favorite status
  const handleToggleFavorite = async (id, currentFavorite) => {
    const nextFavorite = !currentFavorite

    // Optimistically update local state for immediate UI feedback
    setNotes((prevNotes) =>
      sortNotes(
        prevNotes.map((note) =>
          note.id === id ? { ...note, is_favorite: nextFavorite } : note
        )
      )
    )

    if (viewingNote && viewingNote.id === id) {
      setViewingNote((prev) => ({ ...prev, is_favorite: nextFavorite }))
    }

    try {
      const res = await fetch(`${API_URL}/${id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: nextFavorite }),
      })

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`)
      }

      const updated = await res.json()
      setNotes((prevNotes) =>
        sortNotes(
          prevNotes.map((note) => (note.id === updated.id ? updated : note))
        )
      )

      if (viewingNote && viewingNote.id === updated.id) {
        setViewingNote(updated)
      }
    } catch (err) {
      console.error('Toggle favorite error:', err)
      // Revert optimistic update on failure
      setNotes((prevNotes) =>
        sortNotes(
          prevNotes.map((note) =>
            note.id === id ? { ...note, is_favorite: currentFavorite } : note
          )
        )
      )
      if (viewingNote && viewingNote.id === id) {
        setViewingNote((prev) => ({ ...prev, is_favorite: currentFavorite }))
      }
      setErrorMessage('Could not update favorite status. Please try again.')
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
    setEditCategory(note.category || 'General')
    setEditTagsInput(Array.isArray(note.tags) ? note.tags.join(', ') : '')
    setEditIsPinned(Boolean(note.is_pinned))
    setEditIsFavorite(Boolean(note.is_favorite))
    setEditError('')
  }

  // Close edit modal
  const closeEditModal = () => {
    setEditingNote(null)
    setEditTitle('')
    setEditContent('')
    setEditCategory('General')
    setEditTagsInput('')
    setEditIsPinned(false)
    setEditIsFavorite(false)
    setEditError('')
  }

  // Submit edit note
  const handleUpdateNote = async (e) => {
    e.preventDefault()
    const plainSnippet = getPlainTextSnippet(editContent)
    const hasImage = hasImageAttachment(editContent)
    if (!editTitle.trim() || (!plainSnippet && !hasImage)) {
      setEditError('Title and content cannot be empty.')
      return
    }

    setIsUpdating(true)
    setEditError('')
    try {
      const parsedTags = editTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const res = await fetch(`${API_URL}/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
          category: editCategory.trim() || 'General',
          tags: parsedTags,
          is_pinned: editIsPinned,
          is_favorite: editIsFavorite,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to update note (${res.status})`)
      }

      const updated = await res.json()
      setNotes((prevNotes) =>
        sortNotes(
          prevNotes.map((note) => (note.id === updated.id ? updated : note))
        )
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

  const favoriteCount = notes.filter((n) => n.is_favorite).length

  // Filter notes based on active tab and search query, maintaining pinned-first and newest-first ordering
  const filteredNotes = sortNotes(notes).filter((note) => {
    if (filterTab === 'favorites' && !note.is_favorite) {
      return false
    }
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    const matchTitle = (note.title || '').toLowerCase().includes(query)
    const plainContent = getPlainTextSnippet(note.content || '').toLowerCase()
    const matchContent =
      plainContent.includes(query) || (note.content || '').toLowerCase().includes(query)
    const matchCategory = (note.category || '').toLowerCase().includes(query)
    const matchTags =
      Array.isArray(note.tags) &&
      note.tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(query))
    return matchTitle || matchContent || matchCategory || matchTags
  })

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-brand">
          <div className="brand-logo-container" aria-hidden="true">
            <img
              src={notevaultLogo}
              alt="NoteVault Logo"
              className="notevault-header-logo"
              width="55"
              height="64"
            />
          </div>
          <div className="brand-text">
            <h1>NoteVault</h1>
            <p className="app-subtitle">Your Notes. Your Secrets. One Place.</p>
          </div>
        </div>

        <div className="app-header-actions">
          <button
            type="button"
            className="btn-header-gear"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open settings and theme options"
            title="Settings & Appearance"
          >
            <SettingsIcon size="1.25rem" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="app-main">
        {/* Password Hub View (kept mounted so the 5-minute inactivity timer runs in the background) */}
        <div style={{ display: currentView === 'password-hub' ? 'block' : 'none' }}>
          <PasswordHub onBack={() => setCurrentView('notes')} />
        </div>

        {/* Notes View */}
        {currentView === 'notes' && (
          <>
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

            {!isFormOpen ? (
              <div className="create-note-trigger-bar">
                <button
                  type="button"
                  className="btn-open-create"
                  onClick={() => {
                    setIsFormOpen(true)
                    setErrorMessage('')
                  }}
                >
                  <span className="plus-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <PlusIcon size="1.05rem" />
                  </span> Create Note
                </button>
                <button
                  type="button"
                  className="btn-open-password-hub"
                  onClick={() => {
                    setCurrentView('password-hub')
                    setErrorMessage('')
                  }}
                >
                  <span className="lock-icon" aria-hidden="true"><LockIcon size="1.15rem" /></span> Password Hub
                </button>
              </div>
            ) : (
          <section className="note-form-card" aria-label="Create note form">
            <div className="note-form-header">
              <h2>Create a New Note</h2>
              <button
                type="button"
                className="btn-close-form"
                onClick={() => {
                  setIsFormOpen(false)
                  setErrorMessage('')
                }}
                aria-label="Close create note form"
              >
                &times;
              </button>
            </div>
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
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group form-col-category">
                  <label htmlFor="note-category">Category</label>
                  <select
                    id="note-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={isCreating}
                  >
                    <option value="General">General</option>
                    <option value="Personal">Personal</option>
                    <option value="Work">Work</option>
                    <option value="Study">Study</option>
                    <option value="Ideas">Ideas</option>
                  </select>
                </div>

                <div className="form-group form-col-tags">
                  <label htmlFor="note-tags">Tags (comma-separated)</label>
                  <input
                    id="note-tags"
                    type="text"
                    placeholder="e.g. DBMS, Exam, JavaScript"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className="form-group">
                <label id="create-note-content-label">Content</label>
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Write your note here... (supports bold, lists, headings, and images)"
                  disabled={isCreating}
                  ariaLabel="Note content editor"
                />
              </div>

              <div className="form-checkboxes-group">
                <div className="form-group-checkbox">
                  <label className="checkbox-label" htmlFor="note-pin">
                    <input
                      id="note-pin"
                      type="checkbox"
                      checked={isPinned}
                      onChange={(e) => setIsPinned(e.target.checked)}
                      disabled={isCreating}
                    />
                    <span><PinIcon size="1rem" filled /> Pin this note to the top</span>
                  </label>
                </div>

                <div className="form-group-checkbox">
                  <label className="checkbox-label" htmlFor="note-favorite">
                    <input
                      id="note-favorite"
                      type="checkbox"
                      checked={isFavorite}
                      onChange={(e) => setIsFavorite(e.target.checked)}
                      disabled={isCreating}
                    />
                    <span><StarIcon size="1rem" filled /> Add to favorites</span>
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setIsFormOpen(false)
                    setErrorMessage('')
                  }}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-create"
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating Note...' : 'Create Note'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="notes-list-section">
          <div className="notes-header-row">
            <div className="notes-header-left">
              <h2>Your Notes</h2>
              {notes.length > 0 && (
                <span className="notes-badge">
                  {searchQuery.trim() || filterTab === 'favorites'
                    ? `${filteredNotes.length} of ${notes.length}`
                    : notes.length}{' '}
                  {notes.length === 1 ? 'note' : 'notes'}
                </span>
              )}
            </div>

            {notes.length > 0 && (
              <div className="filter-tabs-group" role="tablist" aria-label="Filter notes">
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterTab === 'all'}
                  className={`btn-filter-tab ${filterTab === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterTab('all')}
                >
                  All Notes ({notes.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterTab === 'favorites'}
                  className={`btn-filter-tab ${filterTab === 'favorites' ? 'active' : ''}`}
                  onClick={() => setFilterTab('favorites')}
                >
                  <StarIcon size="0.95rem" filled /> Favorites ({favoriteCount})
                </button>
              </div>
            )}
          </div>

          {/* Search Bar: visible when notes exist or a search is active */}
          {(notes.length > 0 || searchQuery) && (
            <div className="search-bar-container">
              <div className="search-input-wrapper">
                <span className="search-icon" aria-hidden="true">
                  <SearchIcon size="1rem" />
                </span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search notes by title, content, category, or tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search notes by title, content, category, or tag"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="btn-clear-search"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                    aria-label="Clear search query"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="status-message">
              <div className="spinner" aria-hidden="true"></div>
              <span>Loading notes...</span>
            </div>
          ) : notes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">
                <EmptyNotesIllustration />
              </div>
              <h3>No notes yet</h3>
              <p>
                You have not created any notes. Use the form above to add your
                first note!
              </p>
            </div>
          ) : filterTab === 'favorites' && favoriteCount === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">
                <EmptyFavoritesIllustration />
              </div>
              <h3>No favorite notes yet</h3>
              <p>
                You have not added any notes to your favorites. Click the star icon on any note card to mark it as a favorite!
              </p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="empty-state search-empty-state">
              <div className="empty-icon" aria-hidden="true">
                <EmptySearchIllustration />
              </div>
              <h3>No matching notes found</h3>
              <p>
                No {filterTab === 'favorites' ? 'favorite ' : ''}notes matched "<strong>{searchQuery}</strong>". Try a different
                search term or clear the search.
              </p>
              <button
                type="button"
                className="btn-clear-filter"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div className="notes-grid">
              {filteredNotes.map((note) => (
                <article
                  key={note.id}
                  className={`note-card ${note.is_pinned ? 'note-card-pinned' : ''}`}
                  onClick={() => setViewingNote(note)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setViewingNote(note)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View note titled ${note.title}${note.is_pinned ? ' (Pinned)' : ''}${note.is_favorite ? ' (Favorite)' : ''}`}
                >
                  <div className="note-card-header">
                    <div className="note-title-group">
                      <div className="note-title-row">
                        <h3 className="note-title">{note.title}</h3>
                        {note.is_pinned && (
                          <span className="pinned-indicator" title="Pinned to top">
                            <PinIcon size="0.95rem" filled />
                          </span>
                        )}
                        {note.is_favorite && (
                          <span className="favorite-indicator" title="Favorited">
                            <StarIcon size="0.95rem" filled />
                          </span>
                        )}
                      </div>
                      <div className="note-card-meta-badges">
                        <span
                          className={`category-badge category-${(note.category || 'General').toLowerCase()}`}
                        >
                          {note.category || 'General'}
                        </span>
                        {hasImageAttachment(note.content) && (
                          <span className="card-image-badge" title="Note contains image attachment">
                            <ImageIcon size="0.85rem" /> Image
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className="note-card-quick-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`btn-card-action btn-card-favorite ${note.is_favorite ? 'is-favorite' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleFavorite(note.id, note.is_favorite)
                        }}
                        title={note.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={note.is_favorite ? `Remove note titled ${note.title} from favorites` : `Add note titled ${note.title} to favorites`}
                        aria-pressed={note.is_favorite}
                      >
                        <StarIcon size="1rem" filled={Boolean(note.is_favorite)} aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        className={`btn-card-action btn-card-pin ${note.is_pinned ? 'is-pinned' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTogglePin(note.id, note.is_pinned)
                        }}
                        title={note.is_pinned ? 'Unpin note' : 'Pin note to top'}
                        aria-label={note.is_pinned ? `Unpin note titled ${note.title}` : `Pin note titled ${note.title} to top`}
                        aria-pressed={note.is_pinned}
                      >
                        <PinIcon size="1rem" filled={Boolean(note.is_pinned)} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {note.content && (
                    <p className="note-content">
                      {getPlainTextSnippet(note.content) || (
                        <span className="card-image-snippet"><ImageIcon size="0.95rem" /> Image attachment</span>
                      )}
                    </p>
                  )}

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
        </>
      )}
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
              <div className="view-title-group">
                <h2 id="view-modal-title" className="view-modal-title">
                  {viewingNote.title}
                </h2>
                {viewingNote.is_pinned && (
                  <span className="pinned-indicator"><PinIcon size="0.95rem" filled /> Pinned</span>
                )}
                {viewingNote.is_favorite && (
                  <span className="favorite-indicator" title="Favorited"><StarIcon size="0.95rem" filled /></span>
                )}
                <span
                  className={`category-badge category-${(viewingNote.category || 'General').toLowerCase()}`}
                >
                  {viewingNote.category || 'General'}
                </span>
                {hasImageAttachment(viewingNote.content) && (
                  <span className="card-image-badge" title="Contains image attachment">
                    <ImageIcon size="0.85rem" /> Image
                  </span>
                )}
              </div>
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
              <div
                className="view-note-content rich-text-content"
                dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(viewingNote.content) }}
              />

              {Array.isArray(viewingNote.tags) && viewingNote.tags.length > 0 && (
                <div className="view-note-tags-row">
                  <span className="meta-label">Tags:</span>
                  <div className="note-tags">
                    {viewingNote.tags.map((tag) => (
                      <span key={tag} className="tag-pill">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="view-note-metadata">
                <div className="meta-item">
                  <span className="meta-label">Created:</span>
                  <time className="meta-value">
                    {formatDate(viewingNote.created_at)}
                  </time>
                </div>
                {viewingNote.updated_at &&
                  viewingNote.updated_at !== viewingNote.created_at && (
                    <div className="meta-item">
                      <span className="meta-label">Last Updated:</span>
                      <time className="meta-value">
                        {formatDate(viewingNote.updated_at)}
                      </time>
                    </div>
                  )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className={`btn-action-view ${viewingNote.is_favorite ? 'btn-unfavorite-view' : 'btn-favorite-view'}`}
                onClick={() => handleToggleFavorite(viewingNote.id, viewingNote.is_favorite)}
              >
                <StarIcon size="1rem" filled={Boolean(viewingNote.is_favorite)} /> {viewingNote.is_favorite ? 'Favorited' : 'Favorite'}
              </button>
              <button
                type="button"
                className={`btn-action-view ${viewingNote.is_pinned ? 'btn-unpin-view' : 'btn-pin-view'}`}
                onClick={() => handleTogglePin(viewingNote.id, viewingNote.is_pinned)}
              >
                <PinIcon size="1rem" filled={Boolean(viewingNote.is_pinned)} /> {viewingNote.is_pinned ? 'Unpin Note' : 'Pin Note'}
              </button>
              <button
                type="button"
                className="btn-action-view btn-edit-from-view"
                onClick={() => {
                  const noteToEdit = viewingNote
                  setViewingNote(null)
                  openEditModal(noteToEdit)
                }}
              >
                <EditIcon size="1rem" /> Edit Note
              </button>
              <button
                type="button"
                className="btn-action-view btn-delete-from-view"
                onClick={() => handleDeleteNote(viewingNote.id, viewingNote.title)}
                title="Delete note"
                aria-label={`Delete note titled ${viewingNote.title}`}
              >
                <TrashIcon size="1rem" /> Delete Note
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
            className="modal-content edit-modal-content"
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

            <form onSubmit={handleUpdateNote} className="edit-modal-form">
              <div className="edit-modal-body">
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

                <div className="form-row">
                  <div className="form-group form-col-category">
                    <label htmlFor="edit-category">Category</label>
                    <select
                      id="edit-category"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      disabled={isUpdating}
                    >
                      <option value="General">General</option>
                      <option value="Personal">Personal</option>
                      <option value="Work">Work</option>
                      <option value="Study">Study</option>
                      <option value="Ideas">Ideas</option>
                    </select>
                  </div>

                  <div className="form-group form-col-tags">
                    <label htmlFor="edit-tags">Tags (comma-separated)</label>
                    <input
                      id="edit-tags"
                      type="text"
                      placeholder="e.g. DBMS, Exam, JavaScript"
                      value={editTagsInput}
                      onChange={(e) => setEditTagsInput(e.target.value)}
                      disabled={isUpdating}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label id="edit-note-content-label">Content</label>
                  <RichTextEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="Edit your note..."
                    disabled={isUpdating}
                    ariaLabel="Edit note content"
                  />
                </div>

                <div className="form-checkboxes-group">
                  <div className="form-group-checkbox">
                    <label className="checkbox-label" htmlFor="edit-pin">
                      <input
                        id="edit-pin"
                        type="checkbox"
                        checked={editIsPinned}
                        onChange={(e) => setEditIsPinned(e.target.checked)}
                        disabled={isUpdating}
                      />
                      <span><PinIcon size="1rem" filled /> Pin this note to the top</span>
                    </label>
                  </div>

                  <div className="form-group-checkbox">
                    <label className="checkbox-label" htmlFor="edit-favorite">
                      <input
                        id="edit-favorite"
                        type="checkbox"
                        checked={editIsFavorite}
                        onChange={(e) => setEditIsFavorite(e.target.checked)}
                        disabled={isUpdating}
                      />
                      <span><StarIcon size="1rem" filled /> Add to favorites</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-actions edit-modal-actions">
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

      {/* Settings & Appearance Modal */}
      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div
            className="modal-content settings-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
          >
            <div className="modal-header">
              <div className="settings-header-title-group">
                <SettingsIcon size="1.25rem" aria-hidden="true" />
                <h2 id="settings-modal-title">Settings & Appearance</h2>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Close settings dialog"
              >
                &times;
              </button>
            </div>

            <div className="settings-modal-body">
              {/* 1. Interface Theme Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-title-group">
                    <div className="settings-card-icon-badge">
                      <SunIcon size="1.1rem" aria-hidden="true" />
                    </div>
                    <h3 className="settings-card-title">Interface Theme</h3>
                  </div>
                  <span className="settings-card-badge">
                    {resolvedTheme === 'dark-floral'
                      ? 'Dark Floral'
                      : resolvedTheme === 'white-floral'
                      ? 'White Floral'
                      : resolvedTheme === 'dark'
                      ? 'Dark'
                      : 'Light'}
                  </span>
                </div>
                <p className="settings-card-desc">
                  Select your preferred color theme or synchronize with your operating system.
                </p>

                <div className="theme-options-grid" role="radiogroup" aria-label="Theme options">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={themePreference === 'light'}
                    className={`theme-option-card ${themePreference === 'light' ? 'active' : ''}`}
                    onClick={() => setThemePreference('light')}
                  >
                    <div className="theme-option-icon" aria-hidden="true">
                      <SunIcon size="1.2rem" />
                    </div>
                    <div className="theme-option-text">
                      <span className="theme-option-title">Light</span>
                      <span className="theme-option-subtitle">Clean, bright workspace</span>
                    </div>
                    {themePreference === 'light' && <CheckIcon size="1rem" className="theme-check-badge" />}
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={themePreference === 'dark'}
                    className={`theme-option-card ${themePreference === 'dark' ? 'active' : ''}`}
                    onClick={() => setThemePreference('dark')}
                  >
                    <div className="theme-option-icon" aria-hidden="true">
                      <MoonIcon size="1.2rem" />
                    </div>
                    <div className="theme-option-text">
                      <span className="theme-option-title">Dark</span>
                      <span className="theme-option-subtitle">Easy on the eyes</span>
                    </div>
                    {themePreference === 'dark' && <CheckIcon size="1rem" className="theme-check-badge" />}
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={themePreference === 'dark-floral'}
                    className={`theme-option-card ${themePreference === 'dark-floral' ? 'active' : ''}`}
                    onClick={() => setThemePreference('dark-floral')}
                  >
                    <div className="theme-option-icon" aria-hidden="true">
                      <FlowerIcon size="1.2rem" />
                    </div>
                    <div className="theme-option-text">
                      <span className="theme-option-title">Dark Floral</span>
                      <span className="theme-option-subtitle">Deep navy canvas with gentle botanical accents</span>
                    </div>
                    {themePreference === 'dark-floral' && <CheckIcon size="1rem" className="theme-check-badge" />}
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={themePreference === 'white-floral'}
                    className={`theme-option-card ${themePreference === 'white-floral' ? 'active' : ''}`}
                    onClick={() => setThemePreference('white-floral')}
                  >
                    <div className="theme-option-icon" aria-hidden="true">
                      <LeafIcon size="1.2rem" />
                    </div>
                    <div className="theme-option-text">
                      <span className="theme-option-title">White Floral</span>
                      <span className="theme-option-subtitle">Warm ivory canvas with soft botanical motifs</span>
                    </div>
                    {themePreference === 'white-floral' && <CheckIcon size="1rem" className="theme-check-badge" />}
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={themePreference === 'system'}
                    className={`theme-option-card ${themePreference === 'system' ? 'active' : ''}`}
                    onClick={() => setThemePreference('system')}
                  >
                    <div className="theme-option-icon" aria-hidden="true">
                      <MonitorIcon size="1.2rem" />
                    </div>
                    <div className="theme-option-text">
                      <span className="theme-option-title">System Default</span>
                      <span className="theme-option-subtitle">
                        Syncs with device ({systemIsDark ? 'Dark detected' : 'Light detected'})
                      </span>
                    </div>
                    {themePreference === 'system' && <CheckIcon size="1rem" className="theme-check-badge" />}
                  </button>
                </div>
              </div>

              {/* 2. CodeNova Coding Internship — Project 1 Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-title-group">
                    <div className="settings-card-icon-badge">
                      <NoteIcon size="1.1rem" aria-hidden="true" />
                    </div>
                    <h3 className="settings-card-title">CodeNova Coding Internship — Project 1</h3>
                  </div>
                  <span className="settings-card-badge">Task 1</span>
                </div>
                <p className="settings-card-desc">
                  <strong>NoteVault — Notes & Password Hub</strong> — A full-stack productivity workspace combining rich-text note taking with a client-side encrypted password vault.
                </p>
                <div className="settings-tech-stack">
                  <span className="tech-tag">React</span>
                  <span className="tech-tag">Vite</span>
                  <span className="tech-tag">Node.js</span>
                  <span className="tech-tag">Express.js</span>
                  <span className="tech-tag">SQLite</span>
                </div>
                <div className="settings-features-container">
                  <span className="settings-features-heading">Implemented Features</span>
                  <ul className="settings-feature-list">
                    <li>
                      <CheckIcon size="0.85rem" className="feature-check" />
                      <span>Full CRUD note management with responsive card layout</span>
                    </li>
                    <li>
                      <CheckIcon size="0.85rem" className="feature-check" />
                      <span>WYSIWYG Rich Text Editor with undo/redo, lists, and image attachments</span>
                    </li>
                    <li>
                      <CheckIcon size="0.85rem" className="feature-check" />
                      <span>Instant multi-field search across titles, contents, tags, and categories</span>
                    </li>
                    <li>
                      <CheckIcon size="0.85rem" className="feature-check" />
                      <span>Priority organization with Pinned notes and Favorites filtering</span>
                    </li>
                    <li>
                      <CheckIcon size="0.85rem" className="feature-check" />
                      <span>Five themes including custom botanical Dark Floral and White Floral</span>
                    </li>
                    <li>
                      <CheckIcon size="0.85rem" className="feature-check" />
                      <span>Password Hub zero-knowledge encrypted credential vault with auto-lock</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* 3. App Information Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-title-group">
                    <div className="settings-card-icon-badge">
                      <InfoIcon size="1.1rem" aria-hidden="true" />
                    </div>
                    <h3 className="settings-card-title">App Information</h3>
                  </div>
                </div>
                <p className="settings-card-desc">
                  A responsive full-stack note-taking workspace with built-in client-side encrypted credential protection and persistent SQLite storage.
                </p>
                <div className="settings-info-grid">
                  <div className="info-item">
                    <span className="info-label">Application</span>
                    <span className="info-value">NoteVault</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Version</span>
                    <span className="info-value">1.0.0</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Database</span>
                    <span className="info-value">Native SQLite (node:sqlite)</span>
                  </div>
                </div>
              </div>

              {/* 4. Security Information Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-title-group">
                    <div className="settings-card-icon-badge">
                      <LockIcon size="1.1rem" aria-hidden="true" />
                    </div>
                    <h3 className="settings-card-title">Security Information</h3>
                  </div>
                  <span className="settings-card-badge badge-secure">Client-Side Encrypted</span>
                </div>
                <p className="settings-card-desc">
                  Password Hub security features verified against active implementation:
                </p>
                <ul className="settings-security-list">
                  <li>
                    <CheckIcon size="0.85rem" className="feature-check" />
                    <span><strong>Client-Side Derivation:</strong> Master key derived in-browser using Argon2id (64 MB memory, 3 iterations) with client salt; master passwords are never transmitted.</span>
                  </li>
                  <li>
                    <CheckIcon size="0.85rem" className="feature-check" />
                    <span><strong>Authenticated Encryption:</strong> Credentials encrypted using AES-256-GCM with unique 12-byte initialization vectors (IVs) and 128-bit authentication tags. Zero plaintext credentials stored in SQLite.</span>
                  </li>
                  <li>
                    <CheckIcon size="0.85rem" className="feature-check" />
                    <span><strong>In-Memory Key Lifecycle:</strong> Master keys and session tokens exist only in active component React state memory; never written to localStorage, cookies, or IndexedDB.</span>
                  </li>
                  <li>
                    <CheckIcon size="0.85rem" className="feature-check" />
                    <span><strong>Inactivity Auto-Lock:</strong> 5-minute client-side inactivity timer automatically purges decrypted credentials and locks the vault.</span>
                  </li>
                  <li>
                    <CheckIcon size="0.85rem" className="feature-check" />
                    <span><strong>Brute-Force Protection:</strong> Sliding rate-limiting window enforces backoff delays on consecutive failed unlock attempts.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-create"
                onClick={() => setIsSettingsOpen(false)}
                autoFocus
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
