import axios from 'axios'

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const SUPPLIER_ORDERS_TABLE_ID = process.env.AIRTABLE_SUPPLIER_ORDERS_TABLE_ID
const SUPPLIERS_TABLE_ID = process.env.AIRTABLE_SUPPLIERS_TABLE_ID
const ORDER_FORM_FIELD = process.env.AIRTABLE_ORDER_FORM_FIELD || 'טופס הזמנה'
const ORDER_REFERENCE_FIELD = process.env.AIRTABLE_ORDER_REFERENCE_FIELD || 'reference'
const SUPPLIERS_EMAIL_FIELD = process.env.AIRTABLE_SUPPLIERS_EMAIL_FIELD || 'מייל'

const baseUrl = (tableId) =>
  `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`

const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
})

/**
 * Fetch supplier record by ID to get name and email.
 * @param {string} supplierId - Airtable record ID (recXXX)
 * @returns {Promise<{ name: string, email: string }>}
 */
export async function getSupplierById(supplierId) {
  if (!supplierId) return { name: '', email: '' }
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SUPPLIERS_TABLE_ID}/${supplierId}`
  console.log('[airtable] getSupplierById', supplierId, 'url=', url)
  try {
    const res = await axios.get(url, { headers: headers() })
    const f = res.data.fields || {}
    const nameField = process.env.AIRTABLE_SUPPLIERS_FIELD || 'שם'
    const name = f[nameField] ?? f['Name'] ?? f['שם'] ?? ''
    const email = f[SUPPLIERS_EMAIL_FIELD] ?? f['מייל'] ?? f['Email'] ?? ''
    const out = { name: String(name).trim(), email: String(email).trim() }
    console.log('[airtable] getSupplierById result', out)
    return out
  } catch (err) {
    if (err.response?.status === 404) {
      console.warn('[airtable] getSupplierById 404 – supplier record not found, using empty name/email. Check AIRTABLE_BASE_ID and AIRTABLE_SUPPLIERS_TABLE_ID in server/.env')
      return { name: '', email: '' }
    }
    console.error('[airtable] getSupplierById error', err.response?.status, err.response?.data)
    throw err
  }
}

/**
 * Fetch supplier order record by ID and return the order reference (for {{order_reference}} in template).
 * @param {string} orderId - Airtable record ID of the order
 * @returns {Promise<string>} - Value of AIRTABLE_ORDER_REFERENCE_FIELD (default "reference")
 */
export async function getOrderById(orderId) {
  if (!orderId) return ''
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SUPPLIER_ORDERS_TABLE_ID}/${orderId}`
  try {
    const res = await axios.get(url, { headers: headers() })
    const f = res.data.fields || {}
    const ref = f[ORDER_REFERENCE_FIELD] ?? f['reference'] ?? ''
    return String(ref).trim()
  } catch (err) {
    if (err.response?.status === 404) {
      console.warn('[airtable] getOrderById 404 – order record not found')
      return ''
    }
    console.error('[airtable] getOrderById error', err.response?.status, err.response?.data)
    throw err
  }
}

/**
 * Update the supplier order record with the PDF URL (טופס הזמנה).
 * @param {string} orderId - Airtable record ID of the order
 * @param {string} pdfUrl - Public or shared link to the PDF
 */
export async function patchOrderFormUrl(orderId, pdfUrl) {
  const url = baseUrl(SUPPLIER_ORDERS_TABLE_ID)
  console.log('[airtable] patchOrderFormUrl', orderId, 'field=', ORDER_FORM_FIELD)
  try {
    await axios.patch(url, {
      records: [
        {
          id: orderId,
          fields: { [ORDER_FORM_FIELD]: pdfUrl },
        },
      ],
    }, { headers: headers() })
    console.log('[airtable] patchOrderFormUrl ok')
  } catch (err) {
    console.error('[airtable] patchOrderFormUrl error', err.response?.status, err.response?.data)
    throw err
  }
}
