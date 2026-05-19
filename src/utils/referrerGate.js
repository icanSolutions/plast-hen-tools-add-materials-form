/**
 * Gate: allow access only when the URL has a baseId query param that matches
 * VITE_AIRTABLE_BASE_ID (Airtable app / base id). Client-side check only.
 *
 * Link format: https://yourapp.com?baseId=appXXX (optional &tableId=... is ignored).
 * Local testing: `?from_airtable=1` on localhost, or while Vite dev (`import.meta.env.DEV`).
 */

const EXPECTED_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || ''

function isLocalHostname() {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

/**
 * Returns true when baseId in the query string matches VITE_AIRTABLE_BASE_ID.
 * Local testing: on this machine, `?from_airtable=1` bypasses the gate (works with
 * `vite` and `vite preview`, not only when import.meta.env.DEV is true).
 */
export function isAllowedReferrer() {
  if (typeof document === 'undefined') return false

  const params = new URLSearchParams(document.location.search)

  if (
    params.get('from_airtable') === '1' &&
    (import.meta.env.DEV || isLocalHostname())
  ) {
    return true
  }

  const baseId = params.get('baseId') || ''

  if (!EXPECTED_BASE_ID) return false
  return baseId === EXPECTED_BASE_ID
}
