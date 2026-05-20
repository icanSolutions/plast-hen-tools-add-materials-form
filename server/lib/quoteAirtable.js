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
    transporting: process.env.QUOTE_FIELD_TRANSPORTING || 'הובלה',
    additionals: process.env.QUOTE_FIELD_ADDITIONALS || 'תוספות',
    quote_document:
      process.env.QUOTE_FIELD_QUOTE_DOCUMENT ||
      process.env.QUOTE_FIELD_ADDITIONAL_DOCUMENTS ||
      'מסמכים נוספים',
    notes: process.env.QUOTE_FIELD_NOTES || 'הערות',
    internal_notes:
      process.env.QUOTE_FIELD_INTERNAL_NOTES || 'הערות פנימיות',
    products_json: process.env.QUOTE_FIELD_PRODUCTS_JSON || 'תוצרים',
    price: process.env.QUOTE_FIELD_PRICE || 'מחיר',
    tax_price: process.env.QUOTE_FIELD_TAX_PRICE || 'מעמ',
    total_with_tax: process.env.QUOTE_FIELD_TOTAL_WITH_TAX || 'סהכ כולל מעמ',
    payment_conditions: process.env.QUOTE_FIELD_PAYMENT_CONDITIONS || 'תנאי תשלום',
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

/** When the reference env is a field id (`fld…`), list/get must use `returnFieldsByFieldId` or `fields[fld]` is empty. */
function quoteReadUseFieldIds() {
  return getQuoteReferenceFieldName().trim().startsWith('fld')
}

function quoteReadParams() {
  return quoteReadUseFieldIds() ? { returnFieldsByFieldId: true } : {}
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Airtable column used to list “latest quote first” when predicting the next QT-* (default: created-at field from quoteFieldMap). */
function getQuoteSortFieldForLatestQuote() {
  const explicit = process.env.QUOTE_REFERENCE_SORT_FIELD?.trim()
  if (explicit) return explicit
  return quoteFieldMap().created_at
}

/** Log parsed reference rows when predicting the next QT-* (`QUOTE_REFERENCE_LOG_LIST=1`). */
function quoteReferenceListLoggingEnabled() {
  const v = String(process.env.QUOTE_REFERENCE_LOG_LIST || '').trim()
  if (/^(0|false|no|off)$/i.test(v)) return false
  return /^(1|true|yes|on)$/i.test(v)
}

function quoteReferenceLogMaxRows() {
  const n = parseInt(String(process.env.QUOTE_REFERENCE_LOG_LIST_MAX || '500'), 10)
  if (!Number.isFinite(n) || n < 1) return 500
  return Math.min(n, 5000)
}

function referenceFormatOptions() {
  const prefix = (process.env.QUOTE_REFERENCE_PREFIX || 'QT').trim()
  const padRaw = process.env.QUOTE_REFERENCE_NUMBER_PAD
  const padN =
    padRaw != null && String(padRaw).trim() !== ''
      ? parseInt(String(padRaw), 10)
      : null
  return { prefix, padN }
}

function formatReferenceFromSeriesNumber(n, prefix, padN) {
  if (!Number.isFinite(n)) return ''
  const k = Math.trunc(n)
  if (padN != null && Number.isFinite(padN) && padN > 0) {
    return `${prefix}-${String(k).padStart(padN, '0')}`
  }
  return `${prefix}-${k}`
}

function displayQuoteRefFromCell(cell, prefix, padN) {
  if (cell == null) return ''
  const n = parseQuoteSeriesNumber(cell, prefix)
  if (n != null) return formatReferenceFromSeriesNumber(n, prefix, padN)
  return stringifyReferenceCell(cell)
}

/** Field keys to try for the quote reference cell (primary env + optional fallbacks). */
function referenceFieldCandidates(refField) {
  const out = []
  const push = (k) => {
    const s = k != null ? String(k).trim() : ''
    if (s && !out.includes(s)) out.push(s)
  }
  push(refField)
  const envAliases = (process.env.QUOTE_REFERENCE_FALLBACK_FIELDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const k of envAliases) push(k)
  if (!quoteReadUseFieldIds()) {
    for (const k of ['reference', 'Reference', 'מספר הצעה']) push(k)
  }
  return out
}

/** First parseable series number found on the row (ordered candidates — avoids wrong numeric fields). */
function firstParsedNFromRow(fields, refField, prefix) {
  for (const key of referenceFieldCandidates(refField)) {
    const n = parseQuoteSeriesNumber(fields?.[key], prefix)
    if (n != null && !Number.isNaN(n)) return n
  }
  return null
}

function formatRefFromRowFields(fields, refField, prefix, padN) {
  for (const key of referenceFieldCandidates(refField)) {
    const cell = fields?.[key]
    const s = displayQuoteRefFromCell(cell, prefix, padN).trim()
    if (s) return s
  }
  return ''
}

/**
 * After Airtable create: prefer the formula/reference on the new row (truth), else GET once, else sorted prediction.
 * Reference is never written by the API — only read for display and n8n.
 */
export async function resolveQuoteReferenceAfterCreate(created, recordId) {
  const refField = getQuoteReferenceFieldName()
  const { prefix, padN } = referenceFormatOptions()

  const fromFields = (fields) => formatRefFromRowFields(fields, refField, prefix, padN)

  let ref = fromFields(created?.fields)
  if (ref) return ref

  for (let attempt = 0; attempt < 3 && !ref; attempt++) {
    if (attempt > 0) await delay(280)
    try {
      const rec = await getQuoteRecordById(recordId)
      ref = fromFields(rec.fields)
      if (ref) return ref
    } catch (e) {
      console.warn('[quote] re-fetch record for reference:', e.message)
    }
  }

  const predicted = await computeNextQuoteReference()
  const tailNum = predicted.match(/-(\d+)$/)?.[1]
  if (tailNum === '1') {
    console.warn(
      '[quote] quote_reference fell back to …-1; check AIRTABLE_QUOTE_REFERENCE_FIELD (if it is `fld…`, reads now use returnFieldsByFieldId), QUOTE_REFERENCE_PREFIX, and QUOTE_REFERENCE_SORT_FIELD / QUOTE_FIELD_CREATED_AT'
    )
  }
  return predicted
}

/**
 * Normalize an Airtable cell to a display string (lookup/multiselect → first value).
 */
export function stringifyReferenceCell(value) {
  if (value == null) return ''
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value && typeof value === 'object' && 'error' in value) return ''
  }
  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      value.every((x) => typeof x === 'string' && x.length === 1)
    ) {
      return value.join('').trim()
    }
    const x = value[0]
    return x != null ? String(x).trim() : ''
  }
  return String(value).trim()
}

function pushQuoteReferenceLogEntry(arr, r, refField, prefix, padN) {
  const fields = r.fields || {}
  const primaryRaw = fields[refField]
  arr.push({
    id: r.id,
    n: firstParsedNFromRow(fields, refField, prefix),
    display: formatRefFromRowFields(fields, refField, prefix, padN) || null,
    primaryCell: stringifyReferenceCell(primaryRaw).trim() || null,
  })
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

  if (payload.transporting != null && String(payload.transporting).trim() !== '') {
    fields[f.transporting] = String(payload.transporting)
  }
  if (payload.additionals != null && String(payload.additionals).trim() !== '') {
    fields[f.additionals] = String(payload.additionals)
  }
  /** @deprecated combined field — only written if separate fields are empty */
  if (
    payload.transporting_additionals != null &&
    String(payload.transporting_additionals).trim() !== '' &&
    !fields[f.transporting] &&
    !fields[f.additionals]
  ) {
    fields[f.transporting] = String(payload.transporting_additionals)
  }
  if (payload.notes != null) fields[f.notes] = String(payload.notes)
  if (payload.internal_notes != null) {
    fields[f.internal_notes] = String(payload.internal_notes)
  }

  const descOnly =
    payload.description != null ? String(payload.description).trim() : ''
  if (descOnly !== '') {
    fields[f.description] = descOnly
  }

  const productsParagraph =
    payload.products_paragraph != null
      ? String(payload.products_paragraph).trim()
      : ''
  if (productsParagraph !== '') {
    fields[f.products_json] = productsParagraph
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
  if (payload.sketch_deliver_deadline) {
    fields[f.sketch_deliver_deadline] = String(payload.sketch_deliver_deadline).trim()
  }
  if (payload.project_deadline) {
    fields[f.project_deadline] = String(payload.project_deadline).trim()
  }
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

/**
 * Patch quote record with generated PDF URL (מסמכים נוספים / quote document field).
 */
export async function patchQuoteDocumentUrl(recordId, pdfUrl) {
  const tableId = process.env.AIRTABLE_QUOTES_TABLE_ID
  const fieldKey = quoteFieldMap().quote_document
  if (!tableId || !recordId || !fieldKey) {
    throw new Error('Cannot patch quote document URL: missing table or field config')
  }
  const url = tableUrl(tableId)
  await axios.patch(
    url,
    {
      records: [
        {
          id: recordId,
          fields: { [fieldKey]: pdfUrl },
        },
      ],
    },
    { headers: headers() }
  )
}

export async function getQuoteRecordById(recordId) {
  const tableId = process.env.AIRTABLE_QUOTES_TABLE_ID
  if (!baseId || !apiKey) throw new Error('AIRTABLE_BASE_ID and AIRTABLE_API_KEY are required')
  if (!tableId) throw new Error('AIRTABLE_QUOTES_TABLE_ID is required')

  const url = `${tableUrl(tableId)}/${recordId}`
  const res = await axios.get(url, {
    headers: headers(),
    params: quoteReadParams(),
  })
  return res.data
}

/**
 * Extracts the numeric part of a quote reference cell (formula may return number, "21", "QT-21", "QT - 21", etc.).
 */
function parseQuoteSeriesNumber(cell, prefix) {
  if (cell == null) return null
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return Math.trunc(cell)
  }
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const v = stringifyReferenceCell(cell).trim()
  if (!v) return null

  const patterns = [
    new RegExp(`^${escapedPrefix}\\s*-\\s*(\\d+)$`, 'i'),
    new RegExp(`^${escapedPrefix}\\s+(\\d+)$`, 'i'),
    new RegExp(`^${escapedPrefix}(\\d+)$`, 'i'),
    /^(\d+)$/,
    /(\d+)\s*$/,
  ]
  for (const re of patterns) {
    const m = v.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!Number.isNaN(n)) return n
    }
  }
  return null
}

/**
 * Fallback: paginated scan (unordered) for max N in PREFIX-N.
 */
async function scanPagesForMaxQuoteSeriesNumber(
  tableId,
  refField,
  prefix,
  padN,
  refsLog
) {
  let maxNum = 0
  let offset
  const maxPages = Math.max(1, Number(process.env.QUOTE_REFERENCE_MAX_SCAN_PAGES || 30))
  const logCap = quoteReferenceLogMaxRows()

  for (let page = 0; page < maxPages; page++) {
    const params = { maxRecords: 100, ...quoteReadParams() }
    if (offset) params.offset = offset

    const res = await axios.get(tableUrl(tableId), { params, headers: headers() })
    const records = res.data.records || []
    for (const r of records) {
      if (refsLog && refsLog.length < logCap) {
        pushQuoteReferenceLogEntry(refsLog, r, refField, prefix, padN)
      }
      const n = firstParsedNFromRow(r.fields, refField, prefix)
      if (n != null && !Number.isNaN(n)) maxNum = Math.max(maxNum, n)
    }
    offset = res.data.offset
    if (!offset) break
  }
  return maxNum
}

/**
 * Predicts the next reference (e.g. QT-42) for display and n8n only — does not write to Airtable.
 * Primary: quotes sorted by `created_at` (paginated), take the **maximum** parseable N among those rows, return PREFIX-(N+1).
 * Fallback: full unordered paginated max scan if sort fails or yields no parseable refs.
 *
 * Configure `QUOTE_REFERENCE_SORT_FIELD` (e.g. `created_at`) or `QUOTE_FIELD_CREATED_AT` so it matches your base column.
 */
export async function computeNextQuoteReference() {
  const tableId = process.env.AIRTABLE_QUOTES_TABLE_ID
  if (!baseId || !apiKey) throw new Error('AIRTABLE_BASE_ID and AIRTABLE_API_KEY are required')
  if (!tableId) throw new Error('AIRTABLE_QUOTES_TABLE_ID is required')

  const refField = getQuoteReferenceFieldName()
  const { prefix, padN } = referenceFormatOptions()
  const sortField = getQuoteSortFieldForLatestQuote()
  const logRefs = quoteReferenceListLoggingEnabled()
  const logCap = quoteReferenceLogMaxRows()
  const sortedRefs = logRefs ? [] : null
  const scanRefs = logRefs ? [] : null

  let maxFromSorted = 0
  try {
    let offset
    const maxSortPages = Math.max(1, Number(process.env.QUOTE_REFERENCE_SORT_MAX_PAGES || 15))
    for (let page = 0; page < maxSortPages; page++) {
      const params = {
        maxRecords: 100,
        'sort[0][field]': sortField,
        'sort[0][direction]': 'desc',
        ...quoteReadParams(),
      }
      if (offset) params.offset = offset

      const res = await axios.get(tableUrl(tableId), { params, headers: headers() })
      const records = res.data.records || []
      for (const r of records) {
        if (sortedRefs && sortedRefs.length < logCap) {
          pushQuoteReferenceLogEntry(sortedRefs, r, refField, prefix, padN)
        }
        const n = firstParsedNFromRow(r.fields, refField, prefix)
        if (n != null && !Number.isNaN(n)) maxFromSorted = Math.max(maxFromSorted, n)
      }
      offset = res.data.offset
      if (!offset) break
    }
  } catch (err) {
    console.warn(
      '[quote] sorted reference lookup failed (check QUOTE_REFERENCE_SORT_FIELD / QUOTE_FIELD_CREATED_AT):',
      err.response?.data?.error?.message || err.message
    )
  }

  const maxFromScan = await scanPagesForMaxQuoteSeriesNumber(
    tableId,
    refField,
    prefix,
    padN,
    scanRefs
  )
  const maxNum = Math.max(maxFromSorted, maxFromScan)
  if (logRefs) {
    console.log('[quote] references list (sorted, newest first)', {
      sortField,
      refField,
      prefix,
      maxParsedN: maxFromSorted,
      rowCap: logCap,
      rows: sortedRefs,
    })
    console.log('[quote] references list (unordered scan pages)', {
      refField,
      prefix,
      maxParsedN: maxFromScan,
      rowCap: logCap,
      rows: scanRefs,
    })
  }
  if (maxNum === 0) {
    console.warn(
      '[quote] no existing quote reference parsed (max=0 → next QT-1). Check AIRTABLE_QUOTE_REFERENCE_FIELD / QUOTE_REFERENCE_FALLBACK_FIELDS, QUOTE_REFERENCE_PREFIX, and QUOTE_REFERENCE_SORT_FIELD. In development, GET /api/quote/next-reference?debug=1 for samples.'
    )
  }
  return formatReferenceFromSeriesNumber(maxNum + 1, prefix, padN)
}

/**
 * Non-production diagnostics: how Airtable rows look for reference parsing (no secrets).
 * Use GET /api/quote/next-reference?debug=1 with NODE_ENV !== 'production'.
 */
export async function getQuoteReferenceDiagnostics() {
  const refField = getQuoteReferenceFieldName()
  const sortField = getQuoteSortFieldForLatestQuote()
  const { prefix, padN } = referenceFormatOptions()
  const tableId = process.env.AIRTABLE_QUOTES_TABLE_ID
  const out = {
    refField,
    sortField,
    prefix,
    fieldIdMode: quoteReadUseFieldIds(),
    quoteReferenceSortFieldEnv: (process.env.QUOTE_REFERENCE_SORT_FIELD || '').trim(),
    quoteFieldCreatedAtEnv: (process.env.QUOTE_FIELD_CREATED_AT || '').trim(),
    defaultCreatedAtColumnName: quoteFieldMap().created_at,
    candidateKeys: referenceFieldCandidates(refField),
  }
  if (!baseId || !apiKey || !tableId) {
    out.error = 'missing AIRTABLE_BASE_ID, AIRTABLE_API_KEY, or AIRTABLE_QUOTES_TABLE_ID'
    return out
  }
  try {
    const res = await axios.get(tableUrl(tableId), {
      params: { maxRecords: 5, ...quoteReadParams() },
      headers: headers(),
    })
    const records = res.data.records || []
    out.unsortedListCount = records.length
    out.unsortedSamples = records.map((r) => ({
      id: r.id,
      fieldKeysHead: Object.keys(r.fields || {}).slice(0, 18),
      primaryCell: r.fields?.[refField],
      displayRefFromCandidates: formatRefFromRowFields(r.fields, refField, prefix, padN),
      firstParsedN: firstParsedNFromRow(r.fields, refField, prefix),
    }))
  } catch (e) {
    out.unsortedListError = e.response?.data?.error || e.message
  }
  try {
    const res = await axios.get(tableUrl(tableId), {
      params: {
        maxRecords: 5,
        'sort[0][field]': sortField,
        'sort[0][direction]': 'desc',
        ...quoteReadParams(),
      },
      headers: headers(),
    })
    const records = res.data.records || []
    out.sortedListCount = records.length
    out.sortedSamples = records.map((r) => ({
      id: r.id,
      primaryCell: r.fields?.[refField],
      displayRefFromCandidates: formatRefFromRowFields(r.fields, refField, prefix, padN),
      firstParsedN: firstParsedNFromRow(r.fields, refField, prefix),
    }))
  } catch (e) {
    out.sortedListError = e.response?.data?.error || e.message
  }
  return out
}
