import axios from 'axios'

const baseId = process.env.AIRTABLE_BASE_ID
const apiKey = process.env.AIRTABLE_API_KEY

function headers() {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function tableUrl(tableId) {
  return `https://api.airtable.com/v0/${baseId}/${tableId}`
}

function quoteFieldMap() {
  return {
    description: process.env.QUOTE_FIELD_DESCRIPTION || 'תיאור',
    customer: process.env.QUOTE_FIELD_CUSTOMER || 'לקוח',
    contact: process.env.QUOTE_FIELD_CONTACT || 'איש קשר',
    created_by: process.env.QUOTE_FIELD_CREATED_BY || 'נוצר על ידי',
    customer_name_text: process.env.QUOTE_FIELD_CUSTOMER_NAME_TEXT || '',
    contact_name_text: process.env.QUOTE_FIELD_CONTACT_NAME_TEXT || '',
    created_by_name_text: process.env.QUOTE_FIELD_CREATED_BY_NAME_TEXT || '',
    transporting_additionals:
      process.env.QUOTE_FIELD_TRANSPORTING || 'הובלה ותוספות',
    notes: process.env.QUOTE_FIELD_NOTES || 'הערות',
    internal_notes:
      process.env.QUOTE_FIELD_INTERNAL_NOTES || 'הערות פנימיות',
    products_json: process.env.QUOTE_FIELD_PRODUCTS_JSON || 'תוצרים',
    price: process.env.QUOTE_FIELD_PRICE || 'מחיר',
    tax_price: process.env.QUOTE_FIELD_TAX_PRICE || 'מעמ',
    total_with_tax: process.env.QUOTE_FIELD_TOTAL_WITH_TAX || 'סהכ כולל מעמ',
    payment_conditions: process.env.QUOTE_FIELD_PAYMENT_CONDITIONS || 'תנאי תשלום',
    payment_deadline: process.env.QUOTE_FIELD_PAYMENT_DEADLINE || 'מועד תשלום',
    sketch_deliver_deadline:
      process.env.QUOTE_FIELD_SKETCH_DEADLINE || 'מועד מסירת סקיצה',
    project_deadline: process.env.QUOTE_FIELD_PROJECT_DEADLINE || 'מועד פרויקט',
    delivery_to_client:
      process.env.QUOTE_FIELD_DELIVERY_TO_CLIENT || 'הובלה ללקוח',
    send_to_client: process.env.QUOTE_FIELD_SEND_TO_CLIENT || 'שליחה ללקוח',
    send_to_client_email_additions:
      process.env.QUOTE_FIELD_SEND_TO_CLIENT_EMAIL_ADDITIONS ||
      'תוספות לגוף המייל (שליחה ללקוח)',
    created_at: process.env.QUOTE_FIELD_CREATED_AT || 'תאריך יצירה',
    hour: process.env.QUOTE_FIELD_HOUR || 'שעה',
  }
}

export function getQuoteReferenceFieldName() {
  return process.env.AIRTABLE_QUOTE_REFERENCE_FIELD || 'reference'
}

/**
 * Plain-text block for docs / placeholders: each product with תיאור and מחיר (he-IL numbers).
 */
export function formatProductsParagraphForDoc(products) {
  const list = Array.isArray(products) ? products : []
  if (list.length === 0) return ''
  return list
    .map((p, i) => {
      const desc = p.description != null ? String(p.description).trim() : ''
      const raw = p.price != null && p.price !== '' ? Number(p.price) : 0
      const n = Number.isFinite(raw) ? raw : 0
      const priceFormatted = n.toLocaleString('he-IL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
      return `תוצר ${i + 1}\nתיאור: ${desc || '—'}\nמחיר: ${priceFormatted} ₪`
    })
    .join('\n\n')
}

/**
 * Normalize Airtable linked-record value to an array of record IDs (rec…).
 * Accepts a single id string or an array of ids (avoids nested arrays).
 */
export function toRecordIds(value) {
  if (value == null || value === '') return []
  const raw = Array.isArray(value) ? value : [value]
  const out = []
  for (const item of raw) {
    const s = item != null ? String(item).trim() : ''
    if (s.startsWith('rec')) out.push(s)
  }
  return [...new Set(out)]
}

/**
 * Build Airtable fields object from normalized quote payload (camelCase keys).
 */
export function mapPayloadToQuoteFields(payload) {
  const f = quoteFieldMap()

  const fields = {}

  const customerIds = toRecordIds(payload.customer)
  if (customerIds.length) fields[f.customer] = customerIds

  const contactIds = toRecordIds(payload.contact)
  if (contactIds.length) fields[f.contact] = contactIds

  const createdByIds = toRecordIds(payload.created_by)
  if (createdByIds.length) fields[f.created_by] = createdByIds

  // Optional mirror text columns for readable names in Airtable (in addition to linked ids).
  if (f.customer_name_text && payload.customer_name != null && String(payload.customer_name).trim() !== '') {
    fields[f.customer_name_text] = String(payload.customer_name)
  }
  if (f.contact_name_text && payload.contact_name != null && String(payload.contact_name).trim() !== '') {
    fields[f.contact_name_text] = String(payload.contact_name)
  }
  if (f.created_by_name_text && payload.created_by_name != null && String(payload.created_by_name).trim() !== '') {
    fields[f.created_by_name_text] = String(payload.created_by_name)
  }

  if (payload.transporting_additionals != null) {
    fields[f.transporting_additionals] = String(payload.transporting_additionals)
  }
  if (payload.notes != null) fields[f.notes] = String(payload.notes)
  if (payload.internal_notes != null) {
    fields[f.internal_notes] = String(payload.internal_notes)
  }

  const products = payload.products_paragraph

  if (process.env.QUOTE_WRITE_PRODUCTS_JSON_TO_AIRTABLE === 'true') {
    fields[f.products_json] = JSON.stringify(products)
  }

  const descOnly =
    payload.description != null ? String(payload.description).trim() : ''
  const para =
    payload.products_paragraph != null
      ? String(payload.products_paragraph).trim()
      : ''
  const descriptionCombined = [descOnly, para].filter(Boolean).join('\n\n')
  if (descriptionCombined !== '') {
    fields[f.description] = descriptionCombined
  }

  /** Single price column = total incl. VAT (no separate מעמ / סהכ columns in Airtable). */
  const priceUsesTotalWithTax =
    process.env.QUOTE_PRICE_USES_TOTAL_WITH_TAX === 'true' ||
    process.env.QUOTE_STORE_TOTAL_IN_PRICE_FIELD === 'true'

  const writeTax =
    !priceUsesTotalWithTax &&
    process.env.QUOTE_WRITE_TAX_TO_AIRTABLE !== 'false' &&
    process.env.QUOTE_OMIT_TAX_FIELDS !== 'true'

  if (priceUsesTotalWithTax) {
    const total =
      payload.total_with_tax != null && !Number.isNaN(Number(payload.total_with_tax))
        ? Number(payload.total_with_tax)
        : payload.price != null && !Number.isNaN(Number(payload.price))
          ? Number(payload.price)
          : null
    if (total != null) fields[f.price] = total
  } else if (payload.price != null && !Number.isNaN(Number(payload.price))) {
    fields[f.price] = Number(payload.price)
  }
  if (
    writeTax &&
    payload.tax_price != null &&
    !Number.isNaN(Number(payload.tax_price))
  ) {
    fields[f.tax_price] = Number(payload.tax_price)
  }
  if (
    writeTax &&
    payload.total_with_tax != null &&
    !Number.isNaN(Number(payload.total_with_tax))
  ) {
    fields[f.total_with_tax] = Number(payload.total_with_tax)
  }
  if (payload.payment_conditions != null) {
    fields[f.payment_conditions] = String(payload.payment_conditions)
  }
  if (payload.payment_deadline) fields[f.payment_deadline] = payload.payment_deadline
  if (payload.sketch_deliver_deadline) {
    fields[f.sketch_deliver_deadline] = payload.sketch_deliver_deadline
  }
  if (payload.project_deadline) fields[f.project_deadline] = payload.project_deadline
  if (payload.delivery_to_client_label != null && payload.delivery_to_client_label !== '') {
    fields[f.delivery_to_client] = String(payload.delivery_to_client_label)
  }
  if (typeof payload.send_to_client === 'boolean') {
    fields[f.send_to_client] = payload.send_to_client
  }
  const sentToClientDateField = process.env.QUOTE_FIELD_SENT_TO_CLIENT_DATE
  if (sentToClientDateField && payload.send_to_client === true) {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    fields[sentToClientDateField.trim()] = `${y}-${m}-${day}`
  }
  if (payload.send_to_client_email_additions != null) {
    fields[f.send_to_client_email_additions] = String(payload.send_to_client_email_additions)
  }
  // תאריך/שעה יצירה — לרוב שדות מחושבים ב-Airtable; כתיבה רק אם מפעילים במפורש
  if (process.env.QUOTE_WRITE_CREATED_AT_TO_AIRTABLE === 'true') {
    if (payload.created_at) fields[f.created_at] = payload.created_at
    if (payload.hour != null) fields[f.hour] = String(payload.hour)
  }
  // email / phone: form-only + n8n payload; not written to Airtable unless explicitly enabled
  if (process.env.QUOTE_WRITE_EMAIL_PHONE_TO_AIRTABLE === 'true') {
    const emailField = process.env.QUOTE_FIELD_EMAIL || 'אימייל'
    const phoneField = process.env.QUOTE_FIELD_PHONE || 'טלפון'
    if (payload.email != null) fields[emailField] = String(payload.email)
    if (payload.phone != null) fields[phoneField] = String(payload.phone)
  }

  return fields
}

export async function createQuoteRecord(fields) {
  const tableId = process.env.AIRTABLE_QUOTES_TABLE_ID
  if (!baseId || !apiKey) throw new Error('AIRTABLE_BASE_ID and AIRTABLE_API_KEY are required')
  if (!tableId) throw new Error('AIRTABLE_QUOTES_TABLE_ID is required')

  const res = await axios.post(
    tableUrl(tableId),
    { records: [{ fields }] },
    { headers: headers() }
  )
  const rec = res.data.records?.[0]
  if (!rec?.id) throw new Error('Airtable did not return quote record id')
  return rec
}

export async function getQuoteRecordById(recordId) {
  const tableId = process.env.AIRTABLE_QUOTES_TABLE_ID
  if (!baseId || !apiKey) throw new Error('AIRTABLE_BASE_ID and AIRTABLE_API_KEY are required')
  if (!tableId) throw new Error('AIRTABLE_QUOTES_TABLE_ID is required')

  const url = `${tableUrl(tableId)}/${recordId}`
  const res = await axios.get(url, { headers: headers() })
  return res.data
}
