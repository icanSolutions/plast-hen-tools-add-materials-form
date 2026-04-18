import React, { useState, useEffect } from 'react'
import {
  fetchSuppliers,
  fetchMaterials,
  createSupplierOrder,
} from '../services/airtable'
import { getApiBaseUrl, apiUrl } from '../utils/apiBase.js'
import SearchableSelect from './SearchableSelect'
import './SupplierOrderForm.css'

/** Triggers a file download in the browser from a Blob (e.g. PDF from API). */
export function triggerPdfDownload(blob, filename = 'הזמנת-ספק.pdf') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const createEmptyLine = () => ({
  materialId: '',
  materialName: '',
  freeDescription: '',
  dimensions: '',
  quantity: '',
  lineNotes: '',
  status: 'פעיל',
})

const SupplierOrderForm = () => {
  const [order, setOrder] = useState({
    supplierId: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [lines, setLines] = useState([createEmptyLine()])
  const [suppliers, setSuppliers] = useState([])
  const [materials, setMaterials] = useState([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState(null)

  useEffect(() => {
    const loadOptions = async () => {
      try {
        setIsLoadingOptions(true)
        const [suppliersData, materialsData] = await Promise.all([
          fetchSuppliers(),
          fetchMaterials(),
        ])
        setSuppliers(suppliersData)
        setMaterials(materialsData)
      } catch (error) {
        setSubmitStatus({
          type: 'error',
          message: `שגיאה בטעינת אפשרויות: ${error.message}`,
        })
      } finally {
        setIsLoadingOptions(false)
      }
    }
    loadOptions()
  }, [])

  const updateOrderField = (field, value) => {
    setOrder((prev) => ({ ...prev, [field]: value }))
  }

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()])
  }

  const removeLine = (index) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const updateLine = (index, field, value) => {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleMaterialChange = (index, materialId) => {
    const material = materials.find((m) => m.id === materialId)
    updateLine(index, 'materialId', materialId)
    updateLine(index, 'materialName', material ? material.name : '')
  }

  const getMaterialsSummary = () => {
    const names = lines
      .map((line) => line.materialName || line.freeDescription)
      .filter(Boolean)
    if (!names.length) return ''
    return names.join(', ')
  }

  const handleSubmit = async (e, action) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus(null)

    try {
      if (!order.supplierId) {
        setSubmitStatus({ type: 'error', message: 'יש לבחור ספק' })
        setIsSubmitting(false)
        return
      }

      const validLines = lines.filter(
        (line) =>
          line.materialId ||
          line.freeDescription ||
          line.dimensions ||
          line.quantity ||
          line.lineNotes
      )

      if (validLines.length === 0) {
        setSubmitStatus({
          type: 'error',
          message: 'יש למלא לפחות שורת הזמנה אחת',
        })
        setIsSubmitting(false)
        return
      }

      const invalidLines = validLines.filter(
        (line) =>
          (!line.materialId && !line.freeDescription) || !line.quantity
      )

      if (invalidLines.length > 0) {
        setSubmitStatus({
          type: 'error',
          message:
            'בכל שורת הזמנה חובה לבחור חומר גלם או למלא תיאור חופשי וגם כמות',
        })
        setIsSubmitting(false)
        return
      }

      const materialsSummary = getMaterialsSummary()
      const payloadLines = validLines.map((line) => ({
        ...line,
        quantity: line.quantity,
      }))
      console.log('[SupplierOrderForm] submit: supplierId=', order.supplierId, 'lines=', payloadLines.length, 'firstLine.materialId=', payloadLines[0]?.materialId)

      const result = await createSupplierOrder(
        { ...order, materialsSummary },
        payloadLines
      )
      console.log('The new order from supplier result:', result)

      const apiBase = getApiBaseUrl()
      console.log(
        '[SupplierOrderForm] API base:',
        apiBase === null ? '(VITE_PDF_API_BASE_URL not set)' : apiBase === '' ? '(same origin)' : apiBase
      )

      if (apiBase !== null && action === 'save-pdf') {
        setSubmitStatus({ type: 'success', message: 'מוריד PDF...' })
        try {
          const pdfUrl = apiUrl('/api/supplier-order/pdf')
          console.log('[SupplierOrderForm] calling backend PDF:', pdfUrl)
          const res = await fetch(pdfUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: result.order?.id,
              order: { ...order, materialsSummary },
              lines: payloadLines,
            }),
          })
          if (res.ok) {
            const blob = await res.blob()
            triggerPdfDownload(blob)
            setSubmitStatus({
              type: 'success',
              message: `הזמנה נוצרה וה-PDF הורד. (${result.lineCount} שורות)`,
            })
          } else {
            const errBody = await res.text()
            console.error('[SupplierOrderForm] backend PDF non-ok:', res.status, res.statusText, errBody)
            setSubmitStatus({
              type: 'success',
              message: `הזמנה נוצרה (${result.lineCount} שורות). הורדת PDF לא זמינה כרגע.`,
            })
          }
        } catch (apiErr) {
          console.error('[SupplierOrderForm] backend PDF error:', apiErr)
          setSubmitStatus({
            type: 'success',
            message: `הזמנה נוצרה (${result.lineCount} שורות). שגיאה בהורדת PDF: ${apiErr.message}`,
          })
        }
      } else if (apiBase !== null && action === 'send') {
        setSubmitStatus({ type: 'success', message: 'שולח לספק ומעלה ל-Drive...' })
        try {
          const sendUrl = apiUrl('/api/supplier-order/send')
          console.log('[SupplierOrderForm] calling backend send:', sendUrl)
          const res = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: result.order?.id,
              order: { ...order, materialsSummary },
              lines: payloadLines,
            }),
          })
          if (res.ok) {
            setSubmitStatus({
              type: 'success',
              message: `הזמנה נוצרה ונשלחה לספק (${result.lineCount} שורות).`,
            })
          } else {
            const errBody = await res.text()
            console.error('[SupplierOrderForm] backend send non-ok:', res.status, res.statusText, errBody)
            setSubmitStatus({
              type: 'success',
              message: `הזמנה נוצרה (${result.lineCount} שורות). שליחה לספק לא בוצעה.`,
            })
          }
        } catch (apiErr) {
          console.error('[SupplierOrderForm] backend send error:', apiErr)
          setSubmitStatus({
            type: 'success',
            message: `הזמנה נוצרה (${result.lineCount} שורות). שגיאה בשליחה: ${apiErr.message}`,
          })
        }
      } else {
        setSubmitStatus({
          type: 'success',
          message:
            apiBase !== null
              ? `נוצרה בהצלחה הזמנת ספק (${result.lineCount} שורות).`
              : `הזמנה נוצרה (${result.lineCount} שורות). להפעלת PDF/Drive: הגדר VITE_PDF_API_BASE_URL ב-.env (למשל http://localhost:3001), הפעל את השרת (cd server && npm run dev) וטען מחדש את הדף.`,
        })
      }

      setTimeout(() => {
        setOrder({
          supplierId: '',
          date: new Date().toISOString().slice(0, 10),
          notes: '',
        })
        setLines([createEmptyLine()])
        setSubmitStatus(null)
      }, 4000)
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message:
          error.message ||
          'שגיאה ביצירת הזמנת ספק. אנא בדוק את הגדרות ה-Airtable שלך.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="supplier-order-form" onSubmit={(e) => e.preventDefault()}>
      {isLoadingOptions && (
        <div className="order-doc-loading">טוען אפשרויות...</div>
      )}

      <div className="order-doc">
        <h1 className="order-doc-title">הזמנת ספק</h1>

        <div className="order-doc-meta">
          <div className="order-doc-meta-row">
            <span className="order-doc-label">לכבוד:</span>
            <div className="order-doc-field-inline">
              <SearchableSelect
                options={suppliers}
                value={order.supplierId}
                onChange={(id) => updateOrderField('supplierId', id)}
                placeholder="בחר ספק..."
                disabled={isLoadingOptions}
                aria-label="ספק"
              />
            </div>
          </div>
          <div className="order-doc-meta-row">
            <span className="order-doc-label">תאריך:</span>
            <input
              type="date"
              value={order.date}
              onChange={(e) => updateOrderField('date', e.target.value)}
              className="order-doc-input-inline"
              required
            />
          </div>
        </div>

        <table className="order-doc-table">
          <thead>
            <tr>
              <th>חומר גלם / תיאור</th>
              <th>מידות</th>
              <th>כמות</th>
              <th>הערות</th>
              <th className="order-doc-table-actions" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <div className="order-doc-cell-fields">
                    <SearchableSelect
                      options={materials}
                      value={line.materialId}
                      onChange={(id) => handleMaterialChange(index, id)}
                      placeholder="חומר גלם..."
                      disabled={isLoadingOptions}
                      aria-label="חומר גלם"
                    />
                    <input
                      type="text"
                      value={line.freeDescription}
                      onChange={(e) =>
                        updateLine(index, 'freeDescription', e.target.value)
                      }
                      placeholder="מוצר חופשי - אם לא קיים בחומרי גלם"
                      className="order-doc-input"
                    />
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    value={line.dimensions}
                    onChange={(e) =>
                      updateLine(index, 'dimensions', e.target.value)
                    }
                    placeholder="מידות"
                    className="order-doc-input"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(index, 'quantity', e.target.value)
                    }
                    placeholder="כמות"
                    className="order-doc-input order-doc-input-qty"
                    required
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={line.lineNotes}
                    onChange={(e) =>
                      updateLine(index, 'lineNotes', e.target.value)
                    }
                    placeholder="הערות לשורה"
                    className="order-doc-input"
                  />
                </td>
                <td className="order-doc-table-actions">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="order-doc-remove-row"
                      aria-label="הסר שורה"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="order-doc-add-row">
          <button
            type="button"
            onClick={addLine}
            className="add-record-btn"
            aria-label="הוסף שורת הזמנה"
          >
            <span className="plus-icon">+</span>
            הוסף שורה
          </button>
        </div>

        <div className="order-doc-notes">
          <span className="order-doc-label">הערות:</span>
          <textarea
            value={order.notes}
            onChange={(e) => updateOrderField('notes', e.target.value)}
            placeholder="הערות להזמנה"
            className="order-doc-textarea"
          />
        </div>

        <div className="order-doc-actions">
          <button
            type="button"
            onClick={(e) => handleSubmit(e, 'save-pdf')}
            className="submit-btn submit-btn-save"
            disabled={isSubmitting || isLoadingOptions}
          >
            {isSubmitting ? 'יוצר...' : 'צור ושמור PDF'}
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, 'send')}
            className="submit-btn submit-btn-send"
            disabled={isSubmitting || isLoadingOptions}
          >
            {isSubmitting ? 'יוצר...' : 'צור ושלח לספק'}
          </button>
        </div>
      </div>

      {submitStatus && (
        <div className={`status-message ${submitStatus.type}`}>
          {submitStatus.message}
        </div>
      )}
    </form>
  )
}

export default SupplierOrderForm
