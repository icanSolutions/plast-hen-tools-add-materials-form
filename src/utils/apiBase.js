/**
 * Base URL for the Express API (quote submit, supplier PDF, etc.).
 *
 * - If `VITE_PDF_API_BASE_URL` is **missing** from the build → `null` (local dev: set it).
 * - If set to **empty** → same origin (`/api/...` only) — use when the UI and API share one host.
 * - Otherwise → full origin, no trailing slash.
 */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_PDF_API_BASE_URL
  if (raw === undefined) return null
  const s = String(raw).trim()
  if (s === '') return ''
  return s.replace(/\/$/, '')
}

/**
 * @param {string} path - e.g. `/api/quote/submit`
 * @returns {string | null} Full URL or same-origin path, or `null` if API base is unset.
 */
export function apiUrl(path) {
  const base = getApiBaseUrl()
  if (base === null) return null
  const p = path.startsWith('/') ? path : `/${path}`
  if (base === '') return p
  return `${base}${p}`
}
