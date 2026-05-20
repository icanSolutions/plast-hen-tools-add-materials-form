import { google } from 'googleapis'
import { getGoogleAuth } from './drive.js'

/** Marker in the template table data row (row below headers), typically column 0. */
const PLACEHOLDER_LINE_ROW = '{{LINE_ROW}}'
const TABLE_COLS = 4

let docsClient = null

async function getDocs() {
  if (docsClient) return docsClient
  const auth = await getGoogleAuth()
  docsClient = google.docs({ version: 'v1', auth })
  return docsClient
}

function cellContainsText(cell, searchText) {
  for (const block of cell.content || []) {
    for (const pe of block.paragraph?.elements || []) {
      if (pe.textRun?.content?.includes(searchText)) return true
    }
  }
  return false
}

/** First paragraph startIndex inside a table cell (for insertText). */
function cellInsertIndex(cell) {
  for (const block of cell.content || []) {
    const elements = block.paragraph?.elements
    if (elements?.length && elements[0].startIndex != null) {
      return elements[0].startIndex
    }
  }
  return null
}

/** StructuralElement.startIndex for a table (required by insertTableRow). */
function resolveTableStartIndex(tableEl) {
  return tableEl?.startIndex ?? null
}

/**
 * Find a table cell containing placeholder text (searches inside tables, not body paragraphs).
 * @returns {{ tableStartIndex: number, rowIndex: number, columnIndex: number, contentIndex: number } | null}
 */
function findTableCellWithText(doc, searchText) {
  const content = doc.body?.content || []
  for (let contentIndex = 0; contentIndex < content.length; contentIndex++) {
    const el = content[contentIndex]
    if (!el.table?.tableRows) continue
    const tableStartIndex = resolveTableStartIndex(el)
    if (tableStartIndex == null) continue
    for (let rowIndex = 0; rowIndex < el.table.tableRows.length; rowIndex++) {
      const cells = el.table.tableRows[rowIndex].tableCells || []
      for (let columnIndex = 0; columnIndex < cells.length; columnIndex++) {
        if (cellContainsText(cells[columnIndex], searchText)) {
          return { tableStartIndex, rowIndex, columnIndex, contentIndex }
        }
      }
    }
  }
  return null
}

function findTableElementAtContentIndex(doc, contentIndex) {
  const el = doc.body?.content?.[contentIndex]
  return el?.table ? el : null
}

function lineCellText(line, colIdx) {
  const name = [line.materialName, line.freeDescription].filter(Boolean).join(' / ').trim()
  switch (colIdx) {
    case 0:
      return name || '—'
    case 1:
      return (line.dimensions && String(line.dimensions).trim()) || '—'
    case 2:
      return line.quantity != null && line.quantity !== '' ? String(line.quantity) : '—'
    case 3:
      return (line.lineNotes && String(line.lineNotes).trim()) || '—'
    default:
      return ''
  }
}

function buildInsertTextRequests(tableEl, templateRowIndex, lines) {
  const requests = []
  const tableRows = tableEl.table?.tableRows || []
  const numCols = Math.min(
    TABLE_COLS,
    tableEl.table?.columns ?? tableRows[0]?.tableCells?.length ?? TABLE_COLS
  )

  for (let i = 0; i < lines.length; i++) {
    const rowIndex = templateRowIndex + i
    if (rowIndex >= tableRows.length) break
    const line = lines[i] || {}
    const cells = tableRows[rowIndex].tableCells || []
    for (let colIdx = 0; colIdx < numCols && colIdx < cells.length; colIdx++) {
      const insertIndex = cellInsertIndex(cells[colIdx])
      if (insertIndex == null) continue
      requests.push({
        insertText: {
          location: { index: insertIndex, segmentId: '' },
          text: lineCellText(line, colIdx),
        },
      })
    }
  }

  // Apply highest indices first so earlier insertions do not shift later ones.
  return requests.sort(
    (a, b) => b.insertText.location.index - a.insertText.location.index
  )
}

function replaceAllTextRequests(data) {
  const { supplierName, date, notes, order_reference } = data
  const refText = String(order_reference ?? '')
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
  ]
  for (const placeholder of ['{{order_ref}}', '{{order_reference}}']) {
    requests.push({
      replaceAllText: {
        containsText: { text: placeholder, matchCase: true },
        replaceText: refText,
      },
    })
  }
  return requests
}

/**
 * Fill the document: replace header placeholders, duplicate template row per line, fill cells.
 * Template must include a table with a header row and a data row containing {{LINE_ROW}}.
 *
 * @param {string} documentId - Google Doc ID (Drive file ID)
 * @param {Object} data - { supplierName, date, notes, order_reference, lines }
 * @param {Array} data.lines - [{ materialName, dimensions, quantity, lineNotes }]
 */
function buildInsertTableRowRequests(tableStartIndex, templateRowIndex, columnIndex, count) {
  const requests = []
  for (let i = 0; i < count; i++) {
    requests.push({
      insertTableRow: {
        tableCellLocation: {
          tableStartLocation: { index: tableStartIndex, segmentId: '' },
          rowIndex: templateRowIndex,
          columnIndex,
        },
        insertBelow: true,
      },
    })
  }
  return requests
}

export async function fillOrderDoc(documentId, data) {
  const docs = await getDocs()
  const lines = data.lines || []

  let docRes = await docs.documents.get({ documentId })
  let templateCell = findTableCellWithText(docRes.data, PLACEHOLDER_LINE_ROW)
  if (!templateCell) {
    throw new Error(
      `Template placeholder ${PLACEHOLDER_LINE_ROW} not found in a table cell. ` +
        'Add a table with a header row and a data row containing {{LINE_ROW}} (e.g. first column).'
    )
  }

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests: replaceAllTextRequests(data) },
  })

  // replaceAllText shifts indices — re-resolve table location before insertTableRow.
  docRes = await docs.documents.get({ documentId })
  templateCell = findTableCellWithText(docRes.data, PLACEHOLDER_LINE_ROW)
  if (!templateCell) {
    throw new Error(
      `${PLACEHOLDER_LINE_ROW} not found after replacing header placeholders. ` +
        'Keep {{LINE_ROW}} in the template data row (below headers).'
    )
  }

  const {
    tableStartIndex,
    rowIndex: templateRowIndex,
    columnIndex,
    contentIndex,
  } = templateCell

  const extraRows = Math.max(0, lines.length - 1)
  if (extraRows > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: buildInsertTableRowRequests(
          tableStartIndex,
          templateRowIndex,
          columnIndex,
          extraRows
        ),
      },
    })
  }

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          replaceAllText: {
            containsText: { text: PLACEHOLDER_LINE_ROW, matchCase: true },
            replaceText: '',
          },
        },
      ],
    },
  })

  if (lines.length === 0) return

  docRes = await docs.documents.get({ documentId })
  const tableEl = findTableElementAtContentIndex(docRes.data, contentIndex)
  if (!tableEl?.table) return

  const insertTextRequests = buildInsertTextRequests(
    tableEl,
    templateRowIndex,
    lines
  )

  if (insertTextRequests.length) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: insertTextRequests },
    })
  }
}

const QUOTE_DOC_PLACEHOLDERS = [
  'doc_num',
  'client',
  'contact_name',
  'mail',
  'contact_phone',
  'date',
  'description',
  'products',
  'transporting',
  'additionals',
  'total_without_tax',
  'tax_price',
  'total_with_tax',
  'notes',
  'payment_conditions',
]

/**
 * Replace {{placeholder}} tokens in a quote template (no table rows).
 * @param {string} documentId
 * @param {Record<string, string>} data
 */
export async function fillQuoteDoc(documentId, data) {
  const docs = await getDocs()
  const requests = []

  for (const key of QUOTE_DOC_PLACEHOLDERS) {
    const placeholder = `{{${key}}}`
    requests.push({
      replaceAllText: {
        containsText: { text: placeholder, matchCase: true },
        replaceText: String(data[key] ?? ''),
      },
    })
  }

  // Legacy / alternate spellings
  if (data.doc_num != null) {
    requests.push({
      replaceAllText: {
        containsText: { text: '{{quote_reference}}', matchCase: true },
        replaceText: String(data.doc_num),
      },
    })
    requests.push({
      replaceAllText: {
        containsText: { text: '{{quote_ref}}', matchCase: true },
        replaceText: String(data.doc_num),
      },
    })
  }

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  })
}
