import axios from 'axios'

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const PROJECT_MATERIALS_TABLE_ID =
  process.env.AIRTABLE_PROJECT_MATERIALS_TABLE_ID ||
  process.env.AIRTABLE_MATERIALS_TABLE_ID

const FIELD_NAME =
  process.env.AIRTABLE_PROJECT_MATERIALS_FIELD_NAME || 'חומר גלם'
const FIELD_SIZE = process.env.AIRTABLE_PROJECT_MATERIALS_FIELD_SIZE || 'מידה'
const FIELD_QUANTITY =
  process.env.AIRTABLE_PROJECT_MATERIALS_FIELD_QUANTITY || 'כמות'
const FIELD_NOTES = process.env.AIRTABLE_PROJECT_MATERIALS_FIELD_NOTES || 'הערות'

const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
})

function readField(fields, ...keys) {
  for (const key of keys) {
    if (key == null) continue
    const v = fields[key]
    if (v !== undefined && v !== null && v !== '') {
      if (Array.isArray(v)) return v[0]
      return v
    }
  }
  return ''
}

function mapRecordToLine(record) {
  const fields = record.fields || {}
  const materialName = String(
    readField(fields, FIELD_NAME, 'חומר גלם', 'שם חומר') || ''
  ).trim()
  const dimensions = String(readField(fields, FIELD_SIZE, 'מידה') || '').trim()
  const quantityRaw = readField(fields, FIELD_QUANTITY, 'כמות')
  const quantity =
    quantityRaw !== '' && quantityRaw != null ? Number(quantityRaw) : ''
  const lineNotes = String(readField(fields, FIELD_NOTES, 'הערות') || '').trim()

  return {
    id: record.id,
    materialName,
    dimensions,
    quantity,
    lineNotes,
    label: [materialName, dimensions, quantity !== '' ? `×${quantity}` : '']
      .filter(Boolean)
      .join(' · '),
  }
}

/**
 * Fetch project-material rows by Airtable record ids (from בקשת הצעת מחיר → חומרי גלם).
 * @param {string[]} recordIds
 */
export async function fetchProjectMaterialsByIds(recordIds) {
  const ids = [...new Set((recordIds || []).filter((id) => String(id).startsWith('rec')))]
  if (!ids.length) return []

  if (!PROJECT_MATERIALS_TABLE_ID) {
    throw new Error(
      'AIRTABLE_PROJECT_MATERIALS_TABLE_ID is required in server/.env (same table as VITE_AIRTABLE_TABLE_ID)'
    )
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PROJECT_MATERIALS_TABLE_ID}`
  const chunkSize = 10
  const rows = []

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(',')})`
    const res = await axios.get(url, {
      headers: headers(),
      params: { filterByFormula: formula, maxRecords: chunk.length },
    })
    for (const record of res.data.records || []) {
      rows.push(mapRecordToLine(record))
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => byId.get(id)).filter(Boolean)
}

/**
 * Map loaded materials to supplier-order line payload.
 */
export function materialsToOrderLines(materials) {
  return materials.map((m) => ({
    materialName: m.materialName,
    dimensions: m.dimensions,
    quantity: m.quantity !== '' ? m.quantity : 1,
    lineNotes: m.lineNotes,
    status: 'פעיל',
  }))
}
