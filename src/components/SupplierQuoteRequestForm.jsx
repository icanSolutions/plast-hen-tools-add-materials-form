import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchProductionProjects,
  fetchProjectMaterials,
  fetchSuppliersWithContact,
} from '../services/airtable'
import { getApiBaseUrl, apiUrl } from '../utils/apiBase.js'
import SearchableSelect from './SearchableSelect'
import './SupplierOrderForm.css'
import './SupplierQuoteRequestForm.css'
import './QuoteForm.css'

function formatDisplayDate(isoDate) {
  if (!isoDate) return '—'
  const [y, m, d] = String(isoDate).split('-')
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}

function SupplierQuoteRequestResultPage({
  submitResult,
  resultTitleRef,
  onNewRequest,
  onRetry,
}) {
  const ok = submitResult.kind === 'success'
  const results = submitResult.results || []

  return (
    <div className="quote-result-page supplier-quote-request-result">
      <div className={`quote-result-card supplier-quote-request-result-card ${ok ? 'success' : 'error'}`}>
        <div className="quote-result-announce">
          <h1
            ref={resultTitleRef}
            className="quote-result-title"
            tabIndex={-1}
          >
            {ok ? 'בקשות הצעת מחיר נוצרו בהצלחה' : 'הפעולה נכשלה'}
          </h1>
          {ok ? (
            <>
              <p className="quote-result-lead">
                נוצרו{' '}
                <strong className="quote-result-ref">{submitResult.count}</strong>{' '}
                בקשות — מסמך PDF ורשומה ב-Airtable לכל ספק.
              </p>
              <dl className="quote-request-response-summary">
                <div className="quote-request-response-summary-row">
                  <dt>תיק ייצור</dt>
                  <dd>{submitResult.projectName || '—'}</dd>
                </div>
                <div className="quote-request-response-summary-row">
                  <dt>תאריך</dt>
                  <dd>{formatDisplayDate(submitResult.date)}</dd>
                </div>
                <div className="quote-request-response-summary-row">
                  <dt>חומרים בבקשה</dt>
                  <dd>{submitResult.materialCount ?? '—'}</dd>
                </div>
              </dl>
              <p className="quote-result-hint">
                לכל ספק נוצר מסמך בקשה ורשומה בטבלת בקשת הצעת מחיר. ניתן לפתוח את
                המסמך או את הרשומה ב-Airtable מהרשימה למטה.
              </p>
              <ul className="quote-request-response-list" aria-label="תוצאות לפי ספק">
                {results.map((r) => (
                  <li key={r.supplierId || r.recordId} className="quote-request-response-item">
                    <div className="quote-request-response-item-head">
                      <strong className="quote-request-response-supplier">
                        {r.supplierName || 'ספק'}
                      </strong>
                      {r.recordId ? (
                        <span className="quote-request-response-record-id" dir="ltr">
                          {r.recordId}
                        </span>
                      ) : null}
                    </div>
                    <div className="quote-request-response-item-actions">
                      {r.pdfUrl ? (
                        <a
                          href={r.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="quote-request-response-link"
                        >
                          טופס בקשה (PDF)
                        </a>
                      ) : (
                        <span className="quote-request-response-missing">ללא PDF</span>
                      )}
                      {r.airtableRecordUrl ? (
                        <a
                          href={r.airtableRecordUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="quote-request-response-link quote-request-response-link-airtable"
                        >
                          פתח ב-Airtable
                        </a>
                      ) : null}
                    </div>
                    {(r.email || r.phone) && (
                      <p className="quote-request-response-contact" dir="ltr">
                        {[r.email, r.phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="quote-result-error-msg">{submitResult.message}</p>
          )}
        </div>
        <div className="quote-result-actions">
          <button
            type="button"
            className="quote-submit-btn"
            onClick={onNewRequest}
          >
            בקשה חדשה
          </button>
          {!ok ? (
            <button
              type="button"
              className="quote-result-airtable-btn"
              onClick={onRetry}
            >
              חזרה לטופס
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const SupplierQuoteRequestForm = () => {
  const navigate = useNavigate()
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [projects, setProjects] = useState([])
  const [materials, setMaterials] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState(new Set())
  const [selectedSupplierIds, setSelectedSupplierIds] = useState(new Set())
  const [supplierContacts, setSupplierContacts] = useState({})
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false)
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
      try {
        setIsLoadingOptions(true)
        const [projectsData, suppliersData] = await Promise.all([
          fetchProductionProjects(),
          fetchSuppliersWithContact(),
        ])
        setProjects(projectsData)
        setSuppliers(suppliersData)
        const contacts = {}
        for (const s of suppliersData) {
          contacts[s.id] = { email: s.email, phone: s.phone }
        }
        setSupplierContacts(contacts)
      } catch (error) {
        setFormAlert({
          type: 'error',
          message: `שגיאה בטעינת אפשרויות: ${error.message}`,
        })
      } finally {
        setIsLoadingOptions(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!projectId) {
      setMaterials([])
      setSelectedMaterialIds(new Set())
      return
    }
    let cancelled = false
    const loadMaterials = async () => {
      setIsLoadingMaterials(true)
      setFormAlert(null)
      try {
        const projectName =
          projects.find((p) => p.id === projectId)?.name?.trim() || ''
        const rows = await fetchProjectMaterials(projectName)
        if (cancelled) return
        setMaterials(rows)
        setSelectedMaterialIds(new Set())
      } catch (error) {
        if (!cancelled) {
          setMaterials([])
          setFormAlert({
            type: 'error',
            message: `שגיאה בטעינת חומרים: ${error.message}`,
          })
        }
      } finally {
        if (!cancelled) setIsLoadingMaterials(false)
      }
    }
    loadMaterials()
    return () => {
      cancelled = true
    }
  }, [projectId, projects])

  const toggleMaterial = (id) => {
    setSelectedMaterialIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSupplier = (id) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const updateSupplierContact = (supplierId, field, value) => {
    setSupplierContacts((prev) => ({
      ...prev,
      [supplierId]: { ...prev[supplierId], [field]: value },
    }))
  }

  const selectAllMaterials = () => {
    setSelectedMaterialIds(new Set(materials.map((m) => m.id)))
  }

  const clearMaterials = () => setSelectedMaterialIds(new Set())

  const selectedMaterials = materials.filter((m) => selectedMaterialIds.has(m.id))

  const buildLines = () =>
    selectedMaterials.map((m) => ({
      materialName: m.materialName,
      dimensions: m.size,
      quantity: m.quantity,
      lineNotes: m.notes,
    }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormAlert(null)
    setSubmitResult(null)

    if (!projectId) {
      setFormAlert({ type: 'error', message: 'יש לבחור תיק ייצור' })
      return
    }
    if (selectedMaterialIds.size === 0) {
      setFormAlert({ type: 'error', message: 'יש לבחור לפחות חומר אחד' })
      return
    }
    if (selectedSupplierIds.size === 0) {
      setFormAlert({ type: 'error', message: 'יש לבחור לפחות ספק אחד' })
      return
    }

    const apiBase = getApiBaseUrl()
    if (apiBase === null) {
      setFormAlert({
        type: 'error',
        message:
          'הגדר VITE_PDF_API_BASE_URL ב-.env והפעל את השרת (cd server && npm run dev)',
      })
      return
    }

    const suppliersPayload = suppliers
      .filter((s) => selectedSupplierIds.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        email: supplierContacts[s.id]?.email ?? s.email ?? '',
        phone: supplierContacts[s.id]?.phone ?? s.phone ?? '',
      }))

    setIsSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/supplier-quote-request/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          materialIds: [...selectedMaterialIds],
          date,
          notes,
          lines: buildLines(),
          suppliers: suppliersPayload,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || res.statusText || 'שגיאה ביצירת בקשות')
      }
      const projectName =
        projects.find((p) => p.id === projectId)?.name?.trim() || ''
      setSubmitResult({
        kind: 'success',
        count: data.count || suppliersPayload.length,
        results: data.results || [],
        projectName,
        date,
        materialCount: selectedMaterialIds.size,
      })
    } catch (error) {
      setSubmitResult({
        kind: 'error',
        message: error.message || 'שגיאה בשליחת בקשות הצעת מחיר',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = useCallback(() => {
    setProjectId('')
    setMaterials([])
    setSelectedMaterialIds(new Set())
    setSelectedSupplierIds(new Set())
    setNotes('')
    setFormAlert(null)
    setSubmitResult(null)
  }, [])

  const startNewRequest = useCallback(() => {
    resetForm()
    navigate('/supplier-quote-request', { replace: true })
  }, [navigate, resetForm])

  const retrySubmit = useCallback(() => {
    setSubmitResult(null)
  }, [])

  if (submitResult) {
    return (
      <SupplierQuoteRequestResultPage
        submitResult={submitResult}
        resultTitleRef={resultTitleRef}
        onNewRequest={startNewRequest}
        onRetry={retrySubmit}
      />
    )
  }

  return (
    <form
      className="supplier-order-form supplier-quote-request-form"
      onSubmit={handleSubmit}
    >
      {isLoadingOptions && (
        <p className="order-doc-loading">טוען אפשרויות...</p>
      )}

      <div className="order-doc">
        <h1 className="order-doc-title">בקשת הצעת מחיר מספקים</h1>

        {formAlert && (
          <div className={`form-alert form-alert-${formAlert.type}`} role="alert">
            {formAlert.message}
          </div>
        )}

        <section className="order-doc-meta">
          <div className="order-doc-meta-row">
            <span className="order-doc-label">תיק ייצור *</span>
            <div className="order-doc-field-inline">
              <SearchableSelect
                id="quote-request-project"
                options={projects}
                value={projectId}
                onChange={setProjectId}
                placeholder="בחר תיק ייצור..."
                disabled={isLoadingOptions || isSubmitting}
                aria-label="תיק ייצור"
              />
            </div>
          </div>
          <div className="order-doc-meta-row">
            <span className="order-doc-label">תאריך</span>
            <input
              type="date"
              className="order-doc-input-inline"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </section>

        <section className="quote-request-section">
          <div className="quote-request-section-head">
            <h2 className="quote-request-section-title">חומרים לבקשה *</h2>
          <p className="quote-request-hint quote-request-hint-inline">
            מוצגים רק חומרים במצב <strong>לא במלאי</strong> לתיק שנבחר.
          </p>
            {materials.length > 0 && (
              <div className="quote-request-section-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={selectAllMaterials}
                  disabled={isSubmitting}
                >
                  בחר הכל
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={clearMaterials}
                  disabled={isSubmitting}
                >
                  נקה
                </button>
              </div>
            )}
          </div>
          {!projectId && (
            <p className="quote-request-hint">בחר תיק ייצור כדי לראות חומרים.</p>
          )}
          {projectId && isLoadingMaterials && (
            <p className="quote-request-hint">טוען חומרים...</p>
          )}
          {projectId && !isLoadingMaterials && materials.length === 0 && (
            <p className="quote-request-hint">
              אין חומרים במצב לא במלאי לתיק זה.
            </p>
          )}
          {materials.length > 0 && (
            <ul className="quote-request-checklist">
              {materials.map((m) => (
                <li key={m.id}>
                  <label className="quote-request-check-label">
                    <input
                      type="checkbox"
                      checked={selectedMaterialIds.has(m.id)}
                      onChange={() => toggleMaterial(m.id)}
                      disabled={isSubmitting}
                    />
                    <span className="quote-request-check-text">{m.label}</span>
                    {m.inStock ? (
                      <span className="quote-request-stock">{m.inStock}</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="quote-request-section">
          <h2 className="quote-request-section-title">ספקים *</h2>
          <p className="quote-request-hint">
            בחר ספק אחד או יותר. לכל ספק ייווצר מסמך PDF ורשומה בטבלת בקשת הצעת מחיר.
          </p>
          <ul className="quote-request-suppliers-list">
            {suppliers.map((s) => {
              const selected = selectedSupplierIds.has(s.id)
              return (
                <li
                  key={s.id}
                  className={`quote-request-supplier-card${selected ? ' selected' : ''}`}
                >
                  <label className="quote-request-supplier-select">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSupplier(s.id)}
                      disabled={isSubmitting}
                    />
                    <span className="quote-request-supplier-name">{s.name}</span>
                  </label>
                  {selected && (
                    <div className="quote-request-contact-fields">
                      <div className="quote-request-contact-row">
                        <label htmlFor={`email-${s.id}`}>מייל</label>
                        <input
                          id={`email-${s.id}`}
                          type="email"
                          className="order-doc-input-inline"
                          value={supplierContacts[s.id]?.email ?? ''}
                          onChange={(e) =>
                            updateSupplierContact(s.id, 'email', e.target.value)
                          }
                          disabled={isSubmitting}
                          dir="ltr"
                        />
                      </div>
                      <div className="quote-request-contact-row">
                        <label htmlFor={`phone-${s.id}`}>טלפון</label>
                        <input
                          id={`phone-${s.id}`}
                          type="tel"
                          className="order-doc-input-inline"
                          value={supplierContacts[s.id]?.phone ?? ''}
                          onChange={(e) =>
                            updateSupplierContact(s.id, 'phone', e.target.value)
                          }
                          disabled={isSubmitting}
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="order-doc-meta">
          <div className="order-doc-meta-row order-doc-notes-row">
            <span className="order-doc-label">הערות למסמך</span>
            <textarea
              className="order-doc-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="הערות שיופיעו במסמך (אופציונלי)"
              disabled={isSubmitting}
            />
          </div>
        </section>

        <div className="order-doc-actions">
          <button
            type="submit"
            className="submit-btn submit-btn-send"
            disabled={isSubmitting || isLoadingOptions}
          >
            {isSubmitting ? 'יוצר מסמכים ורשומות...' : 'שלח בקשות הצעת מחיר'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default SupplierQuoteRequestForm
