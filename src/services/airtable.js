import axios from 'axios'

// Airtable configuration
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'your-base-id'
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY || 'your-api-key'

// Tables used only for READING (dropdown options). Use table IDs (tblXXXX...) from Airtable URL.
const PRODUCTION_PROJECTS_TABLE_ID = import.meta.env.VITE_PRODUCTION_PROJECTS_TABLE_ID || ''
const MATERIALS_TABLE_ID = import.meta.env.VITE_MATERIALS_TABLE_ID || ''

// Table where form submissions are WRITTEN (new rows: תיק ייצור, חומר גלם, כמות). Use table ID or name.
const DESTINATION_TABLE_ID = import.meta.env.VITE_AIRTABLE_TABLE_ID || ''
const DESTINATION_TABLE_NAME = import.meta.env.VITE_AIRTABLE_TABLE_NAME || 'Table1'
const AIRTABLE_API_URL = DESTINATION_TABLE_ID
  ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DESTINATION_TABLE_ID}`
  : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(DESTINATION_TABLE_NAME)}`

const AIRTABLE_BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`

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
          value = value[0]
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
          if (Array.isArray(v)) v = v[0]
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
 * Fetches materials options
 */
export const fetchMaterials = async () => {
  const fieldName = import.meta.env.VITE_MATERIALS_FIELD || 'Name'
  return fetchTableOptions(MATERIALS_TABLE_ID, fieldName)
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
