/**
 * Application API Configuration
 * 
 * Provides centralized backend URL resolution:
 * - Uses VITE_API_URL in production (e.g. on Render)
 * - Falls back to http://localhost:5000 for local development
 * - Sanitizes trailing slashes safely
 */

export const API_BASE = (
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:5000'
).replace(/\/+$/, '');

export const NOTES_API_URL = `${API_BASE}/api/notes`;
export const UPLOAD_API_URL = `${API_BASE}/api/upload`;
export const VAULT_API_URL = `${API_BASE}/api/vault`;
