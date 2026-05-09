import axios from 'axios'

const baseId = process.env.AIRTABLE_BASE_ID
const apiKey = process.env.AIRTABLE_API_KEY

function headers() {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function tableUrl(tableId) {
  return `https://api.airtable.com/v0/${baseId}/${tableId}`
}

function normalizeLinkedRecordIds(value) {
  if (value == null) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw.filter((s) => typeof s === 'string' && s.startsWith('rec'))
}

/**
 * Create a Contact row and link it to the customer (company).
 * Prefer QUOTE_CONTACT_CUSTOMER_LINK_FIELD on Contacts (link to Customers).
 * Otherwise PATCH the Customer row: merge new id into QUOTE_CUSTOMER_CONTACTS_LINK_FIELD.
 */
export async function createQuoteContactAndLink({
  customerRecordId,
  name,
  email,
  phone,
}) {
  if (!baseId || !apiKey) {
    throw new Error('AIRTABLE_BASE_ID and AIRTABLE_API_KEY are required')
  }
  const contactsTableId = process.env.AIRTABLE_QUOTE_CONTACTS_TABLE_ID?.trim()
  const customersTableId = process.env.AIRTABLE_QUOTE_CUSTOMERS_TABLE_ID?.trim()
  const customerContactsField = process.env.QUOTE_CUSTOMER_CONTACTS_LINK_FIELD?.trim()
  const contactCustomerField = process.env.QUOTE_CONTACT_CUSTOMER_LINK_FIELD?.trim()
  const nameField =
    process.env.QUOTE_CONTACT_CREATE_NAME_FIELD?.trim() || 'שם'
  const emailField =
    process.env.QUOTE_CONTACT_CREATE_EMAIL_FIELD?.trim() || 'אימייל'
  const phoneField =
    process.env.QUOTE_CONTACT_CREATE_PHONE_FIELD?.trim() || 'טלפון'

  if (!contactsTableId) {
    throw new Error('AIRTABLE_QUOTE_CONTACTS_TABLE_ID is required to create contacts')
  }
  if (!customersTableId) {
    throw new Error('AIRTABLE_QUOTE_CUSTOMERS_TABLE_ID is required to create contacts')
  }
  if (!customerContactsField && !contactCustomerField) {
    throw new Error(
      'Set QUOTE_CONTACT_CUSTOMER_LINK_FIELD (link on Contacts → Customer) or QUOTE_CUSTOMER_CONTACTS_LINK_FIELD (link on Customer → Contacts)'
    )
  }

  const fields = { [nameField]: String(name).trim() }
  if (email != null && String(email).trim() !== '') {
    fields[emailField] = String(email).trim()
  }
  if (phone != null && String(phone).trim() !== '') {
    fields[phoneField] = String(phone).trim()
  }
  if (contactCustomerField) {
    fields[contactCustomerField] = [customerRecordId]
  }

  const createRes = await axios.post(
    tableUrl(contactsTableId),
    { records: [{ fields }] },
    { headers: headers() }
  )
  const newId = createRes.data.records?.[0]?.id
  if (!newId) throw new Error('Airtable did not return new contact id')

  if (!contactCustomerField && customerContactsField) {
    const getUrl = `${tableUrl(customersTableId)}/${customerRecordId}`
    const getRes = await axios.get(getUrl, { headers: headers() })
    const existing = normalizeLinkedRecordIds(
      getRes.data.fields?.[customerContactsField]
    )
    const merged = [...new Set([...existing, newId])]
    await axios.patch(
      getUrl,
      { fields: { [customerContactsField]: merged } },
      { headers: headers() }
    )
  }

  return newId
}
