/**
 * Gate: allow access only when URL has baseId and tableId params
 * that match the app's configured Airtable base and destination table (from env).
 * No backend—client-side check only.
 *
 * Link format for Airtable button: https://yourapp.com?baseId=appXXX&tableId=tblYYY
 */

const EXPECTED_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || ''
const EXPECTED_TABLE_ID = import.meta.env.VITE_AIRTABLE_TABLE_ID || ''

/**
 * Returns true only when the URL contains baseId and tableId query params
 * that match VITE_AIRTABLE_BASE_ID and VITE_AIRTABLE_TABLE_ID.
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
  const tableId = params.get('tableId') || ''

  if (!EXPECTED_BASE_ID || !EXPECTED_TABLE_ID) return false
  return baseId === EXPECTED_BASE_ID && tableId === EXPECTED_TABLE_ID
}
