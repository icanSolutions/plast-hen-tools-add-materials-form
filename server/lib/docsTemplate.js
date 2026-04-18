import { google } from 'googleapis'
import { getGoogleAuth } from './drive.js'

const PLACEHOLDER_ORDER_LINES = '{{ORDER_LINES}}'
const TABLE_COLS = 4
const TABLE_HEADERS = ['חומר גלם / תיאור', 'מידות', 'כמות', 'הערות']

let docsClient = null

async function getDocs() {
  if (docsClient) return docsClient
  const auth = await getGoogleAuth()
  docsClient = google.docs({ version: 'v1', auth })
  return docsClient
}

/**
 * Find the start index of a text placeholder in the document body.
 * @param {Object} doc - Document from documents.get
 * @param {string} text - Placeholder text to find (e.g. {{ORDER_LINES}})
 * @returns {number|null} - startIndex or null
 */
function findTextIndex(doc, text) {
  const content = doc.body?.content || []
  for (const el of content) {
    if (el.paragraph?.elements) {
      for (const pe of el.paragraph.elements) {
        if (pe.textRun?.content?.includes(text)) {
          return pe.startIndex
        }
      }
    }
  }
  return null
}

/**
 * Fill the document with order data: replace placeholders and insert order lines table.
 * @param {string} documentId - Google Doc ID (Drive file ID)
 * @param {Object} data - { supplierName, date, notes, order_reference, lines }
 * @param {Array} data.lines - [{ materialName, freeDescription, dimensions, quantity, lineNotes }]
 */
export async function fillOrderDoc(documentId, data) {
  const docs = await getDocs()
  const {
    supplierName = '',
    date = '',
    notes = '',
    order_reference = '',
    lines = [],
  } = data

  const doc = await docs.documents.get({ documentId })
  const orderLinesIndex = findTextIndex(doc.data, PLACEHOLDER_ORDER_LINES)
  if (orderLinesIndex == null) {
    throw new Error(`Template placeholder ${PLACEHOLDER_ORDER_LINES} not found in document`)
  }

  const rows = lines.length + 1
  const requests = [
    {
      replaceAllText: {
        containsText: { text: '{{supplierName}}', matchCase: true },
        replaceText: String(supplierName),
      },
    },
    {
      replaceAllText: {
        containsText: { text: '{{date}}', matchCase: true },
        replaceText: String(date),
      },
    },
    {
      replaceAllText: {
        containsText: { text: '{{notes}}', matchCase: true },
        replaceText: String(notes),
      },
    },
    {
      replaceAllText: {
        containsText: { text: '{{order_reference}}', matchCase: true },
        replaceText: String(order_reference),
      },
    },
    {
      replaceAllText: {
        containsText: { text: PLACEHOLDER_ORDER_LINES, matchCase: true },
        replaceText: '',
      },
    },
    {
      insertTable: {
        rows,
        columns: TABLE_COLS,
        location: { index: orderLinesIndex, segmentId: '' },
      },
    },
  ]

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  })

  const docAfter = await docs.documents.get({ documentId })
  const content = docAfter.data.body?.content || []
  const tableEl = content.find((el) => el.table != null)
  if (!tableEl?.table?.tableRows) return

  const insertTextRequests = []
  const tableRows = tableEl.table.tableRows
  for (let rowIdx = 0; rowIdx < tableRows.length; rowIdx++) {
    const row = tableRows[rowIdx]
    const cells = row.tableCells || []
    for (let colIdx = 0; colIdx < cells.length && colIdx < TABLE_COLS; colIdx++) {
      const cell = cells[colIdx]
      const cellContent = cell.content || []
      let insertIndex = null
      for (const c of cellContent) {
        const para = c.paragraph
        if (para?.elements?.length) {
          insertIndex = para.elements[0].startIndex
          break
        }
      }
      if (insertIndex == null) continue
      let text
      if (rowIdx === 0) {
        text = TABLE_HEADERS[colIdx] ?? ''
      } else {
        const line = lines[rowIdx - 1] || {}
        const desc = [line.materialName, line.freeDescription].filter(Boolean).join(' / ') || '—'
        switch (colIdx) {
          case 0:
            text = desc
            break
          case 1:
            text = line.dimensions || '—'
            break
          case 2:
            text = line.quantity != null && line.quantity !== '' ? String(line.quantity) : '—'
            break
          case 3:
            text = line.lineNotes || '—'
            break
          default:
            text = ''
        }
      }
      insertTextRequests.push({
        insertText: {
          location: { index: insertIndex, segmentId: '' },
          text: String(text),
        },
      })
    }
  }

  if (insertTextRequests.length) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: insertTextRequests },
    })
  }
}
