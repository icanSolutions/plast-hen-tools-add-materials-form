import { copyTemplateToFolder, exportDocAsPdf, uploadPdfToDrive } from './drive.js'
import { fillQuoteDoc } from './docsTemplate.js'
import { formatPriceForDoc } from './quoteDocFormat.js'

const GOOGLE_DOCS_QUOTE_TEMPLATE_ID =
  process.env.GOOGLE_DOCS_QUOTE_TEMPLATE_ID ||
  '1LYnOWqzaIFno6yNYN71UJRiQAWea2uW-WdNgCGA2iYE'
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

function sanitizeFilenamePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

function quoteDocBaseName(quoteReference, recordId) {
  const ref = sanitizeFilenamePart(quoteReference)
  if (ref) return `quote-${ref}`
  if (recordId) return `quote-${recordId}`
  return `quote-${Date.now()}`
}

/**
 * Build placeholder map for the quote Google Doc template.
 * @param {object} normalized - normalizePayload() output + quote_reference
 */
export function buildQuoteDocPlaceholderData(normalized, quoteReference) {
  const deliveryBy = normalized.delivery_to_client_by
  let transporting = ''
  let additionals = ''
  if (deliveryBy === 'company') {
    transporting = String(normalized.transporting || '').trim()
    additionals = String(normalized.additionals || '').trim()
    const transportPrice = Number(normalized.transport_price_before_tax) || 0
    if (transportPrice > 0 && transporting) {
      transporting += `\nמחיר הובלה (לפני מע״מ): ${formatPriceForDoc(transportPrice)}`
    } else if (transportPrice > 0) {
      transporting = `מחיר הובלה (לפני מע״מ): ${formatPriceForDoc(transportPrice)}`
    }
  }

  const products =
    normalized.products_paragraph != null
      ? String(normalized.products_paragraph)
      : ''

  const priceBeforeTax =
    normalized.price != null && !Number.isNaN(Number(normalized.price))
      ? Number(normalized.price)
      : 0
  const tax =
    normalized.tax_price != null && !Number.isNaN(Number(normalized.tax_price))
      ? Number(normalized.tax_price)
      : 0
  const total =
    normalized.total_with_tax != null &&
    !Number.isNaN(Number(normalized.total_with_tax))
      ? Number(normalized.total_with_tax)
      : priceBeforeTax + tax

  return {
    doc_num: quoteReference || '',
    client: normalized.customer_name || '',
    contact_name: normalized.contact_name || '',
    mail: normalized.email || '',
    contact_phone: normalized.phone || '',
    date: normalized.created_at || '',
    description: normalized.description || '',
    products,
    transporting,
    additionals,
    total_without_tax: formatPriceForDoc(priceBeforeTax),
    tax_price: formatPriceForDoc(tax),
    total_with_tax: formatPriceForDoc(total),
    notes: normalized.notes || '',
    payment_conditions: normalized.payment_conditions || '',
  }
}

/**
 * Copy quote template → fill placeholders → PDF → Drive.
 * @returns {Promise<{ pdfBuffer: Buffer, pdfUrl: string, docName: string }>}
 */
export async function createQuotePdfFromTemplate(normalized, quoteReference) {
  if (!GOOGLE_DOCS_QUOTE_TEMPLATE_ID || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error(
      'GOOGLE_DOCS_QUOTE_TEMPLATE_ID and GOOGLE_DRIVE_FOLDER_ID are required in server/.env'
    )
  }

  const docName = quoteDocBaseName(quoteReference, normalized.quote_record_id)
  const newDocId = await copyTemplateToFolder(
    GOOGLE_DOCS_QUOTE_TEMPLATE_ID,
    GOOGLE_DRIVE_FOLDER_ID,
    docName
  )

  const fillData = buildQuoteDocPlaceholderData(normalized, quoteReference)
  await fillQuoteDoc(newDocId, fillData)

  const pdfBuffer = await exportDocAsPdf(newDocId)
  const filename = `${docName}.pdf`
  const pdfUrl = await uploadPdfToDrive(pdfBuffer, filename)

  return { pdfBuffer, pdfUrl, docName, filename }
}
