import DOMPurify from 'dompurify'
import { API_BASE } from './apiConfig'

const BACKEND_BASE = API_BASE

/**
 * Checks if a string contains HTML tags
 */
export function isHtmlContent(content) {
  if (!content || typeof content !== 'string') return false
  return /<[a-z][\s\S]*>/i.test(content)
}

/**
 * Checks if a content string has any embedded images
 */
export function hasImageAttachment(content) {
  if (!content || typeof content !== 'string') return false
  return /<img\b[^>]*>/i.test(content)
}

/**
 * Normalizes image source URLs:
 * Converts relative `/uploads/...` paths to full backend URLs.
 */
export function normalizeImageUrls(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/src=(["'])\/uploads\/([^"']+)\1/gi, `src=$1${BACKEND_BASE}/uploads/$2$1`)
}

/**
 * Sanitizes rich text HTML for secure rendering in the DOM.
 * Preserves formatting, lists, headings, and images while neutralizing XSS risks.
 * Backward compatible with plain-text notes.
 */
export function sanitizeNoteHtml(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return ''

  // If the note was created in an earlier plain-text version, preserve line breaks
  if (!isHtmlContent(rawContent)) {
    const escaped = rawContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
    return escaped.replace(/\n/g, '<br />')
  }

  // Normalize relative upload paths to full URL
  const normalized = normalizeImageUrls(rawContent)

  // Configure DOMPurify
  return DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS: [
      'p', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
      'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'br',
      'img', 'div', 'span', 'figure', 'figcaption', 'blockquote'
    ],
    ALLOWED_ATTR: [
      'src', 'alt', 'title', 'class', 'style', 'width', 'height', 'loading'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  })
}

/**
 * Extracts a clean, plain-text snippet for note card previews.
 * Strips all HTML markup, replaces block breaks with spaces, and collapses whitespace.
 */
export function getPlainTextSnippet(content) {
  if (!content || typeof content !== 'string') return ''

  if (!isHtmlContent(content)) {
    return content.trim().replace(/\s+/g, ' ')
  }

  // Convert line breaks and paragraph ends to spaces
  const spaced = content
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<\/h[1-6]>/gi, ' ')

  // Strip all HTML tags
  const stripped = spaced.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  const decoded = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")

  return decoded.trim().replace(/\s+/g, ' ')
}
