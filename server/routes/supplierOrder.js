import { getSupplierById, getOrderById, patchOrderFormUrl } from '../lib/airtable.js'
import { copyTemplateToFolder, exportDocAsPdf, uploadPdfToDrive } from '../lib/drive.js'
import { fillOrderDoc } from '../lib/docsTemplate.js'
import { sendMail } from '../lib/email.js'

const GOOGLE_DOCS_TEMPLATE_ID = process.env.GOOGLE_DOCS_TEMPLATE_ID
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

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
  const docName = `supplier-order-${orderId || Date.now()}`
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
  const { orderId, order = {}, lines = [] } = req.body || {}
  return {
    orderId,
    order: {
      supplierId: order.supplierId,
      date: order.date,
      notes: order.notes,
      materialsSummary: order.materialsSummary,
    },
    lines: Array.isArray(lines) ? lines : [],
  }
}

/**
 * POST /api/supplier-order/pdf
 * Body: { orderId, order: { supplierId, date, notes, materialsSummary }, lines }
 * Returns: PDF buffer with Content-Disposition: attachment
 */
export async function handlePdf(req, res, next) {
  try {
    const { orderId, order, lines } = parseBody(req)
    console.log('[handlePdf] orderId=', orderId, 'supplierId=', order?.supplierId, 'lines=', lines?.length)
    const { pdfBuffer } = await createOrderPdfFromTemplate(orderId, order, lines)
    const filename = `supplier-order-${orderId || Date.now()}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(pdfBuffer)
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
    console.log('[handleSend] orderId=', orderId, 'supplierId=', order?.supplierId, 'lines=', lines?.length)
    const supplier = order?.supplierId ? await getSupplierById(order.supplierId) : { name: '', email: '' }
    const supplierEmail = supplier.email
    console.log('[handleSend] supplier name=', supplier.name, 'email=', supplierEmail ? '(set)' : '(empty)')

    const { pdfUrl } = await createOrderPdfFromTemplate(orderId, order, lines)

    if (supplierEmail) {
      const text = `שלום,\nמצורף קישור להזמנת ספק: ${pdfUrl}\nבברכה`
      await sendMail(supplierEmail, 'הזמנת ספק', text)
    }

    res.json({ ok: true, pdfUrl, emailed: !!supplierEmail })
  } catch (err) {
    console.error('[handleSend] error:', err.message, err.response?.status, err.response?.data)
    next(err)
  }
}

import express from 'express'

const router = express.Router()
router.post('/pdf', handlePdf)
router.post('/send', handleSend)

export default router
