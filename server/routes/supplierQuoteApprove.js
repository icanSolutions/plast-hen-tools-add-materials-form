import express from 'express'
import {
  getSupplierQuoteRequestById,
  listPendingSupplierQuoteRequests,
  patchSupplierQuoteRequestApproved,
} from '../lib/supplierQuoteRequestAirtable.js'
import {
  fetchProjectMaterialsByIds,
  materialsToOrderLines,
} from '../lib/projectMaterialsAirtable.js'
import { createSupplierOrderInAirtable } from '../lib/supplierOrderAirtable.js'
import {
  normalizeLines,
  runSupplierOrderWorkflow,
} from './supplierOrder.js'

const APPROVED_STATUS =
  process.env.AIRTABLE_QUOTE_REQUEST_APPROVED_STATUS || 'אושר'

/**
 * GET /api/supplier-quote-approve/requests
 * Pending בקשת הצעת מחיר מספק records for the approval form dropdown.
 */
export async function handleListRequests(req, res, next) {
  try {
    const requests = await listPendingSupplierQuoteRequests()
    res.json({ ok: true, requests })
  } catch (err) {
    console.error('[supplier-quote-approve] list:', err.message)
    next(err)
  }
}

/**
 * GET /api/supplier-quote-approve/requests/:id
 */
export async function handleGetRequest(req, res, next) {
  try {
    const { id } = req.params
    const quoteRequest = await getSupplierQuoteRequestById(id)
    if (quoteRequest.status === APPROVED_STATUS) {
      return res.status(400).json({ error: 'Quote request is already approved' })
    }
    const materials = await fetchProjectMaterialsByIds(quoteRequest.materialIds)
    res.json({
      ok: true,
      quoteRequest,
      materials,
    })
  } catch (err) {
    console.error('[supplier-quote-approve] get:', err.message)
    next(err)
  }
}

/**
 * POST /api/supplier-quote-approve/submit
 * Body: { quoteRequestId, price, action?: "save" | "send" }
 * Approves quote (price + status), creates supplier order, PDF, email.
 */
export async function handleApproveSubmit(req, res, next) {
  try {
    const { quoteRequestId, price, action } = req.body || {}
    const numericPrice = Number(price)

    if (!quoteRequestId) {
      return res.status(400).json({ error: 'quoteRequestId is required' })
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'price must be a valid number' })
    }

    const quoteRequest = await getSupplierQuoteRequestById(quoteRequestId)
    if (quoteRequest.status === APPROVED_STATUS) {
      return res.status(400).json({ error: 'Quote request is already approved' })
    }
    if (!quoteRequest.supplierId) {
      return res.status(400).json({ error: 'Quote request has no linked supplier' })
    }
    if (!quoteRequest.materialIds?.length) {
      return res.status(400).json({ error: 'Quote request has no linked materials' })
    }

    const materials = await fetchProjectMaterialsByIds(quoteRequest.materialIds)
    if (!materials.length) {
      return res.status(400).json({
        error: 'Could not load linked material records for this quote request',
      })
    }

    const rawLines = materialsToOrderLines(materials)
    const lines = normalizeLines(rawLines)
    if (!lines.length) {
      return res.status(400).json({ error: 'No valid order lines from materials' })
    }

    const orderAction = action === 'save' ? 'save' : 'send'
    const today = new Date().toISOString().slice(0, 10)
    const notes = [
      `מחיר מאושר: ${numericPrice}`,
      quoteRequest.projectName ? `תיק: ${quoteRequest.projectName}` : '',
      `בקשת הצעת מחיר: ${quoteRequestId}`,
    ]
      .filter(Boolean)
      .join('\n')

    const { orderId, lineCount } = await createSupplierOrderInAirtable(
      {
        supplierId: quoteRequest.supplierId,
        date: today,
        notes,
      },
      lines
    )

    const workflow = await runSupplierOrderWorkflow({
      orderId,
      order: { supplierId: quoteRequest.supplierId, date: today, notes },
      lines,
      action: orderAction,
    })

    await patchSupplierQuoteRequestApproved(quoteRequestId, numericPrice)

    res.json({
      ok: true,
      quoteRequestId,
      orderId,
      lineCount,
      pdfUrl: workflow.pdfUrl,
      emailed: workflow.emailed,
      emailTo: workflow.emailTo || undefined,
      order_reference: workflow.order_reference || undefined,
      price: numericPrice,
    })
  } catch (err) {
    console.error(
      '[supplier-quote-approve] submit:',
      err.message,
      err.response?.status,
      err.response?.data
    )
    next(err)
  }
}

const router = express.Router()
router.get('/requests', handleListRequests)
router.get('/requests/:id', handleGetRequest)
router.post('/submit', handleApproveSubmit)

export default router
