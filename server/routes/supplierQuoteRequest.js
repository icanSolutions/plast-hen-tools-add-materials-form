import express from 'express'
import { copyTemplateToFolder, exportDocAsPdf, uploadPdfToDrive } from '../lib/drive.js'
import { fillOrderDoc } from '../lib/docsTemplate.js'
import { createSupplierQuoteRequestRecord } from '../lib/supplierQuoteRequestAirtable.js'

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID
const GOOGLE_DOCS_QUOTE_DEMAND_TEMPLATE_ID =
  process.env.GOOGLE_DOCS_QUOTE_DEMAND_TEMPLATE_ID ||
  process.env.GOOGLE_DOCS_SUPPLIER_QUOTE_DEMAND_TEMPLATE_ID

function sanitizeFilenamePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

function quoteDemandDocBaseName(supplierName, date) {
  const name = sanitizeFilenamePart(supplierName) || 'supplier'
  const d = sanitizeFilenamePart(date) || String(Date.now())
  return `supplier-quote-demand-${name}-${d}`
}

/**
 * @param {{ supplierName: string, date: string, notes?: string, lines: Array }} docData
 */
async function createQuoteDemandPdf(docData) {
  if (!GOOGLE_DOCS_QUOTE_DEMAND_TEMPLATE_ID || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error(
      'GOOGLE_DOCS_QUOTE_DEMAND_TEMPLATE_ID and GOOGLE_DRIVE_FOLDER_ID are required in server/.env'
    )
  }
  const docName = quoteDemandDocBaseName(docData.supplierName, docData.date)
  const newDocId = await copyTemplateToFolder(
    GOOGLE_DOCS_QUOTE_DEMAND_TEMPLATE_ID,
    GOOGLE_DRIVE_FOLDER_ID,
    docName
  )
  await fillOrderDoc(newDocId, {
    supplierName: docData.supplierName,
    date: docData.date,
    notes: docData.notes || '',
    order_reference: '',
    lines: docData.lines,
  })
  const pdfBuffer = await exportDocAsPdf(newDocId)
  const filename = `${docName}.pdf`
  const pdfUrl = await uploadPdfToDrive(pdfBuffer, filename)
  return { pdfUrl, docName }
}

function buildAirtableRecordUrl(recordId) {
  if (!recordId) return ''
  const baseId = (process.env.AIRTABLE_BASE_ID || '').trim()
  const tableId = (process.env.AIRTABLE_SUPPLIER_QUOTE_REQUESTS_TABLE_ID || '').trim()
  const interfacePageId = (
    process.env.AIRTABLE_SUPPLIER_QUOTE_REQUEST_INTERFACE_PAGE_ID || ''
  ).trim()
  const interfaceHomePageId = (
    process.env.AIRTABLE_SUPPLIER_QUOTE_REQUEST_INTERFACE_HOME_PAGE_ID || ''
  ).trim()
  if (!baseId) return ''
  if (interfacePageId) {
    const home = interfaceHomePageId || interfacePageId
    return `https://airtable.com/${baseId}/${interfacePageId}/${recordId}?home=${home}`
  }
  if (tableId) {
    return `https://airtable.com/${baseId}/${tableId}/${recordId}`
  }
  return ''
}

function parseBody(req) {
  const body = req.body || {}
  const suppliers = Array.isArray(body.suppliers) ? body.suppliers : []
  const materialIds = Array.isArray(body.materialIds) ? body.materialIds : []
  const lines = Array.isArray(body.lines) ? body.lines : []
  return {
    projectId: body.projectId || '',
    date: body.date || new Date().toISOString().slice(0, 10),
    notes: body.notes || '',
    materialIds,
    lines,
    suppliers: suppliers.map((s) => ({
      id: s.id || '',
      name: String(s.name || '').trim(),
      email: String(s.email || '').trim(),
      phone: String(s.phone || '').trim(),
    })),
  }
}

/**
 * POST /api/supplier-quote-request/submit
 * Body: { projectId, materialIds, date?, notes?, lines[], suppliers: [{ id, name, email, phone }] }
 */
export async function handleSubmit(req, res, next) {
  try {
    const { projectId, materialIds, date, notes, lines, suppliers } = parseBody(req)

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    if (!materialIds.length) {
      return res.status(400).json({ error: 'At least one material is required' })
    }
    if (!suppliers.length) {
      return res.status(400).json({ error: 'At least one supplier is required' })
    }
    if (!lines.length) {
      return res.status(400).json({ error: 'lines array is required' })
    }

    const results = []

    for (const supplier of suppliers) {
      if (!supplier.id) continue
      const supplierName = supplier.name || 'ספק'
      const { pdfUrl, docName } = await createQuoteDemandPdf({
        supplierName,
        date,
        notes,
        lines: lines.map((l) => ({
          materialName: l.materialName,
          dimensions: l.dimensions,
          quantity: l.quantity,
          lineNotes: l.lineNotes,
        })),
      })

      const record = await createSupplierQuoteRequestRecord({
        projectId,
        materialIds,
        supplierId: supplier.id,
        pdfUrl,
      })

      const recordId = record?.id || ''
      results.push({
        supplierId: supplier.id,
        supplierName,
        email: supplier.email,
        phone: supplier.phone,
        pdfUrl,
        docName,
        recordId,
        airtableRecordUrl: buildAirtableRecordUrl(recordId),
      })
    }

    if (!results.length) {
      return res.status(400).json({ error: 'No valid suppliers to process' })
    }

    res.json({ ok: true, count: results.length, results })
  } catch (err) {
    console.error(
      '[supplier-quote-request] error:',
      err.message,
      err.response?.status,
      err.response?.data
    )
    next(err)
  }
}

const router = express.Router()
router.post('/submit', handleSubmit)

export default router
