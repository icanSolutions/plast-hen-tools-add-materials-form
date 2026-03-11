const DEFAULT_ORIGINS = [
  'https://airtable.com',
  'https://app.airtable.com',
]

/**
 * Parses comma-separated VITE_ALLOWED_REFERRER_ORIGINS into a list of trimmed origins.
 * Falls back to Airtable origins if unset or empty.
 */
function getAllowedOrigins() {
  const raw = import.meta.env.VITE_ALLOWED_REFERRER_ORIGINS
  if (!raw || typeof raw !== 'string') return DEFAULT_ORIGINS
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return list.length > 0 ? list : DEFAULT_ORIGINS
}

/**
 * Returns true only when document.referrer is non-empty and its origin
 * is in the allowed list. Otherwise false (direct open, other site, or stripped referrer).
 *
 * In development (Vite dev server): appending ?from_airtable=1 to the URL
 * simulates "came from Airtable" and allows access for local testing.
 */
export function isAllowedReferrer() {
  if (typeof document === 'undefined') return false

  // Dev-only: simulate Airtable source for local testing
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(document.location.search)
    if (params.get('from_airtable') === '1') return true
  }

  const referrer = document.referrer
  if (!referrer) return false
  try {
    const origin = new URL(referrer).origin
    const allowed = getAllowedOrigins()
    return allowed.includes(origin)
  } catch {
    return false
  }
}
