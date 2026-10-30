import { useState, useRef, useEffect, useCallback } from 'react'
import { normalizeImageUrls } from '../utils/richText'
import { UPLOAD_API_URL } from '../utils/apiConfig'
import { ImageIcon, SpinnerIcon, UndoIcon, RedoIcon, ListBulletIcon, ListOrderedIcon, ClearFormatIcon } from './Icons'

const API_UPLOAD_URL = UPLOAD_API_URL

/**
 * Ensures all image elements in the editor have the image wrapper and removal button.
 */
function prepareHtmlForEditor(rawHtml) {
  if (!rawHtml) return '<p><br></p>'
  
  // If plain text without HTML tags, wrap in <p>
  if (!/<[a-z][\s\S]*>/i.test(rawHtml)) {
    const paragraphs = rawHtml.split('\n\n').filter(Boolean)
    if (paragraphs.length === 0) return '<p><br></p>'
    return paragraphs.map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`).join('')
  }

  const normalized = normalizeImageUrls(rawHtml)

  // Parse HTML into temporary DOM to decorate images with removal buttons
  const temp = document.createElement('div')
  temp.innerHTML = normalized

  // Find all images
  const images = temp.querySelectorAll('img')
  images.forEach((img) => {
    let wrapper = img.closest('[data-image-wrapper="true"]')
    if (!wrapper) {
      wrapper = document.createElement('div')
      wrapper.className = 'note-image-item'
      wrapper.setAttribute('data-image-wrapper', 'true')
      img.parentNode.insertBefore(wrapper, img)
      wrapper.appendChild(img)
    }

    if (!wrapper.querySelector('.btn-remove-inline-img')) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'btn-remove-inline-img'
      btn.title = 'Remove image'
      btn.setAttribute('aria-label', 'Remove image')
      btn.innerHTML = '&times;'
      wrapper.appendChild(btn)
    }
  })

  return temp.innerHTML
}

/**
 * Strips editor-only UI elements (such as remove buttons) before returning clean HTML
 */
function cleanHtmlForSaving(html) {
  if (!html) return ''
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Remove editor-only remove buttons
  const removeBtns = temp.querySelectorAll('.btn-remove-inline-img')
  removeBtns.forEach((btn) => btn.remove())

  return temp.innerHTML.trim()
}

export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Write your note here...',
  disabled = false,
  ariaLabel = 'Note content editor'
}) {
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    h1: false,
    h2: false,
    ul: false,
    ol: false,
  })

  // Synchronize incoming value into editor DOM when changed externally
  useEffect(() => {
    if (!editorRef.current) return
    const currentClean = cleanHtmlForSaving(editorRef.current.innerHTML)
    const incomingClean = cleanHtmlForSaving(value || '')

    // Only update if content genuinely differs
    if (currentClean !== incomingClean) {
      editorRef.current.innerHTML = prepareHtmlForEditor(value)
    }
  }, [value])

  // Update active formatting button states based on selection
  const updateToolbarStates = useCallback(() => {
    if (!editorRef.current || document.activeElement !== editorRef.current) {
      return
    }

    try {
      const isBold = document.queryCommandState('bold')
      const isItalic = document.queryCommandState('italic')
      const isUnderline = document.queryCommandState('underline')
      const isUl = document.queryCommandState('insertUnorderedList')
      const isOl = document.queryCommandState('insertOrderedList')

      // Check current block format for H1 / H2
      const blockValue = document.queryCommandValue('formatBlock').toLowerCase()
      const isH1 = blockValue === 'h1'
      const isH2 = blockValue === 'h2'

      setActiveFormats({
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        h1: isH1,
        h2: isH2,
        ul: isUl,
        ol: isOl,
      })
    } catch {
      // Ignore query errors in edge cases
    }
  }, [])

  // Listen to document selection changes to refresh toolbar states
  useEffect(() => {
    document.addEventListener('selectionchange', updateToolbarStates)
    return () => {
      document.removeEventListener('selectionchange', updateToolbarStates)
    }
  }, [updateToolbarStates])

  // Emit changes to parent
  const emitChange = useCallback(() => {
    if (!editorRef.current || !onChange) return
    const cleaned = cleanHtmlForSaving(editorRef.current.innerHTML)
    onChange(cleaned)
    updateToolbarStates()
  }, [onChange, updateToolbarStates])

  // Execute formatting commands
  const handleCommand = (e, command, arg = null) => {
    e.preventDefault() // Prevents editor from losing focus
    if (disabled || !editorRef.current) return

    editorRef.current.focus()

    if (command === 'formatBlock') {
      const currentBlock = document.queryCommandValue('formatBlock').toLowerCase()
      if (currentBlock === arg.toLowerCase()) {
        document.execCommand('formatBlock', false, '<p>')
      } else {
        document.execCommand('formatBlock', false, arg)
      }
    } else if (command === 'clearFormatting') {
      document.execCommand('removeFormat', false, null)
      document.execCommand('formatBlock', false, '<p>')
    } else {
      document.execCommand(command, false, arg)
    }

    emitChange()
  }

  // Handle image upload from file or blob
  const uploadAndInsertImage = async (file) => {
    if (!file) return

    // Client-side validations
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (JPEG, PNG, WebP, or GIF).')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image size exceeds the 10 MB limit.')
      return
    }

    setIsUploading(true)
    setUploadError('')

    try {
      const formData = new FormData()
      formData.append('image', file)

      const res = await fetch(API_UPLOAD_URL, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Upload failed with status ${res.status}`)
      }

      const data = await res.json()
      const imageUrl = data.url || data.relativeUrl

      insertImageIntoEditor(imageUrl)
    } catch (err) {
      console.error('Image upload failed:', err)
      setUploadError(err.message || 'Could not upload image. Please try again.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Insert image HTML into editor DOM
  const insertImageIntoEditor = (imageUrl) => {
    if (!editorRef.current) return
    editorRef.current.focus()

    const wrapper = document.createElement('div')
    wrapper.className = 'note-image-item'
    wrapper.setAttribute('data-image-wrapper', 'true')

    const img = document.createElement('img')
    img.src = imageUrl
    img.alt = 'Attached image'
    img.loading = 'lazy'

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'btn-remove-inline-img'
    removeBtn.title = 'Remove image'
    removeBtn.setAttribute('aria-label', 'Remove image')
    removeBtn.innerHTML = '&times;'

    wrapper.appendChild(img)
    wrapper.appendChild(removeBtn)

    // Insert at current selection or append to editor
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(wrapper)

      // Add a paragraph break after the image for continued typing
      const p = document.createElement('p')
      p.innerHTML = '<br>'
      wrapper.parentNode.insertBefore(p, wrapper.nextSibling)

      // Move cursor after the image
      range.setStartAfter(p)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editorRef.current.appendChild(wrapper)
      const p = document.createElement('p')
      p.innerHTML = '<br>'
      editorRef.current.appendChild(p)
    }

    emitChange()
  }

  // Handle clicking remove button on images inside the editor
  const handleEditorClick = (e) => {
    const removeBtn = e.target.closest('.btn-remove-inline-img')
    if (removeBtn) {
      e.preventDefault()
      e.stopPropagation()
      const wrapper = removeBtn.closest('[data-image-wrapper="true"]')
      if (wrapper) {
        wrapper.remove()
        emitChange()
      }
    }
  }

  // Handle paste events (supports screenshot pasting from clipboard)
  const handlePaste = (e) => {
    if (disabled) return
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            uploadAndInsertImage(file)
            return
          }
        }
      }
    }
  }

  // Handle drag and drop of image files
  const handleDrop = (e) => {
    if (disabled) return
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('image/')) {
        e.preventDefault()
        uploadAndInsertImage(file)
      }
    }
  }

  return (
    <div className={`rich-text-editor-container ${disabled ? 'is-disabled' : ''}`}>
      {/* Accessible Formatting Toolbar */}
      <div className="rte-toolbar" role="toolbar" aria-label="Text formatting toolbar">
        <div className="rte-toolbar-group">
          <button
            type="button"
            className="rte-btn"
            onMouseDown={(e) => handleCommand(e, 'undo')}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={disabled}
          >
            <UndoIcon size="1rem" />
          </button>
          <button
            type="button"
            className="rte-btn"
            onMouseDown={(e) => handleCommand(e, 'redo')}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            disabled={disabled}
          >
            <RedoIcon size="1rem" />
          </button>
        </div>

        <div className="rte-toolbar-divider" aria-hidden="true" />

        <div className="rte-toolbar-group">
          <button
            type="button"
            className={`rte-btn rte-btn-bold ${activeFormats.bold ? 'is-active' : ''}`}
            onMouseDown={(e) => handleCommand(e, 'bold')}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
            aria-pressed={activeFormats.bold}
            disabled={disabled}
          >
            B
          </button>
          <button
            type="button"
            className={`rte-btn rte-btn-italic ${activeFormats.italic ? 'is-active' : ''}`}
            onMouseDown={(e) => handleCommand(e, 'italic')}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
            aria-pressed={activeFormats.italic}
            disabled={disabled}
          >
            I
          </button>
          <button
            type="button"
            className={`rte-btn rte-btn-underline ${activeFormats.underline ? 'is-active' : ''}`}
            onMouseDown={(e) => handleCommand(e, 'underline')}
            title="Underline (Ctrl+U)"
            aria-label="Underline"
            aria-pressed={activeFormats.underline}
            disabled={disabled}
          >
            U
          </button>
        </div>

        <div className="rte-toolbar-divider" aria-hidden="true" />

        <div className="rte-toolbar-group">
          <button
            type="button"
            className={`rte-btn ${activeFormats.h1 ? 'is-active' : ''}`}
            onMouseDown={(e) => handleCommand(e, 'formatBlock', '<h1>')}
            title="Heading 1"
            aria-label="Heading 1"
            aria-pressed={activeFormats.h1}
            disabled={disabled}
          >
            H1
          </button>
          <button
            type="button"
            className={`rte-btn ${activeFormats.h2 ? 'is-active' : ''}`}
            onMouseDown={(e) => handleCommand(e, 'formatBlock', '<h2>')}
            title="Heading 2"
            aria-label="Heading 2"
            aria-pressed={activeFormats.h2}
            disabled={disabled}
          >
            H2
          </button>
        </div>

        <div className="rte-toolbar-divider" aria-hidden="true" />

        <div className="rte-toolbar-group">
          <button
            type="button"
            className={`rte-btn ${activeFormats.ul ? 'is-active' : ''}`}
            onMouseDown={(e) => handleCommand(e, 'insertUnorderedList')}
            title="Bulleted List"
            aria-label="Bulleted List"
            aria-pressed={activeFormats.ul}
            disabled={disabled}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <ListBulletIcon size="0.95rem" /> List
            </span>
          </button>
          <button
            type="button"
            className={`rte-btn ${activeFormats.ol ? 'is-active' : ''}`}
            onMouseDown={(e) => handleCommand(e, 'insertOrderedList')}
            title="Numbered List"
            aria-label="Numbered List"
            aria-pressed={activeFormats.ol}
            disabled={disabled}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <ListOrderedIcon size="0.95rem" /> List
            </span>
          </button>
        </div>

        <div className="rte-toolbar-divider" aria-hidden="true" />

        <div className="rte-toolbar-group">
          <button
            type="button"
            className="rte-btn"
            onMouseDown={(e) => handleCommand(e, 'clearFormatting')}
            title="Clear Formatting"
            aria-label="Clear formatting"
            disabled={disabled}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <ClearFormatIcon size="0.95rem" /> Clear
            </span>
          </button>
        </div>

        <div className="rte-toolbar-divider" aria-hidden="true" />

        <div className="rte-toolbar-group">
          <button
            type="button"
            className="rte-btn rte-btn-image"
            onClick={() => fileInputRef.current?.click()}
            title="Add Image or Screenshot"
            aria-label="Upload image"
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <span className="rte-upload-loading"><SpinnerIcon size="1rem" /> Uploading...</span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <ImageIcon size="1.05rem" /> + Add Image
              </span>
            )}
          </button>
        </div>

        {/* Hidden Native File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadAndInsertImage(file)
          }}
          disabled={disabled || isUploading}
        />
      </div>

      {uploadError && (
        <div className="rte-error-banner" role="alert">
          <span>{uploadError}</span>
          <button
            type="button"
            className="btn-dismiss-error"
            onClick={() => setUploadError('')}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {/* Editable Content Area */}
      <div
        ref={editorRef}
        className="rte-editable"
        contentEditable={!disabled}
        onInput={emitChange}
        onKeyUp={updateToolbarStates}
        onMouseUp={updateToolbarStates}
        onClick={handleEditorClick}
        onPaste={handlePaste}
        onDrop={handleDrop}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        tabIndex={0}
      />
    </div>
  )
}
