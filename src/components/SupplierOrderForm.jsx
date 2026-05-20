import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { fetchSuppliers, createSupplierOrder } from '../services/airtable'
import { getApiBaseUrl, apiUrl } from '../utils/apiBase.js'
import SearchableSelect from './SearchableSelect'
import './SupplierOrderForm.css'
import './QuoteForm.css'

const createEmptyLine = () => ({
  materialName: '',
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
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formAlert, setFormAlert] = useState(null)
  const [submitResult, setSubmitResult] = useState(null)
  const resultTitleRef = useRef(null)

  useLayoutEffect(() => {
    if (!submitResult) return
    window.scrollTo(0, 0)
    resultTitleRef.current?.focus({ preventScroll: true })
  }, [submitResult])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        setIsLoadingOptions(true)
        const suppliersData = await fetchSuppliers()
        setSuppliers(suppliersData)
      } catch (error) {
        setFormAlert({
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

  const getMaterialsSummary = () => {
    const names = lines.map((line) => line.materialName?.trim()).filter(Boolean)
    if (!names.length) return ''
    return names.join(', ')
  }

  const resetForNewOrder = () => {
    setOrder({
      supplierId: '',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    })
    setLines([createEmptyLine()])
    setSubmitResult(null)
    setFormAlert(null)
  }

  const handleSubmit = async (e, action) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFormAlert(null)
    setSubmitResult(null)

    try {
      if (!order.supplierId) {
        setFormAlert({ type: 'error', message: 'יש לבחור ספק' })
        setIsSubmitting(false)
        return
      }

      const validLines = lines.filter(
        (line) =>
          line.materialName?.trim() ||
          line.dimensions?.trim() ||
          line.quantity ||
          line.lineNotes?.trim()
      )

      if (validLines.length === 0) {
        setFormAlert({
          type: 'error',
          message: 'יש למלא לפחות שורת הזמנה אחת',
        })
        setIsSubmitting(false)
        return
      }

      const invalidLines = validLines.filter(
        (line) => !line.materialName?.trim() || !line.quantity
      )

      if (invalidLines.length > 0) {
        setFormAlert({
          type: 'error',
          message: 'בכל שורת הזמנה חובה למלא שם חומר וכמות',
        })
        setIsSubmitting(false)
        return
      }

      const materialsSummary = getMaterialsSummary()
      const payloadLines = validLines.map((line) => ({
        materialName: line.materialName.trim(),
        dimensions: line.dimensions,
        quantity: line.quantity,
        lineNotes: line.lineNotes,
        status: line.status,
      }))
      const supplierName =
        suppliers.find((s) => s.id === order.supplierId)?.name?.trim() || ''
      console.log(
        '[SupplierOrderForm] submit: supplierId=',
        order.supplierId,
        'lines=',
        payloadLines.length
      )

      const result = await createSupplierOrder(
        { ...order, materialsSummary },
        payloadLines
      )

      const orderId = result.order?.id || ''
      const lineCount = result.lineCount ?? 0
      const apiBase = getApiBaseUrl()

      const baseSuccess = {
        kind: 'success',
        action,
        orderId,
        lineCount,
        supplierName,
        pdfUrl: '',
        emailed: false,
        warning: '',
      }

      if (apiBase !== null && action === 'save-pdf') {
        try {
          const saveUrl = apiUrl('/api/supplier-order/pdf')
          const res = await fetch(saveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              order: { ...order, materialsSummary },
              lines: payloadLines,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.pdfUrl) {
              console.log('[SupplierOrderForm] טופס הזמנה URL:', data.pdfUrl)
            }
            setSubmitResult({
              ...baseSuccess,
              pdfUrl: data.pdfUrl || '',
              lead: `הזמנה נוצרה וטופס הזמנה נשמר ב-Airtable (${lineCount} שורות).`,
            })
          } else {
            const errBody = await res.text()
            console.error('[SupplierOrderForm] backend save non-ok:', res.status, errBody)
            setSubmitResult({
              ...baseSuccess,
              lead: `הזמנה נוצרה ב-Airtable (${lineCount} שורות).`,
              warning: 'שמירת טופס הזמנה (PDF) ב-Airtable לא בוצעה.',
            })
          }
        } catch (apiErr) {
          console.error('[SupplierOrderForm] backend save error:', apiErr)
          setSubmitResult({
            ...baseSuccess,
            lead: `הזמנה נוצרה ב-Airtable (${lineCount} שורות).`,
            warning: `שגיאה בשמירת טופס הזמנה: ${apiErr.message}`,
          })
        }
      } else if (apiBase !== null && action === 'send') {
        try {
          const sendUrl = apiUrl('/api/supplier-order/send')
          const res = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              order: { ...order, materialsSummary },
              lines: payloadLines,
            }),
          })
          if (res.ok) {
            const data = await res.json().catch(() => ({}))
            setSubmitResult({
              ...baseSuccess,
              pdfUrl: data.pdfUrl || '',
              emailed: Boolean(data.emailed),
              lead: `הזמנה נוצרה ונשלחה לספק (${lineCount} שורות).`,
            })
          } else {
            const errBody = await res.text()
            console.error('[SupplierOrderForm] backend send non-ok:', res.status, errBody)
            setSubmitResult({
              ...baseSuccess,
              warning: 'שליחה לספק לא בוצעה.',
              lead: `הזמנה נוצרה ב-Airtable (${lineCount} שורות).`,
            })
          }
        } catch (apiErr) {
          console.error('[SupplierOrderForm] backend send error:', apiErr)
          setSubmitResult({
            ...baseSuccess,
            lead: `הזמנה נוצרה ב-Airtable (${lineCount} שורות).`,
            warning: `שגיאה בשליחה: ${apiErr.message}`,
          })
        }
      } else {
        setSubmitResult({
          ...baseSuccess,
          lead:
            apiBase !== null
              ? `נוצרה בהצלחה הזמנת ספק (${lineCount} שורות).`
              : `הזמנה נוצרה (${lineCount} שורות).`,
          warning:
            apiBase === null
              ? 'להפעלת מסמך/Drive: הגדר VITE_PDF_API_BASE_URL ב-.env, הפעל את השרת (cd server && npm run dev) וטען מחדש את הדף.'
              : '',
        })
      }
    } catch (error) {
      setSubmitResult({
        kind: 'error',
        message:
          error.message ||
          'שגיאה ביצירת הזמנת ספק. אנא בדוק את הגדרות ה-Airtable שלך.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitResult) {
    const ok = submitResult.kind === 'success'
    return (
      <div className="quote-result-page supplier-order-result-page">
        <div className={`quote-result-card ${ok ? 'success' : 'error'}`}>
          <div className="quote-result-announce">
            <h1
              ref={resultTitleRef}
              className="quote-result-title"
              tabIndex={-1}
            >
              {ok ? 'ההזמנה נוצרה בהצלחה' : 'הפעולה נכשלה'}
            </h1>
            {ok ? (
              <>
                <p className="quote-result-lead">{submitResult.lead}</p>
                {submitResult.supplierName ? (
                  <p className="quote-result-meta">
                    ספק: <strong>{submitResult.supplierName}</strong>
                  </p>
                ) : null}
                {submitResult.orderId ? (
                  <p className="quote-result-meta">
                    מזהה הזמנה: <span dir="ltr">{submitResult.orderId}</span>
                  </p>
                ) : null}
                {submitResult.pdfUrl ? (
                  <p className="quote-result-hint">
                    <a href={submitResult.pdfUrl} target="_blank" rel="noreferrer">
                      טופס הזמנה (PDF)
                    </a>
                    {submitResult.emailed ? ' · נשלח מייל לספק' : ''}
                  </p>
                ) : null}
                {submitResult.warning ? (
                  <p className="quote-result-warning" role="alert">
                    {submitResult.warning}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="quote-result-error-msg">{submitResult.message}</p>
            )}
          </div>
          <div className="quote-result-actions">
            <button
              type="button"
              className="quote-submit-btn"
              onClick={resetForNewOrder}
            >
              הזמנה חדשה
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="supplier-order-form" onSubmit={(e) => e.preventDefault()}>
      {isLoadingOptions && (
        <div className="order-doc-loading">טוען אפשרויות...</div>
      )}

      <div className="order-doc">
        <h1 className="order-doc-title">הזמנת ספק</h1>

        {formAlert && (
          <div className={`form-alert form-alert-${formAlert.type}`} role="alert">
            {formAlert.message}
          </div>
        )}

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
              <th>שם חומר</th>
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
                  <input
                    type="text"
                    value={line.materialName}
                    onChange={(e) =>
                      updateLine(index, 'materialName', e.target.value)
                    }
                    placeholder="שם החומר"
                    className="order-doc-input"
                    disabled={isLoadingOptions}
                    required
                  />
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
                    disabled={isLoadingOptions}
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
                    disabled={isLoadingOptions}
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
                    disabled={isLoadingOptions}
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
            {isSubmitting ? 'יוצר...' : 'צור ושמור ב-Airtable'}
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
    </form>
  )
}

export default SupplierOrderForm
