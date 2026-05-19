import {
  getSupplierById,
  getOrderById,
  patchOrderFormUrl,
} from '../lib/airtable.js'
import { copyTemplateToFolder, exportDocAsPdf, uploadPdfToDrive } from '../lib/drive.js'
import { fillOrderDoc } from '../lib/docsTemplate.js'
import { sendMail } from '../lib/email.js'
import { createSupplierOrderInAirtable } from '../lib/supplierOrderAirtable.js'

const GOOGLE_DOCS_TEMPLATE_ID = process.env.GOOGLE_DOCS_TEMPLATE_ID
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

/** Safe segment for Drive / PDF file names (Airtable `reference` field). */
function sanitizeFilenamePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

function orderDocBaseName(orderId, orderReference) {
  const ref = sanitizeFilenamePart(orderReference)
  if (ref) return `supplier-order-${ref}`
  if (orderId) return `supplier-order-${orderId}`
  return `supplier-order-${Date.now()}`
}

/**
 * Create order PDF from Google Docs template: copy template, fill placeholders + table, export as PDF, upload to Drive, patch Airtable.
 * @param {string | null} orderId - Airtable order record ID (optional; if set, fetches order_reference and patches PDF URL)
 * @param {{ supplierId?: string, date?: string, notes?: string }} order - Order payload
 * @param {Array<{ materialName?: string, freeDescription?: string, dimensions?: string, quantity?: string | number, lineNotes?: string }>} lines - Order lines
 * @returns {Promise<{ pdfBuffer: Buffer, pdfUrl: string }>}
 */
async function createOrderPdfFromTemplate(orderId, order, lines) {
  if (!GOOGLE_DOCS_TEMPLATE_ID || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('GOOGLE_DOCS_TEMPLATE_ID and GOOGLE_DRIVE_FOLDER_ID are required in server/.env')
  }
  const supplier = order?.supplierId ? await getSupplierById(order.supplierId) : { name: '' }
  const supplierName = supplier.name || ''
  let order_reference = ''
  if (orderId) {
    order_reference = await getOrderById(orderId)
  }
  const docName = orderDocBaseName(orderId, order_reference)
  console.log('[createOrderPdfFromTemplate] docName=', docName, 'reference=', order_reference || '(empty)')
  console.log('[createOrderPdfFromTemplate] next step - copy template to folder')
  const newDocId = await copyTemplateToFolder(GOOGLE_DOCS_TEMPLATE_ID, GOOGLE_DRIVE_FOLDER_ID, docName)
  const fillData = {
    supplierName,
    date: order?.date || '',
    notes: order?.notes || '',
    order_reference,
    lines: lines.map((l) => ({
      materialName: l.materialName,
      freeDescription: l.freeDescription,
      dimensions: l.dimensions,
      quantity: l.quantity,
      lineNotes: l.lineNotes,
    })),
  }
  await fillOrderDoc(newDocId, fillData)
  const pdfBuffer = await exportDocAsPdf(newDocId)
  const filename = `${docName}.pdf`
  const pdfUrl = await uploadPdfToDrive(pdfBuffer, filename)
  if (orderId) {
    await patchOrderFormUrl(orderId, pdfUrl)
  }
  return { pdfBuffer, pdfUrl }
}

/**
 * Normalize request body: orderId, order: { supplierId, date, notes, materialsSummary }, lines: []
 */
function parseBody(req) {
  const body = req.body || {}
  const { orderId, order = {}, lines = [], action } = body
  return {
    orderId: orderId || null,
    order: {
      supplierId: order.supplierId,
      date: order.date,
      notes: order.notes,
      materialsSummary: order.materialsSummary,
      /** Optional override when supplier record has no email */
      email: order.email,
    },
    lines: Array.isArray(lines) ? lines : [],
    action: action === 'save' ? 'save' : 'send',
  }
}

export function normalizeLines(lines) {
  return lines
    .map((l) => ({
      materialName: String(l.materialName || '').trim(),
      freeDescription: l.freeDescription,
      dimensions: l.dimensions || '',
      quantity: l.quantity,
      lineNotes: l.lineNotes || '',
      status: l.status || 'פעיל',
    }))
    .filter(
      (l) =>
        l.materialName ||
        l.dimensions?.trim() ||
        l.quantity !== '' ||
        l.lineNotes?.trim()
    )
}

function validateSubmitPayload({ orderId, order, lines }) {
  if (!orderId && !order?.supplierId) {
    return 'supplierId is required (or provide orderId for an existing order)'
  }
  if (!lines.length) {
    return 'At least one order line is required'
  }
  const invalid = lines.filter((l) => !l.materialName || l.quantity === '' || l.quantity == null)
  if (invalid.length) {
    return 'Each line must include materialName and quantity'
  }
  return null
}

/**
 * PDF from template → Drive → patch Airtable; optionally email supplier.
 * @param {'save' | 'send'} action
 */
export async function runSupplierOrderWorkflow({ orderId, order, lines, action }) {
  const { pdfUrl } = await createOrderPdfFromTemplate(orderId, order, lines)
  let emailed = false
  let emailTo = ''

  if (action === 'send') {
    const supplier = order?.supplierId
      ? await getSupplierById(order.supplierId)
      : { name: '', email: '' }
    emailTo = String(order?.email || supplier.email || '').trim()
    if (emailTo) {
      const text = `שלום,\nמצורף קישור להזמנת ספק: ${pdfUrl}\nבברכה`
      await sendMail(emailTo, 'הזמנת ספק', text)
      emailed = true
    }
  }

  const order_reference = orderId ? await getOrderById(orderId) : ''

  return { pdfUrl, emailed, emailTo, order_reference }
}

/**
 * POST /api/supplier-order/submit
 * Full workflow: create Airtable order + lines (unless orderId given), PDF, patch טופס הזמנה, optional email.
 * Body: {
 *   orderId?: string,
 *   order: { supplierId, date?, notes?, materialsSummary?, email? },
 *   lines: [{ materialName, dimensions?, quantity, lineNotes?, status? }],
 *   action?: "save" | "send"   // default "send"
 * }
 */
export async function handleSubmit(req, res, next) {
  try {
    const parsed = parseBody(req)
    const lines = normalizeLines(parsed.lines)
    const validationError = validateSubmitPayload({ ...parsed, lines })
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    let orderId = parsed.orderId
    let lineCount = 0
    let created = false

    if (!orderId) {
      const createdOrder = await createSupplierOrderInAirtable(parsed.order, lines)
      orderId = createdOrder.orderId
      lineCount = createdOrder.lineCount
      created = true
    }

    const workflow = await runSupplierOrderWorkflow({
      orderId,
      order: parsed.order,
      lines,
      action: parsed.action,
    })

    res.json({
      ok: true,
      orderId,
      created,
      lineCount,
      action: parsed.action,
      pdfUrl: workflow.pdfUrl,
      emailed: workflow.emailed,
      emailTo: workflow.emailTo || undefined,
      order_reference: workflow.order_reference || undefined,
    })
  } catch (err) {
    console.error('[handleSubmit] error:', err.message, err.response?.status, err.response?.data)
    next(err)
  }
}

/**
 * POST /api/supplier-order/pdf
 * Body: { orderId, order: { supplierId, date, notes, materialsSummary }, lines }
 * Generates PDF, uploads to Drive, patches Airtable טופס הזמנה. Returns JSON (no download).
 */
export async function handlePdf(req, res, next) {
  try {
    const { orderId, order, lines } = parseBody(req)
    const normalized = normalizeLines(lines)
    console.log('[handlePdf] orderId=', orderId, 'supplierId=', order?.supplierId, 'lines=', normalized.length)
    const { pdfUrl } = await createOrderPdfFromTemplate(orderId, order, normalized)
    res.json({ ok: true, pdfUrl })
  } catch (err) {
    console.error('[handlePdf] error:', err.message, err.response?.status, err.response?.data)
    next(err)
  }
}

/**
 * POST /api/supplier-order/send
 * Body: same as pdf. Generates PDF, uploads to Drive, patches Airtable טופס הזמנה, emails supplier.
 */
export async function handleSend(req, res, next) {
  try {
    const { orderId, order, lines } = parseBody(req)
    const normalized = normalizeLines(lines)
    console.log('[handleSend] orderId=', orderId, 'supplierId=', order?.supplierId, 'lines=', normalized.length)
    const workflow = await runSupplierOrderWorkflow({
      orderId,
      order,
      lines: normalized,
      action: 'send',
    })
    res.json({
      ok: true,
      pdfUrl: workflow.pdfUrl,
      emailed: workflow.emailed,
      emailTo: workflow.emailTo || undefined,
    })
  } catch (err) {
    console.error('[handleSend] error:', err.message, err.response?.status, err.response?.data)
    next(err)
  }
}

import express from 'express'

const router = express.Router()
router.post('/submit', handleSubmit)
router.post('/pdf', handlePdf)
router.post('/send', handleSend)

export default router
