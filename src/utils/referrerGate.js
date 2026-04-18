/**
 * Gate: allow access only when the URL has a baseId query param that matches
 * VITE_AIRTABLE_BASE_ID (Airtable app / base id). Client-side check only.
 *
 * Link format: https://yourapp.com?baseId=appXXX (optional &tableId=... is ignored).
 * In development, ?from_airtable=1 also allows access for local testing.
 */

const EXPECTED_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || ''

/**
 * Returns true when baseId in the query string matches VITE_AIRTABLE_BASE_ID.
 * In development, ?from_airtable=1 also allows access for local testing.
 */
export function isAllowedReferrer() {
  if (typeof document === 'undefined') return false

  const params = new URLSearchParams(document.location.search)

  // Dev-only: bypass for local testing without real params
  if (import.meta.env.DEV && params.get('from_airtable') === '1') {
    return true
  }

  const baseId = params.get('baseId') || ''

  if (!EXPECTED_BASE_ID) return false
  return baseId === EXPECTED_BASE_ID
}
