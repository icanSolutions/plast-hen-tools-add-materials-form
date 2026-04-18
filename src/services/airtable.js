import axios from 'axios'
import { apiUrl } from '../utils/apiBase.js'

// Airtable configuration
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'your-base-id'
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY || 'your-api-key'

// Tables used only for READING (dropdown options). Use table IDs (tblXXXX...) from Airtable URL.
const PRODUCTION_PROJECTS_TABLE_ID = import.meta.env.VITE_PRODUCTION_PROJECTS_TABLE_ID || ''
const MATERIALS_TABLE_ID = import.meta.env.VITE_MATERIALS_TABLE_ID || ''
const SUPPLIERS_TABLE_ID = import.meta.env.VITE_SUPPLIERS_TABLE_ID || ''

// Tables where form submissions are WRITTEN. Use table IDs or names.
// Existing multi-material form destination table (תיק ייצור, חומר גלם, כמות)
const DESTINATION_TABLE_ID = import.meta.env.VITE_AIRTABLE_TABLE_ID || ''
const DESTINATION_TABLE_NAME = import.meta.env.VITE_AIRTABLE_TABLE_NAME || 'Table1'
const AIRTABLE_API_URL = DESTINATION_TABLE_ID
  ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DESTINATION_TABLE_ID}`
  : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(DESTINATION_TABLE_NAME)}`

// New supplier-order tables
const SUPPLIER_ORDERS_TABLE_ID = import.meta.env.VITE_SUPPLIER_ORDERS_TABLE_ID || ''
const SUPPLIER_ORDER_LINES_TABLE_ID = import.meta.env.VITE_SUPPLIER_ORDER_LINES_TABLE_ID || ''

const AIRTABLE_BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`

/**
 * Some field types return a string as an array of single-character strings.
 * Using `arr[0]` would expose only the first character — join back to the full string.
 */
function coalesceCharSplitStringArray(value) {
  if (!Array.isArray(value) || value.length === 0) return value
  if (value.every((x) => typeof x === 'string' && x.length === 1)) {
    return value.join('')
  }
  return value
}

/**
 * Fetches records from an Airtable table by table ID
 * Returns objects with id (record ID for linked records) and name (display value)
 * @param {string} tableId - Table ID (tblXXXXXXXXXXXXXX) to fetch from
 * @param {string} fieldName - Field name to extract display values from
 * @returns {Promise<Array>} Array of {id, name} for dropdown options
 */
export const fetchTableOptions = async (tableId, fieldName) => {
  if (!AIRTABLE_BASE_ID || AIRTABLE_BASE_ID === 'your-base-id') {
    throw new Error('אנא הגדר את Base ID של Airtable בקובץ .env')
  }

  if (!AIRTABLE_API_KEY || AIRTABLE_API_KEY === 'your-api-key') {
    throw new Error('אנא הגדר את מפתח ה-API של Airtable בקובץ .env')
  }

  if (!tableId) {
    throw new Error('אנא הגדר את מזהה הטבלה (Table ID) בקובץ .env')
  }

  const url = `${AIRTABLE_BASE_URL}/${tableId}`
  const options = []
  const seenNames = new Set()
  let offset = null

  try {
    do {
      const params = { maxRecords: 100 }
      if (offset) {
        params.offset = offset
      }

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        }
      })

      // Extract record ID and display value - Linked Record fields need record IDs
      const fallbackFieldNames = [fieldName, 'שם', 'Name', 'Title']
      response.data.records.forEach(record => {
        let value = null
        for (const fn of fallbackFieldNames) {
          if (record.fields[fn] != null) {
            value = record.fields[fn]
            break
          }
        }
        if (value == null) {
          const firstStr = Object.values(record.fields).find(
            v => typeof v === 'string' || (typeof v === 'number' && !Number.isNaN(v))
          )
          value = firstStr != null ? String(firstStr) : null
        }
        if (Array.isArray(value)) {
          const v = coalesceCharSplitStringArray(value)
          value = Array.isArray(v) ? v[0] : v
        }
        const displayName = value != null && value !== '' ? String(value) : null
        if (displayName && !seenNames.has(displayName)) {
          seenNames.add(displayName)
          options.push({ id: record.id, name: displayName })
        }
      })

      offset = response.data.offset || null
    } while (offset)

    return options.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if (error.response) {
      throw new Error(
        `שגיאה בטבלה: ${error.response.data?.error?.message || error.response.statusText}`
      )
    } else if (error.request) {
      throw new Error('שגיאת רשת: לא ניתן להתחבר ל-Airtable API')
    } else {
      throw new Error(error.message || 'אירעה שגיאה לא צפויה')
    }
  }
}

/**
 * Fetches records with two fields combined for display (e.g. "reference - client").
 * @param {string} tableId - Table ID
 * @param {string} primaryField - Main field name (e.g. reference)
 * @param {string} secondaryField - Secondary field name (e.g. לקוח)
 * @param {string} separator - Joins primary and secondary, default " - "
 * @returns {Promise<Array>} Array of {id, name}
 */
export const fetchTableOptionsWithSecondary = async (
  tableId,
  primaryField,
  secondaryField,
  separator = ' - '
) => {
  if (!AIRTABLE_BASE_ID || AIRTABLE_BASE_ID === 'your-base-id') {
    throw new Error('אנא הגדר את Base ID של Airtable בקובץ .env')
  }
  if (!AIRTABLE_API_KEY || AIRTABLE_API_KEY === 'your-api-key') {
    throw new Error('אנא הגדר את מפתח ה-API של Airtable בקובץ .env')
  }
  if (!tableId) {
    throw new Error('אנא הגדר את מזהה הטבלה (Table ID) בקובץ .env')
  }

  const url = `${AIRTABLE_BASE_URL}/${tableId}`
  const options = []
  let offset = null

  try {
    do {
      const params = { maxRecords: 100 }
      if (offset) params.offset = offset

      const response = await axios.get(url, {
        params,
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      })

      response.data.records.forEach((record) => {
        const getVal = (field) => {
          let v = record.fields[field]
          if (Array.isArray(v)) {
            const coalesced = coalesceCharSplitStringArray(v)
            v = Array.isArray(coalesced) ? coalesced[0] : coalesced
          }
          return v != null && v !== '' ? String(v).trim() : ''
        }
        const primary = getVal(primaryField) || getVal('reference') || getVal('Name') || getVal('שם')
        const secondary = getVal(secondaryField)
        const displayName = secondary ? `${primary}${separator}${secondary}` : primary
        if (displayName) {
          options.push({ id: record.id, name: displayName })
        }
      })

      offset = response.data.offset || null
    } while (offset)

    return options.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if (error.response) {
      throw new Error(
        `שגיאה בטבלה: ${error.response.data?.error?.message || error.response.statusText}`
      )
    }
    if (error.request) {
      throw new Error('שגיאת רשת: לא ניתן להתחבר ל-Airtable API')
    }
    throw new Error(error.message || 'אירעה שגיאה לא צפויה')
  }
}

/**
 * Fetches production projects options. Display format: "reference - client" (client = לקוח).
 */
export const fetchProductionProjects = async () => {
  const primaryField = import.meta.env.VITE_PRODUCTION_PROJECTS_FIELD || 'Name'
  const secondaryField = import.meta.env.VITE_PRODUCTION_PROJECTS_CLIENT_FIELD || 'לקוח'
  return fetchTableOptionsWithSecondary(
    PRODUCTION_PROJECTS_TABLE_ID,
    primaryField,
    secondaryField,
    ' - '
  )
}

/**
 * Fetches materials options. Display name is taken from "שם מוצר" when available,
 * or from VITE_MATERIALS_DISPLAY_FIELD / VITE_MATERIALS_FIELD.
 */
export const fetchMaterials = async () => {
  const displayField =
    import.meta.env.VITE_MATERIALS_DISPLAY_FIELD ||
    import.meta.env.VITE_MATERIALS_FIELD ||
    'שם מוצר'
  return fetchTableOptions(MATERIALS_TABLE_ID, displayField)
}

/**
 * Fetches suppliers options
 */
export const fetchSuppliers = async () => {
  const fieldName = import.meta.env.VITE_SUPPLIERS_FIELD || 'Name'
  return fetchTableOptions(SUPPLIERS_TABLE_ID, fieldName)
}

/**
 * Creates multiple records in Airtable
 * @param {Array} records - Array of record objects to create
 * @returns {Promise<Array>} Array of created records
 */
export const createRecords = async (records) => {
  if (!AIRTABLE_BASE_ID || AIRTABLE_BASE_ID === 'your-base-id') {
    throw new Error('אנא הגדר את Base ID של Airtable בקובץ .env')
  }

  if (!AIRTABLE_API_KEY || AIRTABLE_API_KEY === 'your-api-key') {
    throw new Error('אנא הגדר את מפתח ה-API של Airtable בקובץ .env')
  }

  // Airtable API allows up to 10 records per request
  const batchSize = 10
  const allCreatedRecords = []

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    
    const recordsToCreate = batch.map(record => ({
      fields: {
        // Linked Record fields require an array of record IDs
        'תיק ייצור': record.productionProject ? [record.productionProject] : [],
        'חומר גלם': record.material ? [record.material] : [],
        'כמות': record.quantity ? Number(record.quantity) : 0,
      }
    }))

    try {
      const response = await axios.post(
        AIRTABLE_API_URL,
        { records: recordsToCreate },
        {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      )

      allCreatedRecords.push(...response.data.records)
    } catch (error) {
      if (error.response) {
        // Airtable API error
        throw new Error(
          error.response.data?.error?.message || 
          `שגיאת Airtable API: ${error.response.status} ${error.response.statusText}`
        )
      } else if (error.request) {
        // Network error
        throw new Error('שגיאת רשת: לא ניתן להתחבר ל-Airtable API. אנא בדוק את חיבור האינטרנט שלך.')
      } else {
        // Other error
        throw new Error(error.message || 'אירעה שגיאה לא צפויה')
      }
    }
  }

  return allCreatedRecords
}

/**
 * Maps form field names to Airtable field names
 * Update this function based on your Airtable table structure
 */
export const mapFieldsToAirtable = (record) => {
  return {
    'תיק ייצור': record.productionProject ? [record.productionProject] : [],
    'חומר גלם': record.material ? [record.material] : [],
    'כמות': record.quantity ? Number(record.quantity) : 0,
  }
}

/**
 * Creates a supplier order and its order-line records.
 * @param {Object} order - { supplierId, date, notes, attachmentUrl }
 * @param {Array} lines - [{ materialId, materialName, freeDescription, dimensions, quantity, lineNotes, status }]
 * @returns {Promise<{ order: Object, lineCount: number }>}
 */
export const createSupplierOrder = async (order, lines) => {
  if (!AIRTABLE_BASE_ID || AIRTABLE_BASE_ID === 'your-base-id') {
    throw new Error('אנא הגדר את Base ID של Airtable בקובץ .env')
  }

  if (!AIRTABLE_API_KEY || AIRTABLE_API_KEY === 'your-api-key') {
    throw new Error('אנא הגדר את מפתח ה-API של Airtable בקובץ .env')
  }

  if (!SUPPLIER_ORDERS_TABLE_ID || !SUPPLIER_ORDER_LINES_TABLE_ID) {
    throw new Error('אנא הגדר את מזהי הטבלאות להזמנות מספקים ושורות הזמנת ספק בקובץ .env')
  }

  if (!order || !order.supplierId) {
    throw new Error('ספק הוא שדה חובה')
  }

  const today = new Date().toISOString().slice(0, 10)
  const orderDate = order.date || today

  // Build summary of materials from lines for the order header
  const materialSummaries = (lines || [])
    .map((line) => line.materialName || line.freeDescription)
    .filter(Boolean)
  const materialsSummary = materialSummaries.join(', ')

  const orderUrl = `${AIRTABLE_BASE_URL}/${SUPPLIER_ORDERS_TABLE_ID}`
  const lineUrl = `${AIRTABLE_BASE_URL}/${SUPPLIER_ORDER_LINES_TABLE_ID}`

  // Airtable linked-record fields must be an array of record IDs (recXXX). Normalize so we never send empty string or invalid values.
  const toRecordIds = (value) => {
    if (value == null || value === '') return []
    const arr = Array.isArray(value) ? value : [value]
    return arr.filter((s) => typeof s === 'string' && String(s).trim().startsWith('rec'))
  }

  const supplierIds = toRecordIds(order.supplierId)
  if (supplierIds.length === 0) {
    throw new Error('ספק הוא שדה חובה. אנא בחר ספק מהרשימה (מזהה רשומה לא תקין).')
  }

  // Order header "חומרי גלם" is a linked-record field: send array of material record IDs from lines (not names).
  const orderMaterialIds = [...new Set((lines || []).map((l) => l.materialId).filter((id) => id && String(id).trim().startsWith('rec')))]

  try {
    // Create the supplier order record
    const orderFields = {
      'ספק': supplierIds,
      'תאריך': orderDate,
      'הערות': order.notes || '',
      'חומרי גלם': orderMaterialIds,
    }
    console.log('[createSupplierOrder] order payload:', JSON.stringify(orderFields, null, 2))
    if (lines?.length) {
      console.log('[createSupplierOrder] first line (חומר גלם will be sent as array after order create):', {
        materialId: lines[0].materialId,
        materialName: lines[0].materialName,
        freeDescription: lines[0].freeDescription,
        dimensions: lines[0].dimensions,
        quantity: lines[0].quantity,
        lineNotes: lines[0].lineNotes,
        status: lines[0].status,
      })
    }

    const orderResponse = await axios.post(
      orderUrl,
      {
        records: [
          {
            fields: orderFields,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const createdOrder = orderResponse.data.records[0]
    const orderId = createdOrder.id

    // If there are no lines, just return the order
    if (!lines || lines.length === 0) {
      return { order: createdOrder, lineCount: 0 }
    }

    // Airtable API allows up to 10 records per request
    const batchSize = 10
    let createdLinesCount = 0

    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize)

      const recordsToCreate = batch.map((line) => ({
        fields: {
          'הזמנת ספק': toRecordIds(orderId),
          'חומר גלם': toRecordIds(line.materialId),
          'תיאור מוצר חופשי': line.freeDescription || '',
          'מידות': line.dimensions || '',
          'כמות': line.quantity ? Number(line.quantity) : 0,
          'הערות לשורה': line.lineNotes || '',
          'סטטוס שורה': line.status || 'פעיל',
        },
      }))
      if (i === 0) console.log('[createSupplierOrder] first batch of lines payload:', JSON.stringify(recordsToCreate, null, 2))

      const lineResponse = await axios.post(
        lineUrl,
        { records: recordsToCreate },
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      )

      createdLinesCount += (lineResponse.data.records || []).length
    }

    return { order: createdOrder, lineCount: createdLinesCount }
  } catch (error) {
    if (error.response) {
      console.error('[createSupplierOrder] Airtable error:', error.response.status, error.response.data)
      throw new Error(
        error.response.data?.error?.message ||
          `שגיאת Airtable API: ${error.response.status} ${error.response.statusText}`
      )
    } else if (error.request) {
      throw new Error('שגיאת רשת: לא ניתן להתחבר ל-Airtable API. אנא בדוק את חיבור האינטרנט שלך.')
    } else {
      throw new Error(error.message || 'אירעה שגיאה לא צפויה')
    }
  }
}

// --- Quote form: customers & contacts ---
const QUOTE_CUSTOMERS_TABLE_ID =
  import.meta.env.VITE_CUSTOMERS_TABLE_ID ||
  import.meta.env.VITE_QUOTE_CUSTOMERS_TABLE_ID ||
  ''
const QUOTE_CONTACTS_TABLE_ID =
  import.meta.env.VITE_CONTACTS_TABLE_ID ||
  import.meta.env.VITE_QUOTE_CONTACTS_TABLE_ID ||
  ''

function quoteFieldStr(record, fieldName) {
  let v = record.fields[fieldName]
  if (v == null) return ''
  if (Array.isArray(v)) {
    const coalesced = coalesceCharSplitStringArray(v)
    if (!Array.isArray(coalesced)) return String(coalesced)
    v = coalesced
    const first = v[0]
    if (first && typeof first === 'object' && first.email) return String(first.email)
    return v.map((x) => (typeof x === 'object' && x?.url ? x.url : String(x))).join(', ')
  }
  return String(v)
}

/** Airtable field IDs start with `fld`; use with returnFieldsByFieldId. */
function quoteUsesFieldId(fieldName) {
  return fieldName != null && String(fieldName).trim().startsWith('fld')
}

/** Linked-record fields return an array of record id strings. */
function normalizeLinkedRecordIds(value) {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string' && v.startsWith('rec'))
  }
  if (typeof value === 'string' && value.startsWith('rec')) return [value]
  return []
}

/**
 * Customers for quote form (dropdown).
 */
export const fetchQuoteCustomers = async () => {
  const fieldName =
    import.meta.env.VITE_QUOTE_CUSTOMER_NAME_FIELD || 'שם'
  return fetchTableOptions(QUOTE_CUSTOMERS_TABLE_ID, fieldName)
}

const QUOTE_CREATED_BY_TABLE_ID =
  import.meta.env.VITE_QUOTE_CREATED_BY_TABLE_ID ||
  'tbl1RoDg7of9tqsf9'
const QUOTE_EMPLOYEE_NAME_FIELD =
  import.meta.env.VITE_QUOTE_EMPLOYEE_NAME_FIELD ||
  'fldCmIzDoDNHXH3FS'

/**
 * Employees for "נוצר על ידי" on the quote form (linked record on submit).
 */
export const fetchQuoteEmployees = async () => {
  if (!AIRTABLE_BASE_ID || AIRTABLE_BASE_ID === 'your-base-id') {
    throw new Error('אנא הגדר את Base ID של Airtable בקובץ .env')
  }
  if (!AIRTABLE_API_KEY || AIRTABLE_API_KEY === 'your-api-key') {
    throw new Error('אנא הגדר את מפתח ה-API של Airtable בקובץ .env')
  }
  if (!QUOTE_CREATED_BY_TABLE_ID) {
    throw new Error('אנא הגדר VITE_QUOTE_CREATED_BY_TABLE_ID בקובץ .env')
  }

  const nameField = String(QUOTE_EMPLOYEE_NAME_FIELD).trim()
  const url = `${AIRTABLE_BASE_URL}/${QUOTE_CREATED_BY_TABLE_ID}`
  const options = []
  const seenIds = new Set()
  let offset = null

  const baseParams = { maxRecords: 100 }
  if (quoteUsesFieldId(nameField)) {
    baseParams.returnFieldsByFieldId = true
  }

  try {
    do {
      const params = { ...baseParams }
      if (offset) params.offset = offset

      const response = await axios.get(url, {
        params,
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      })

      response.data.records.forEach((record) => {
        if (seenIds.has(record.id)) return
        let v = record.fields[nameField]
        if (v == null) return
        if (Array.isArray(v)) {
          const coalesced = coalesceCharSplitStringArray(v)
          v = Array.isArray(coalesced) ? coalesced[0] : coalesced
        }
        const displayName = v != null && v !== '' ? String(v) : ''
        seenIds.add(record.id)
        options.push({
          id: record.id,
          name: displayName || record.id,
        })
      })

      offset = response.data.offset || null
    } while (offset)

    return options.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  } catch (error) {
    if (error.response) {
      throw new Error(
        `עובדים: ${error.response.data?.error?.message || error.response.statusText}`
      )
    }
    if (error.request) {
      throw new Error('שגיאת רשת: לא ניתן להתחבר ל-Airtable API')
    }
    throw new Error(error.message || 'אירעה שגיאה לא צפויה')
  }
}

/**
 * Contacts linked to a customer: reads the Customer row, then loads each linked Contact.
 * Configure VITE_CUSTOMER_CONTACTS_LINK_FIELD on the Customers table (links to Contacts).
 * Returns { id, name, email, phone }[]
 */
export const fetchQuoteContacts = async (customerRecordId) => {
  if (!AIRTABLE_BASE_ID || AIRTABLE_BASE_ID === 'your-base-id') {
    throw new Error('אנא הגדר את Base ID של Airtable בקובץ .env')
  }
  if (!AIRTABLE_API_KEY || AIRTABLE_API_KEY === 'your-api-key') {
    throw new Error('אנא הגדר את מפתח ה-API של Airtable בקובץ .env')
  }
  if (!QUOTE_CUSTOMERS_TABLE_ID) {
    throw new Error('אנא הגדר VITE_CUSTOMERS_TABLE_ID בקובץ .env')
  }
  if (!QUOTE_CONTACTS_TABLE_ID) {
    throw new Error('אנא הגדר VITE_CONTACTS_TABLE_ID בקובץ .env')
  }
  if (!customerRecordId) return []

  const customerLinkField = import.meta.env.VITE_CUSTOMER_CONTACTS_LINK_FIELD
  if (!customerLinkField) {
    throw new Error(
      'אנא הגדר VITE_CUSTOMER_CONTACTS_LINK_FIELD — שדה בטבלת לקוחות שמקשר לאנשי קשר'
    )
  }

  const nameField = import.meta.env.VITE_CONTACT_NAME_FIELD || 'שם'
  const emailField = import.meta.env.VITE_CONTACT_EMAIL_FIELD || 'אימייל'
  const phoneField = import.meta.env.VITE_CONTACT_PHONE_FIELD || 'טלפון'

  const customerParams = {}
  if (quoteUsesFieldId(customerLinkField)) {
    customerParams.returnFieldsByFieldId = true
  }

  const contactsParams = {}
  if (quoteUsesFieldId(nameField) || quoteUsesFieldId(emailField) || quoteUsesFieldId(phoneField)) {
    contactsParams.returnFieldsByFieldId = true
  }

  const authHeaders = { Authorization: `Bearer ${AIRTABLE_API_KEY}` }

  try {
    const customerUrl = `${AIRTABLE_BASE_URL}/${QUOTE_CUSTOMERS_TABLE_ID}/${customerRecordId}`
    const customerRes = await axios.get(customerUrl, {
      params: customerParams,
      headers: authHeaders,
    })

    const cf = customerRes.data.fields || {}
    const contactIds = normalizeLinkedRecordIds(cf[customerLinkField])
    if (!contactIds.length) return []

    const contactsBase = `${AIRTABLE_BASE_URL}/${QUOTE_CONTACTS_TABLE_ID}`
    const records = await Promise.all(
      contactIds.map((recId) =>
        axios.get(`${contactsBase}/${recId}`, {
          params: contactsParams,
          headers: authHeaders,
        }).then((r) => r.data)
      )
    )

    const options = records.map((record) => ({
      id: record.id,
      name: quoteFieldStr(record, nameField) || record.id,
      email: quoteFieldStr(record, emailField),
      phone: quoteFieldStr(record, phoneField),
    }))

    return options.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if (error.response) {
      throw new Error(
        `אנשי קשר: ${error.response.data?.error?.message || error.response.statusText}`
      )
    }
    if (error.request) {
      throw new Error('שגיאת רשת: לא ניתן להתחבר ל-Airtable API')
    }
    throw new Error(error.message || 'אירעה שגיאה לא צפויה')
  }
}

/**
 * Submit quote to backend (creates Airtable record, n8n webhook).
 */
export const submitQuote = async (payload) => {
  const url = apiUrl('/api/quote/submit')
  if (url == null) {
    throw new Error(
      'הגדר VITE_PDF_API_BASE_URL ב-.env — לדוגמה http://localhost:3001 לפיתוח, או ערך ריק לאותו דומיין בפרודקשן'
    )
  }
  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
    })
    return response.data
  } catch (error) {
    const msg =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
}

