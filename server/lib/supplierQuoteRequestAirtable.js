import axios from 'axios'

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const QUOTE_REQUESTS_TABLE_ID = process.env.AIRTABLE_SUPPLIER_QUOTE_REQUESTS_TABLE_ID

const QUOTE_REQUEST_MATERIALS_FIELD =
  process.env.AIRTABLE_QUOTE_REQUEST_MATERIALS_FIELD || 'חומרי גלם'
const QUOTE_REQUEST_PROJECT_FIELD =
  process.env.AIRTABLE_QUOTE_REQUEST_PROJECT_FIELD || 'תיק ייצור'
const QUOTE_REQUEST_FORM_FIELD =
  process.env.AIRTABLE_QUOTE_REQUEST_FORM_FIELD || 'טופס הזמנה'
const QUOTE_REQUEST_SUPPLIER_FIELD =
  process.env.AIRTABLE_QUOTE_REQUEST_SUPPLIER_FIELD || 'ספק'
const QUOTE_REQUEST_PRICE_FIELD =
  process.env.AIRTABLE_QUOTE_REQUEST_PRICE_FIELD || 'fldgLYaUdHdujpfbe'
const QUOTE_REQUEST_STATUS_FIELD =
  process.env.AIRTABLE_QUOTE_REQUEST_STATUS_FIELD || 'fldSH3B6q2XNKEVOF'
const QUOTE_REQUEST_APPROVED_STATUS =
  process.env.AIRTABLE_QUOTE_REQUEST_APPROVED_STATUS || 'אושר'

const PRODUCTION_PROJECTS_TABLE_ID =
  process.env.AIRTABLE_PRODUCTION_PROJECTS_TABLE_ID
const PROJECT_NAME_FIELD =
  process.env.AIRTABLE_PRODUCTION_PROJECTS_FIELD || 'reference'
const PROJECT_CLIENT_FIELD =
  process.env.AIRTABLE_PRODUCTION_PROJECTS_CLIENT_FIELD || 'לקוח'
const SUPPLIERS_TABLE_ID = process.env.AIRTABLE_SUPPLIERS_TABLE_ID
const SUPPLIERS_NAME_FIELD =
  process.env.AIRTABLE_SUPPLIERS_FIELD || 'שם'

const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
})

const baseUrl = (tableId) =>
  `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`

function firstLinkedId(value) {
  if (Array.isArray(value) && value.length) return String(value[0])
  if (typeof value === 'string' && value.startsWith('rec')) return value
  return ''
}

function linkedIds(value) {
  if (!Array.isArray(value)) return []
  return value.filter((id) => typeof id === 'string' && id.startsWith('rec'))
}

async function fetchRecordName(tableId, recordId, nameFields) {
  if (!tableId || !recordId) return ''
  try {
    const res = await axios.get(`${baseUrl(tableId)}/${recordId}`, {
      headers: headers(),
    })
    const f = res.data.fields || {}
    for (const key of nameFields) {
      const v = f[key]
      if (v != null && v !== '') return String(v).trim()
    }
    return ''
  } catch {
    return ''
  }
}

async function fetchProjectDisplayName(projectId) {
  const primary = await fetchRecordName(PRODUCTION_PROJECTS_TABLE_ID, projectId, [
    PROJECT_NAME_FIELD,
    'reference',
    'Name',
  ])
  const client = await fetchRecordName(PRODUCTION_PROJECTS_TABLE_ID, projectId, [
    PROJECT_CLIENT_FIELD,
    'שם פרוייקט',
    'לקוח',
  ])
  if (primary && client) return `${primary} - ${client}`
  return primary || client || projectId
}

async function fetchSupplierName(supplierId) {
  return fetchRecordName(SUPPLIERS_TABLE_ID, supplierId, [
    SUPPLIERS_NAME_FIELD,
    'שם',
    'Name',
  ])
}

function readFieldByIdOrName(fields, fieldId, ...names) {
  if (fields[fieldId] !== undefined) return fields[fieldId]
  for (const n of names) {
    if (fields[n] !== undefined) return fields[n]
  }
  return undefined
}

function mapQuoteRequestRecord(record) {
  const fields = record.fields || {}
  const supplierId = firstLinkedId(
    readFieldByIdOrName(fields, QUOTE_REQUEST_SUPPLIER_FIELD, 'ספק')
  )
  const projectId = firstLinkedId(
    readFieldByIdOrName(fields, QUOTE_REQUEST_PROJECT_FIELD, 'תיק ייצור')
  )
  const materialIds = linkedIds(
    readFieldByIdOrName(fields, QUOTE_REQUEST_MATERIALS_FIELD, 'חומרי גלם')
  )
  const status = String(
    readFieldByIdOrName(fields, QUOTE_REQUEST_STATUS_FIELD, 'סטטוס') ?? ''
  ).trim()
  const price = readFieldByIdOrName(
    fields,
    QUOTE_REQUEST_PRICE_FIELD,
    'מחיר',
    'מחיר הצעה'
  )

  return {
    id: record.id,
    supplierId,
    projectId,
    materialIds,
    status,
    price: price !== undefined && price !== null && price !== '' ? price : null,
    pdfUrl: String(
      readFieldByIdOrName(fields, QUOTE_REQUEST_FORM_FIELD, 'טופס הזמנה') || ''
    ).trim(),
  }
}

/**
 * List quote requests that are not yet approved.
 */
export async function listPendingSupplierQuoteRequests() {
  if (!QUOTE_REQUESTS_TABLE_ID) {
    throw new Error('AIRTABLE_SUPPLIER_QUOTE_REQUESTS_TABLE_ID is required')
  }

  const statusField = QUOTE_REQUEST_STATUS_FIELD
  const approved = QUOTE_REQUEST_APPROVED_STATUS.replace(/'/g, "\\'")
  const formula = `NOT({${statusField}}='${approved}')`

  const url = baseUrl(QUOTE_REQUESTS_TABLE_ID)
  const records = []
  let offset = null

  do {
    const params = { pageSize: 100, filterByFormula: formula }
    if (offset) params.offset = offset
    const res = await axios.get(url, { headers: headers(), params })
    records.push(...(res.data.records || []))
    offset = res.data.offset || null
  } while (offset)

  const mapped = records.map(mapQuoteRequestRecord)

  const enriched = await Promise.all(
    mapped.map(async (row) => {
      const [supplierName, projectName] = await Promise.all([
        fetchSupplierName(row.supplierId),
        fetchProjectDisplayName(row.projectId),
      ])
      const materialCount = row.materialIds.length
      const label = [supplierName || 'ספק', projectName || 'תיק', `${materialCount} חומרים`]
        .filter(Boolean)
        .join(' · ')
      return {
        ...row,
        supplierName,
        projectName,
        materialCount,
        label: label || row.id,
      }
    })
  )

  return enriched.sort((a, b) => a.label.localeCompare(b.label, 'he'))
}

export async function getSupplierQuoteRequestById(recordId) {
  if (!QUOTE_REQUESTS_TABLE_ID) {
    throw new Error('AIRTABLE_SUPPLIER_QUOTE_REQUESTS_TABLE_ID is required')
  }
  const res = await axios.get(`${baseUrl(QUOTE_REQUESTS_TABLE_ID)}/${recordId}`, {
    headers: headers(),
  })
  const row = mapQuoteRequestRecord(res.data)
  const [supplierName, projectName] = await Promise.all([
    fetchSupplierName(row.supplierId),
    fetchProjectDisplayName(row.projectId),
  ])
  return { ...row, supplierName, projectName }
}

export async function patchSupplierQuoteRequestApproved(recordId, price) {
  const url = baseUrl(QUOTE_REQUESTS_TABLE_ID)
  const fields = {
    [QUOTE_REQUEST_STATUS_FIELD]: QUOTE_REQUEST_APPROVED_STATUS,
    [QUOTE_REQUEST_PRICE_FIELD]: Number(price),
  }
  const res = await axios.patch(
    url,
    { records: [{ id: recordId, fields }] },
    { headers: headers() }
  )
  return res.data.records[0]
}

/**
 * Create a row in בקשת הצעת מחיר מספק.
 */
export async function createSupplierQuoteRequestRecord({
  projectId,
  materialIds,
  supplierId,
  pdfUrl,
}) {
  if (!QUOTE_REQUESTS_TABLE_ID) {
    throw new Error(
      'AIRTABLE_SUPPLIER_QUOTE_REQUESTS_TABLE_ID is required in server/.env'
    )
  }

  const url = baseUrl(QUOTE_REQUESTS_TABLE_ID)
  const fields = {
    [QUOTE_REQUEST_MATERIALS_FIELD]: materialIds.filter((id) =>
      String(id).startsWith('rec')
    ),
    [QUOTE_REQUEST_PROJECT_FIELD]: projectId ? [projectId] : [],
    [QUOTE_REQUEST_FORM_FIELD]: pdfUrl,
  }
  if (supplierId && QUOTE_REQUEST_SUPPLIER_FIELD) {
    fields[QUOTE_REQUEST_SUPPLIER_FIELD] = [supplierId]
  }

  const res = await axios.post(
    url,
    { records: [{ fields }] },
    { headers: headers() }
  )
  return res.data.records[0]
}
