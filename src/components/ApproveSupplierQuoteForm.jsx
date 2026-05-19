import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiBaseUrl, apiUrl } from '../utils/apiBase.js'
import SearchableSelect from './SearchableSelect'
import './SupplierOrderForm.css'
import './ApproveSupplierQuoteForm.css'
import './QuoteForm.css'

function ApproveSupplierQuoteForm() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [price, setPrice] = useState('')
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
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
    const load = async () => {
      const apiBase = getApiBaseUrl()
      if (apiBase === null) {
        setFormAlert({
          type: 'error',
          message:
            'הגדר VITE_PDF_API_BASE_URL ב-.env והפעל את השרת (cd server && npm run dev)',
        })
        setIsLoadingList(false)
        return
      }
      try {
        setIsLoadingList(true)
        const res = await fetch(apiUrl('/api/supplier-quote-approve/requests'))
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || res.statusText)
        setRequests(data.requests || [])
      } catch (error) {
        setFormAlert({
          type: 'error',
          message: `שגיאה בטעינת בקשות: ${error.message}`,
        })
      } finally {
        setIsLoadingList(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setPrice('')
      return
    }
    let cancelled = false
    const loadDetail = async () => {
      setIsLoadingDetail(true)
      setFormAlert(null)
      try {
        const res = await fetch(
          apiUrl(`/api/supplier-quote-approve/requests/${selectedId}`)
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || res.statusText)
        if (cancelled) return
        setDetail(data)
        if (data.quoteRequest?.price != null && data.quoteRequest.price !== '') {
          setPrice(String(data.quoteRequest.price))
        } else {
          setPrice('')
        }
      } catch (error) {
        if (!cancelled) {
          setDetail(null)
          setFormAlert({
            type: 'error',
            message: `שגיאה בטעינת פרטי בקשה: ${error.message}`,
          })
        }
      } finally {
        if (!cancelled) setIsLoadingDetail(false)
      }
    }
    loadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormAlert(null)
    setSubmitResult(null)

    if (!selectedId) {
      setFormAlert({ type: 'error', message: 'יש לבחור בקשת הצעת מחיר' })
      return
    }
    const numericPrice = Number(price)
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setFormAlert({ type: 'error', message: 'יש להזין מחיר תקין' })
      return
    }

    const apiBase = getApiBaseUrl()
    if (apiBase === null) {
      setFormAlert({
        type: 'error',
        message: 'השרת לא מוגדר (VITE_PDF_API_BASE_URL)',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/supplier-quote-approve/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteRequestId: selectedId,
          price: numericPrice,
          action: 'send',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || res.statusText || 'שגיאה באישור הבקשה')
      }
      setSubmitResult({ kind: 'success', ...data })
    } catch (error) {
      setSubmitResult({
        kind: 'error',
        message: error.message || 'שגיאה באישור הבקשה',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const startNew = useCallback(() => {
    setSelectedId('')
    setDetail(null)
    setPrice('')
    setSubmitResult(null)
    setFormAlert(null)
    navigate('/approve-supplier-quote', { replace: true })
  }, [navigate])

  if (submitResult) {
    const ok = submitResult.kind === 'success'
    return (
      <div className="quote-result-page">
        <div className={`quote-result-card ${ok ? 'success' : 'error'}`}>
          <div className="quote-result-announce">
            <h1
              ref={resultTitleRef}
              className="quote-result-title"
              tabIndex={-1}
            >
              {ok ? 'ההצעה אושרה וההזמנה נוצרה' : 'הפעולה נכשלה'}
            </h1>
            {ok ? (
              <>
                <p className="quote-result-lead">
                  מחיר מאושר:{' '}
                  <strong className="quote-result-ref">{submitResult.price}</strong>
                </p>
                <p className="quote-result-meta">
                  הזמנת ספק: <span dir="ltr">{submitResult.orderId}</span>
                  {submitResult.order_reference
                    ? ` · ${submitResult.order_reference}`
                    : ''}
                </p>
                {submitResult.pdfUrl ? (
                  <p className="quote-result-hint">
                    <a href={submitResult.pdfUrl} target="_blank" rel="noreferrer">
                      טופס הזמנה (PDF)
                    </a>
                    {submitResult.emailed
                      ? ' · נשלח מייל לספק'
                      : ' · לא נשלח מייל (אין כתובת לספק)'}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="quote-result-error-msg">{submitResult.message}</p>
            )}
          </div>
          <div className="quote-result-actions">
            <button type="button" className="quote-submit-btn" onClick={startNew}>
              אישור הצעה נוספת
            </button>
          </div>
        </div>
      </div>
    )
  }

  const qr = detail?.quoteRequest
  const materials = detail?.materials || []

  return (
    <form
      className="supplier-order-form approve-supplier-quote-form"
      onSubmit={handleSubmit}
    >
      <div className="order-doc">
        <h1 className="order-doc-title">אישור הצעת מחיר מספק</h1>
        <p className="approve-quote-intro">
          בחר בקשת הצעת מחיר, הזן את המחיר שהתקבל מהספק, ואשר — תיווצר הזמנת ספק,
          מסמך PDF, שליחה לספק, ועדכון הבקשה לסטטוס אושר.
        </p>

        {formAlert && (
          <div className={`form-alert form-alert-${formAlert.type}`} role="alert">
            {formAlert.message}
          </div>
        )}

        <section className="order-doc-meta">
          <div className="order-doc-meta-row">
            <span className="order-doc-label">בקשת הצעת מחיר *</span>
            <div className="order-doc-field-inline">
              <SearchableSelect
                id="approve-quote-request"
                options={requests.map((r) => ({ id: r.id, name: r.label }))}
                value={selectedId}
                onChange={setSelectedId}
                placeholder={
                  isLoadingList ? 'טוען בקשות...' : 'בחר בקשה לאישור...'
                }
                disabled={isLoadingList || isSubmitting}
                aria-label="בקשת הצעת מחיר"
              />
            </div>
          </div>
        </section>

        {selectedId && isLoadingDetail && (
          <p className="approve-quote-hint">טוען פרטי בקשה...</p>
        )}

        {qr && !isLoadingDetail && (
          <section className="approve-quote-detail">
            <h2 className="quote-request-section-title">פרטי הבקשה</h2>
            <dl className="approve-quote-fields">
              <div className="approve-quote-field-row">
                <dt>ספק</dt>
                <dd>{qr.supplierName || '—'}</dd>
              </div>
              <div className="approve-quote-field-row">
                <dt>תיק ייצור</dt>
                <dd>{qr.projectName || '—'}</dd>
              </div>
              <div className="approve-quote-field-row">
                <dt>חומרי גלם</dt>
                <dd>
                  {materials.length ? (
                    <ul className="approve-quote-materials-list">
                      {materials.map((m) => (
                        <li key={m.id}>{m.label || m.materialName}</li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>

            <div className="approve-quote-price-row">
              <label htmlFor="approve-quote-price">מחיר מהספק *</label>
              <input
                id="approve-quote-price"
                type="number"
                min="0"
                step="any"
                className="order-doc-input-inline approve-quote-price-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={isSubmitting}
                dir="ltr"
                placeholder="0"
              />
            </div>
          </section>
        )}

        <div className="order-doc-actions">
          <button
            type="submit"
            className="submit-btn submit-btn-send"
            disabled={
              isSubmitting || isLoadingList || !selectedId || isLoadingDetail
            }
          >
            {isSubmitting
              ? 'יוצר הזמנה ושולח...'
              : 'אשר, צור הזמנה ושלח לספק'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default ApproveSupplierQuoteForm
