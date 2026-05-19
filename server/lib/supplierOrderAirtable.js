import axios from 'axios'

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const SUPPLIER_ORDERS_TABLE_ID = process.env.AIRTABLE_SUPPLIER_ORDERS_TABLE_ID
const SUPPLIER_ORDER_LINES_TABLE_ID =
  process.env.AIRTABLE_SUPPLIER_ORDER_LINES_TABLE_ID
const ORDER_SUPPLIER_FIELD =
  process.env.AIRTABLE_ORDER_SUPPLIER_FIELD || 'ספק'
const ORDER_DATE_FIELD = process.env.AIRTABLE_ORDER_DATE_FIELD || 'תאריך'
const ORDER_NOTES_FIELD = process.env.AIRTABLE_ORDER_NOTES_FIELD || 'הערות'
const ORDER_MATERIALS_FIELD =
  process.env.AIRTABLE_ORDER_MATERIALS_FIELD || 'חומרי גלם'
const LINE_ORDER_LINK_FIELD =
  process.env.AIRTABLE_LINE_ORDER_LINK_FIELD || 'הזמנת ספק'
const LINE_MATERIAL_FIELD =
  process.env.AIRTABLE_SUPPLIER_LINE_MATERIAL_FIELD || 'חומר גלם'
const LINE_DIMENSIONS_FIELD =
  process.env.AIRTABLE_LINE_DIMENSIONS_FIELD || 'מידות'
const LINE_QUANTITY_FIELD = process.env.AIRTABLE_LINE_QUANTITY_FIELD || 'כמות'
const LINE_NOTES_FIELD =
  process.env.AIRTABLE_LINE_NOTES_FIELD || 'הערות לשורה'
const LINE_STATUS_FIELD =
  process.env.AIRTABLE_LINE_STATUS_FIELD || 'סטטוס שורה'

const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
})

const baseUrl = (tableId) =>
  `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`

function toRecordIds(value) {
  if (value == null || value === '') return []
  const arr = Array.isArray(value) ? value : [value]
  return arr.filter((s) => typeof s === 'string' && String(s).trim().startsWith('rec'))
}

function buildMaterialsParagraph(lines) {
  return (lines || [])
    .map((line) => {
      const name = (line.materialName || '').trim()
      if (!name) return ''
      const parts = [name]
      if (line.dimensions?.trim()) parts.push(`מידות: ${line.dimensions.trim()}`)
      if (line.quantity !== '' && line.quantity != null) {
        parts.push(`כמות: ${line.quantity}`)
      }
      if (line.lineNotes?.trim()) parts.push(`הערות: ${line.lineNotes.trim()}`)
      return parts.join(' · ')
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Create supplier order header + line rows in Airtable.
 * @param {{ supplierId: string, date?: string, notes?: string, materialsSummary?: string }} order
 * @param {Array<{ materialName: string, dimensions?: string, quantity?: string|number, lineNotes?: string, status?: string }>} lines
 */
export async function createSupplierOrderInAirtable(order, lines) {
  if (!SUPPLIER_ORDERS_TABLE_ID || !SUPPLIER_ORDER_LINES_TABLE_ID) {
    throw new Error(
      'AIRTABLE_SUPPLIER_ORDERS_TABLE_ID and AIRTABLE_SUPPLIER_ORDER_LINES_TABLE_ID are required in server/.env'
    )
  }

  const supplierIds = toRecordIds(order?.supplierId)
  if (supplierIds.length === 0) {
    throw new Error('supplierId is required (Airtable record id rec…)')
  }

  const orderDate =
    order?.date || new Date().toISOString().slice(0, 10)
  const materialsParagraph =
    buildMaterialsParagraph(lines) || (order?.materialsSummary || '').trim()

  const orderFields = {
    [ORDER_SUPPLIER_FIELD]: supplierIds,
    [ORDER_DATE_FIELD]: orderDate,
    [ORDER_NOTES_FIELD]: order?.notes || '',
  }
  if (materialsParagraph) {
    orderFields[ORDER_MATERIALS_FIELD] = materialsParagraph
  }

  console.log('[supplierOrderAirtable] create order', {
    supplierId: supplierIds[0],
    lines: lines?.length ?? 0,
  })

  const orderRes = await axios.post(
    baseUrl(SUPPLIER_ORDERS_TABLE_ID),
    { records: [{ fields: orderFields }] },
    { headers: headers() }
  )

  const createdOrder = orderRes.data.records[0]
  const orderId = createdOrder.id

  if (!lines?.length) {
    return { order: createdOrder, orderId, lineCount: 0 }
  }

  const batchSize = 10
  let lineCount = 0

  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize)
    const recordsToCreate = batch.map((line) => ({
      fields: {
        [LINE_ORDER_LINK_FIELD]: toRecordIds(orderId),
        [LINE_MATERIAL_FIELD]: (line.materialName || '').trim(),
        [LINE_DIMENSIONS_FIELD]: line.dimensions || '',
        [LINE_QUANTITY_FIELD]: line.quantity ? Number(line.quantity) : 0,
        [LINE_NOTES_FIELD]: line.lineNotes || '',
        [LINE_STATUS_FIELD]: line.status || 'פעיל',
      },
    }))

    const lineRes = await axios.post(
      baseUrl(SUPPLIER_ORDER_LINES_TABLE_ID),
      { records: recordsToCreate },
      { headers: headers() }
    )
    lineCount += (lineRes.data.records || []).length
  }

  return { order: createdOrder, orderId, lineCount }
}
