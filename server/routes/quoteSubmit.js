import express from 'express'
import axios from 'axios'
import {
  createQuoteRecord,
  getQuoteRecordById,
  mapPayloadToQuoteFields,
  getQuoteReferenceFieldName,
  toRecordIds,
  formatProductsParagraphForDoc,
} from '../lib/quoteAirtable.js'

const router = express.Router()

/**
 * First Airtable record id from a linked-record field (array of rec… ids).
 * Never use raw `[0]` on an unknown value: if a string was passed by mistake,
 * `str[0]` is only the first character (e.g. Hebrew name).
 */
function firstLinkedRecordId(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return ''
  const id = ids[0]
  return typeof id === 'string' ? id : ''
}

function displayNameOrRecordId(name, linkedIds) {
  const trimmed = name != null ? String(name).trim() : ''
  if (trimmed) return trimmed
  return firstLinkedRecordId(linkedIds)
}

/** Google Docs replaceText expects strings — n8n forwards these as replace_text. */
function priceFieldString(value) {
  const n = value != null && value !== '' ? Number(value) : NaN
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function normalizePayload(body) {
  const products = Array.isArray(body.products)
    ? body.products.map((p) => ({
        description: p.description != null ? String(p.description) : '',
        price: p.price != null && p.price !== '' ? Number(p.price) : 0,
      }))
    : []

  const priceSum = products.reduce((s, p) => s + (Number.isFinite(p.price) ? p.price : 0), 0)
  const price = body.price != null ? Number(body.price) : priceSum
  const tax_price = body.tax_price != null ? Number(body.tax_price) : Math.round(price * 0.18 * 100) / 100
  const total_with_tax =
    body.total_with_tax != null
      ? Number(body.total_with_tax)
      : Math.round((price + tax_price) * 100) / 100

  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const created_at =
    body.created_at || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const hour =
    body.hour != null && body.hour !== ''
      ? String(body.hour)
      : `${pad(now.getHours())}:${pad(now.getMinutes())}`

  const customerIds = toRecordIds(body.customer)
  const contactIds = toRecordIds(body.contact)
  const createdByIds = toRecordIds(body.created_by)

  const deliveryBy = body.delivery_to_client_by
  const delivery_to_client_by =
    deliveryBy === 'company' || deliveryBy === 'client' ? deliveryBy : ''
  const delivery_to_client_label =
    delivery_to_client_by === 'company'
      ? 'ע״י החברה'
      : delivery_to_client_by === 'client'
        ? 'ע״י הלקוח'
        : ''

  const products_paragraph = formatProductsParagraphForDoc(products)

  return {
    description: body.description ?? '',
    customer: customerIds,
    contact: contactIds,
    created_by: createdByIds,
    customer_name: body.customer_name != null ? String(body.customer_name) : '',
    contact_name: body.contact_name != null ? String(body.contact_name) : '',
    created_by_name: body.created_by_name != null ? String(body.created_by_name) : '',
    transporting_additionals: body.transporting_additionals ?? '',
    notes: body.notes ?? '',
    internal_notes: body.internal_notes ?? '',
    products,
    products_paragraph,
    price,
    tax_price,
    total_with_tax,
    payment_conditions: body.payment_conditions ?? '',
    payment_deadline: body.payment_deadline || '',
    sketch_deliver_deadline: body.sketch_deliver_deadline || '',
    project_deadline: body.project_deadline || '',
    delivery_to_client_by,
    delivery_to_client_label,
    send_to_client: Boolean(body.send_to_client),
    send_to_client_email_additions: body.send_to_client_email_additions ?? '',
    created_at,
    hour,
    email: body.email ?? '',
    phone: body.phone ?? '',
  }
}

router.post('/submit', async (req, res, next) => {
  try {
    const normalized = normalizePayload(req.body || {})

    if (!Array.isArray(normalized.customer) || normalized.customer.length === 0) {
      return res.status(400).json({ error: 'customer (לקוח) is required (array of record ids)' })
    }
    if (!Array.isArray(normalized.contact) || normalized.contact.length === 0) {
      return res.status(400).json({ error: 'contact (איש קשר) is required (array of record ids)' })
    }
    if (!Array.isArray(normalized.created_by) || normalized.created_by.length === 0) {
      return res.status(400).json({ error: 'created_by (נוצר על ידי) is required (array of record ids)' })
    }

    const fields = mapPayloadToQuoteFields(normalized)
    const created = await createQuoteRecord(fields)
    const recordId = created.id

    const full = await getQuoteRecordById(recordId)
    const refField = getQuoteReferenceFieldName()
    const quote_reference =
      full.fields?.[refField] != null ? String(full.fields[refField]) : ''

    const n8nUrl = process.env.N8N_QUOTE_WEBHOOK_URL
    const n8nSecret = process.env.N8N_QUOTE_WEBHOOK_SECRET

    // n8n / Google Docs: price fields must be strings for replaceText (not numbers).
    const outbound = {
      quote_record_id: recordId,
      quote_reference,
      ...normalized,
      products_json: JSON.stringify(normalized.products),
      customer: displayNameOrRecordId(normalized.customer_name, normalized.customer),
      customer_record_id: firstLinkedRecordId(normalized.customer),
      contact: displayNameOrRecordId(normalized.contact_name, normalized.contact),
      contact_record_id: firstLinkedRecordId(normalized.contact),
      created_by: displayNameOrRecordId(normalized.created_by_name, normalized.created_by),
      created_by_record_id: firstLinkedRecordId(normalized.created_by),
      price: priceFieldString(normalized.price),
      tax_price: priceFieldString(normalized.tax_price),
      total_with_tax: priceFieldString(normalized.total_with_tax),
    }

    let n8n_ok = null
    let n8n_error = null
    if (n8nUrl) {
      const n8nHeaders = { 'Content-Type': 'application/json' }
      if (n8nSecret) n8nHeaders['X-Webhook-Secret'] = n8nSecret
      try {
        const r = await axios.post(n8nUrl, outbound, {
          headers: n8nHeaders,
          timeout: 60000,
          validateStatus: (s) => s < 500,
        })
        n8n_ok = r.status >= 200 && r.status < 300
        if (!n8n_ok) {
          console.error('[quote] n8n response', r.status, r.data)
          n8n_error = `HTTP ${r.status}`
        }
      } catch (err) {
        console.error('[quote] n8n error', err.message)
        n8n_ok = false
        n8n_error = err.response?.data?.message || err.message
      }
    }

    const baseId = process.env.AIRTABLE_BASE_ID
    const interfacePageId =
      (process.env.AIRTABLE_QUOTE_INTERFACE_PAGE_ID || '').trim()
    const quotesTableId = process.env.AIRTABLE_QUOTES_TABLE_ID

    /** Interface record page: https://airtable.com/{app}/{pag}/{rec} — open Interface, not Data table. */
    let airtable_record_url = ''
    if (baseId && recordId) {
      if (interfacePageId) {
        airtable_record_url = `https://airtable.com/${baseId}/${interfacePageId}/${recordId}?home=${interfacePageId}`
      } else if (quotesTableId) {
        airtable_record_url = `https://airtable.com/${baseId}/${quotesTableId}/${recordId}`
      }
    }

    res.json({
      ok: true,
      quote_record_id: recordId,
      quote_reference,
      airtable_record_url,
      n8n_called: Boolean(n8nUrl),
      n8n_ok,
      n8n_error,
    })
  } catch (err) {
    next(err)
  }
})

export default router
