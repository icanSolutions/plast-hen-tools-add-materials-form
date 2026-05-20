import express from 'express'
import {
  createQuoteRecord,
  mapPayloadToQuoteFields,
  computeNextQuoteReference,
  getQuoteReferenceDiagnostics,
  resolveQuoteReferenceAfterCreate,
  patchQuoteDocumentUrl,
  toRecordIds,
  formatProductsParagraphForDoc,
} from '../lib/quoteAirtable.js'
import { createQuoteContactAndLink } from '../lib/quoteContacts.js'
import { createQuotePdfFromTemplate } from '../lib/quoteDoc.js'
import { sendMail } from '../lib/email.js'

const router = express.Router()

/** Preview next QT-* for the form (same logic as submit fallback); reference is not written to Airtable. */
router.get('/next-reference', async (req, res, next) => {
  try {
    const quote_reference = await computeNextQuoteReference()
    const payload = { quote_reference }
    if (req.query.debug === '1' && process.env.NODE_ENV !== 'production') {
      payload.diagnostics = await getQuoteReferenceDiagnostics()
    }
    res.json(payload)
  } catch (err) {
    next(err)
  }
})

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

  const client_email_body_template =
    body.client_email_body_template === 'short' ||
    body.client_email_body_template === 'custom'
      ? body.client_email_body_template
      : 'formal'
  const client_email_body_html =
    body.client_email_body_html != null ? String(body.client_email_body_html) : ''

  const nc = body.new_contact
  const new_contact =
    nc && typeof nc === 'object' && String(nc.name || '').trim() !== ''
      ? {
          name: String(nc.name || '').trim(),
          email: nc.email != null ? String(nc.email).trim() : '',
          phone: nc.phone != null ? String(nc.phone).trim() : '',
        }
      : null

  let transporting = body.transporting != null ? String(body.transporting) : ''
  let additionals = body.additionals != null ? String(body.additionals) : ''
  const transport_price_before_tax =
    body.transport_price_before_tax != null
      ? Number(body.transport_price_before_tax)
      : 0

  if (delivery_to_client_by === 'company') {
    if (!transporting.trim() && body.company_transport_line != null) {
      transporting = String(body.company_transport_line).trim()
    }
    if (!additionals.trim() && body.company_transport_extras != null) {
      additionals = String(body.company_transport_extras).trim()
    }
  } else {
    transporting = ''
    additionals = ''
  }

  return {
    description: body.description ?? '',
    customer: customerIds,
    contact: contactIds,
    new_contact,
    created_by: createdByIds,
    customer_name: body.customer_name != null ? String(body.customer_name) : '',
    contact_name: body.contact_name != null ? String(body.contact_name) : '',
    created_by_name: body.created_by_name != null ? String(body.created_by_name) : '',
    transporting,
    additionals,
    transport_price_before_tax:
      delivery_to_client_by === 'company' && Number.isFinite(transport_price_before_tax)
        ? transport_price_before_tax
        : 0,
    transporting_additionals: body.transporting_additionals ?? '',
    notes: body.notes ?? '',
    internal_notes: body.internal_notes ?? '',
    products,
    products_paragraph,
    price,
    tax_price,
    total_with_tax,
    payment_conditions: body.payment_conditions ?? '',
    sketch_deliver_deadline: body.sketch_deliver_deadline || '',
    project_deadline: body.project_deadline || '',
    delivery_to_client_by,
    delivery_to_client_label,
    send_to_client: Boolean(body.send_to_client),
    client_email_body_template,
    client_email_body_html,
    send_to_client_email_additions: body.send_to_client_email_additions ?? '',
    created_at,
    hour,
    email: body.email ?? '',
    phone: body.phone ?? '',
  }
}

router.post('/submit', async (req, res, next) => {
  try {
    let normalized = normalizePayload(req.body || {})

    if (!Array.isArray(normalized.customer) || normalized.customer.length === 0) {
      return res.status(400).json({ error: 'customer (לקוח) is required (array of record ids)' })
    }

    const hasContact = Array.isArray(normalized.contact) && normalized.contact.length > 0
    const hasNewContact = Boolean(normalized.new_contact?.name)
    if (hasContact && hasNewContact) {
      return res.status(400).json({
        error: 'send either contact (existing record ids) or new_contact, not both',
      })
    }
    if (!hasContact && !hasNewContact) {
      return res.status(400).json({
        error: 'contact (איש קשר) is required, or new_contact with a name to create one',
      })
    }

    if (hasNewContact) {
      const customerId = normalized.customer[0]
      const newId = await createQuoteContactAndLink({
        customerRecordId: customerId,
        name: normalized.new_contact.name,
        email: normalized.new_contact.email,
        phone: normalized.new_contact.phone,
      })
      normalized = {
        ...normalized,
        contact: [newId],
        contact_name: normalized.new_contact.name,
        new_contact: null,
      }
    }

    if (!Array.isArray(normalized.created_by) || normalized.created_by.length === 0) {
      return res.status(400).json({ error: 'created_by (נוצר על ידי) is required (array of record ids)' })
    }

    const fields = mapPayloadToQuoteFields(normalized)
    const created = await createQuoteRecord(fields)
    const recordId = created.id

    /** Prefer formula/reference on the new row; else prediction (sorted by created_at, then scan). Not written to Airtable. */
    const quote_reference = await resolveQuoteReferenceAfterCreate(created, recordId)

    let pdfUrl = ''
    let doc_error = null
    let emailed = false
    let email_error = null

    try {
      const docPayload = { ...normalized, quote_record_id: recordId }
      const { pdfUrl: url, pdfBuffer, filename } = await createQuotePdfFromTemplate(
        docPayload,
        quote_reference
      )
      pdfUrl = url
      await patchQuoteDocumentUrl(recordId, pdfUrl)

      if (normalized.send_to_client) {
        const clientEmail = String(normalized.email || '').trim()
        if (clientEmail) {
          const subject = `הצעת מחיר - ${quote_reference || recordId} פלסט-חן`
          const html = String(normalized.client_email_body_html || '').trim()
          try {
            await sendMail(
              clientEmail,
              subject,
              '',
              [{ filename: filename || 'quote.pdf', content: pdfBuffer }],
              { html: html || undefined }
            )
            emailed = true
          } catch (mailErr) {
            console.error('[quote] client email error', mailErr.message)
            email_error = mailErr.message
          }
        } else {
          email_error = 'no client email on form'
        }
      }
    } catch (docErr) {
      console.error('[quote] document workflow error', docErr.message)
      doc_error = docErr.message
    }

    const baseId = process.env.AIRTABLE_BASE_ID
    const interfacePageId =
      (process.env.AIRTABLE_QUOTE_INTERFACE_PAGE_ID || '').trim()
    const interfaceHomePageId =
      (process.env.AIRTABLE_QUOTE_INTERFACE_HOME_PAGE_ID || 'pagDmcxhbziOJXv4N').trim()
    const quotesTableId = process.env.AIRTABLE_QUOTES_TABLE_ID

    /** Interface record page: https://airtable.com/{app}/{pag}/{rec} — open Interface, not Data table. */
    let airtable_record_url = ''
    if (baseId && recordId) {
      if (interfacePageId) {
        airtable_record_url = `https://airtable.com/${baseId}/${interfacePageId}/${recordId}?home=${interfaceHomePageId || interfacePageId}`
      } else if (quotesTableId) {
        airtable_record_url = `https://airtable.com/${baseId}/${quotesTableId}/${recordId}`
      }
    }

    res.json({
      ok: true,
      quote_record_id: recordId,
      quote_reference,
      airtable_record_url,
      pdfUrl: pdfUrl || undefined,
      doc_ok: !doc_error,
      doc_error: doc_error || undefined,
      emailed,
      email_error: email_error || undefined,
    })
  } catch (err) {
    next(err)
  }
})

export default router
