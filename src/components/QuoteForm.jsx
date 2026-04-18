import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  fetchQuoteCustomers,
  fetchQuoteContacts,
  fetchQuoteEmployees,
  submitQuote,
} from '../services/airtable'
import SearchableSelect from './SearchableSelect'
import './QuoteForm.css'

const emptyProduct = () => ({ description: '', price: '' })

function pad2(n) {
  return String(n).padStart(2, '0')
}

const QuoteForm = () => {
  const [customers, setCustomers] = useState([])
  const [employees, setEmployees] = useState([])
  const [createdById, setCreatedById] = useState('')
  const [contacts, setContacts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [contactId, setContactId] = useState('')
  const [description, setDescription] = useState('')
  const [transportingAdditionals, setTransportingAdditionals] = useState('')
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [products, setProducts] = useState([emptyProduct()])
  const [paymentConditions, setPaymentConditions] = useState('')
  const [paymentDeadline, setPaymentDeadline] = useState('')
  const [sketchDeliverDeadline, setSketchDeliverDeadline] = useState('')
  const [projectDeadline, setProjectDeadline] = useState('')
  const [deliveryToClientBy, setDeliveryToClientBy] = useState('')
  const [sendToClient, setSendToClient] = useState(false)
  const [sendToClientEmailAdditions, setSendToClientEmailAdditions] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** Fetch / client-side validation banner on the form (not the post-submit page). */
  const [formAlert, setFormAlert] = useState(null)
  /** After API response: full-page success or error. */
  const [submitResult, setSubmitResult] = useState(null)
  const resultTitleRef = useRef(null)

  useLayoutEffect(() => {
    if (!submitResult) return

    const scrollToTopHard = () => {
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      const root = document.getElementById('root')
      if (root) root.scrollTop = 0
    }

    scrollToTopHard()
    requestAnimationFrame(() => {
      scrollToTopHard()
      void document.body.offsetHeight
    })
    resultTitleRef.current?.focus({ preventScroll: true })
  }, [submitResult])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadingOptions(true)
        const [customerList, employeeList] = await Promise.all([
          fetchQuoteCustomers(),
          fetchQuoteEmployees(),
        ])
        if (!cancelled) {
          setCustomers(customerList)
          setEmployees(employeeList)
        }
      } catch (e) {
        if (!cancelled) {
          setFormAlert({ type: 'error', message: e.message })
        }
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!customerId) {
      setContacts([])
      setContactId('')
      setEmail('')
      setPhone('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setLoadingContacts(true)
        const list = await fetchQuoteContacts(customerId)
        if (!cancelled) {
          setContacts(list)
          setContactId('')
          setEmail('')
          setPhone('')
        }
      } catch (e) {
        if (!cancelled) setFormAlert({ type: 'error', message: e.message })
      } finally {
        if (!cancelled) setLoadingContacts(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [customerId])

  const selectedContact = contacts.find((c) => c.id === contactId)
  const selectedCustomer = customers.find((c) => c.id === customerId)
  const selectedEmployee = employees.find((e) => e.id === createdById)

  useEffect(() => {
    if (selectedContact) {
      setEmail(selectedContact.email || '')
      setPhone(selectedContact.phone || '')
    } else {
      setEmail('')
      setPhone('')
    }
  }, [selectedContact])

  const totals = useMemo(() => {
    let sum = 0
    for (const p of products) {
      const n = parseFloat(String(p.price).replace(',', '.'))
      if (!Number.isNaN(n)) sum += n
    }
    const tax = Math.round(sum * 0.18 * 100) / 100
    const total = Math.round((sum + tax) * 100) / 100
    return { price: sum, tax_price: tax, total_with_tax: total }
  }, [products])

  const addProduct = () => setProducts((prev) => [...prev, emptyProduct()])
  const removeProduct = (index) => {
    if (products.length <= 1) return
    setProducts((prev) => prev.filter((_, i) => i !== index))
  }
  const updateProduct = (index, field, value) => {
    setProducts((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const resetFormForNewQuote = () => {
    setCreatedById('')
    setCustomerId('')
    setContactId('')
    setContacts([])
    setDescription('')
    setTransportingAdditionals('')
    setNotes('')
    setInternalNotes('')
    setProducts([emptyProduct()])
    setPaymentConditions('')
    setPaymentDeadline('')
    setSketchDeliverDeadline('')
    setProjectDeadline('')
    setDeliveryToClientBy('')
    setSendToClient(false)
    setSendToClientEmailAdditions('')
    setEmail('')
    setPhone('')
    setFormAlert(null)
    setSubmitResult(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormAlert(null)
    if (!createdById) {
      setFormAlert({ type: 'error', message: 'יש לבחור יוצר הצעה (עובד)' })
      return
    }
    if (!customerId) {
      setFormAlert({ type: 'error', message: 'יש לבחור לקוח' })
      return
    }
    if (!contactId) {
      setFormAlert({ type: 'error', message: 'יש לבחור איש קשר' })
      return
    }

    const now = new Date()
    const created_at = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
    const hour = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`

    const productLines = products.map((p) => ({
      description: p.description || '',
      price:
        p.price === '' || p.price == null
          ? 0
          : Number(parseFloat(String(p.price).replace(',', '.'))) || 0,
    }))

    const payload = {
      description,
      created_by: [createdById],
      customer: [customerId],
      customer_name: selectedCustomer?.name || '',
      contact: [contactId],
      contact_name: selectedContact?.name || '',
      created_by_name: selectedEmployee?.name || '',
      transporting_additionals: transportingAdditionals,
      notes,
      internal_notes: internalNotes,
      products: productLines,
      price: totals.price,
      tax_price: totals.tax_price,
      total_with_tax: totals.total_with_tax,
      payment_conditions: paymentConditions,
      payment_deadline: paymentDeadline || '',
      sketch_deliver_deadline: sketchDeliverDeadline || '',
      project_deadline: projectDeadline || '',
      delivery_to_client_by: deliveryToClientBy,
      send_to_client: sendToClient,
      send_to_client_email_additions: sendToClientEmailAdditions,
      created_at,
      hour,
      email,
      phone,
    }

    try {
      setSubmitting(true)
      const res = await submitQuote(payload)
      const n8nWarning =
        res.n8n_called === false
          ? null
          : res.n8n_ok === false
            ? 'שליחה ל-n8n נכשלה'
            : null
      setSubmitResult({
        kind: 'success',
        quote_reference: res.quote_reference || '',
        quote_record_id: res.quote_record_id || '',
        airtable_record_url: res.airtable_record_url || '',
        n8n_called: res.n8n_called,
        n8n_ok: res.n8n_ok,
        n8n_error: res.n8n_error,
        n8nWarning,
      })
    } catch (err) {
      setSubmitResult({ kind: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingOptions) {
    return (
      <div className="quote-form-loading">טוען לקוחות…</div>
    )
  }

  if (submitResult) {
    const ok = submitResult.kind === 'success'
    const airtableUrl =
      ok && submitResult.airtable_record_url
        ? String(submitResult.airtable_record_url).trim()
        : ''

    const openAirtableRecord = () => {
      if (!airtableUrl) return
      // Always open in a new tab; do not navigate current tab as fallback.
      window.open(airtableUrl, '_blank', 'noopener,noreferrer')
    }

    return (
      <div className="quote-result-page">
        <div className={`quote-result-card ${ok ? 'success' : 'error'}`}>
          <div className="quote-result-announce">
            <h1
              ref={resultTitleRef}
              className="quote-result-title"
              tabIndex={-1}
            >
              {ok ? 'ההצעה נשמרה בהצלחה' : 'השמירה נכשלה'}
            </h1>
            {ok ? (
              <>
                <p className="quote-result-lead">
                  מספר הצעה:{' '}
                  <strong className="quote-result-ref">
                    {submitResult.quote_reference || submitResult.quote_record_id || '—'}
                  </strong>
                </p>
                {submitResult.quote_record_id && (
                  <p className="quote-result-meta">
                    מזהה רשומה: <span dir="ltr">{submitResult.quote_record_id}</span>
                  </p>
                )}
                {submitResult.airtable_record_url ? (
                  <p className="quote-result-hint">
                    ניתן להוסיף <strong>מסמכים נוספים</strong> ו<strong>חוזה לקוח</strong>{' '}
                    במסך הרשומה ב-Airtable — לחצו על הכפתור למטה לפתיחה.
                  </p>
                ) : null}
                {submitResult.n8nWarning && (
                  <p className="quote-result-warning" role="alert">
                    אזהרה: {submitResult.n8nWarning}
                    {submitResult.n8n_error
                      ? ` (${String(submitResult.n8n_error)})`
                      : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="quote-result-error-msg">{submitResult.message}</p>
            )}
          </div>
          <div className="quote-result-actions">
            {ok && airtableUrl ? (
              <button
                type="button"
                className="quote-result-airtable-btn"
                onClick={openAirtableRecord}
              >
                פתח את הרשומה ב-Airtable
              </button>
            ) : null}
            <button
              type="button"
              className="quote-submit-btn"
              onClick={resetFormForNewQuote}
            >
              מילוי הצעה נוספת
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="quote-form">
      <form className="quote-doc" onSubmit={handleSubmit}>
        <h1 className="quote-doc-title">טופס הצעת מחיר</h1>

        {formAlert && (
          <div
            className={
              formAlert.type === 'error' ? 'quote-form-alert error' : 'quote-form-alert success'
            }
            role="alert"
          >
            {formAlert.message}
          </div>
        )}

        <div className="quote-doc-meta">
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">נוצר על ידי</span>
            <div className="quote-doc-field-inline">
              <SearchableSelect
                options={employees}
                value={createdById}
                onChange={(id) => setCreatedById(id)}
                placeholder="בחר עובד…"
                aria-label="נוצר על ידי"
              />
            </div>
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">לקוח</span>
            <div className="quote-doc-field-inline">
              <SearchableSelect
                options={customers}
                value={customerId}
                onChange={(id) => setCustomerId(id)}
                placeholder="בחר לקוח…"
                aria-label="לקוח"
              />
            </div>
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">איש קשר</span>
            <div className="quote-doc-field-inline">
              <SearchableSelect
                options={contacts.map((c) => ({ id: c.id, name: c.name }))}
                value={contactId}
                onChange={(id) => setContactId(id)}
                placeholder={
                  loadingContacts
                    ? 'טוען…'
                    : customerId
                      ? 'בחר איש קשר…'
                      : 'בחר קודם לקוח'
                }
                disabled={!customerId || loadingContacts}
                aria-label="איש קשר"
              />
            </div>
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">אימייל</span>
            <input
              className="quote-doc-input-inline"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              placeholder="נמלא אוטומטית מאיש הקשר — ניתן לערוך"
            />
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">טלפון</span>
            <input
              className="quote-doc-input-inline"
              type="text"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              placeholder="נמלא אוטומטית מאיש הקשר — ניתן לערוך"
            />
          </div>

          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">תיאור כללי</span>
            <textarea
              className="quote-doc-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">הובלה ותוספות</span>
            <textarea
              className="quote-doc-textarea"
              rows={2}
              value={transportingAdditionals}
              onChange={(e) => setTransportingAdditionals(e.target.value)}
            />
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">הערות</span>
            <textarea
              className="quote-doc-textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <section className="quote-internal-section" aria-labelledby="quote-internal-heading">
          <h2 id="quote-internal-heading" className="quote-section-title quote-section-title-internal">
            שימוש פנימי בחברה
          </h2>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">הערות פנימיות</span>
            <textarea
              className="quote-doc-textarea"
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </div>
        </section>

        <section className="quote-products-section">
          <h2 className="quote-section-title">תוצרים</h2>
          <table className="quote-products-table">
            <thead>
              <tr>
                <th>תיאור</th>
                <th>מחיר</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {products.map((row, index) => (
                <tr key={index}>
                  <td>
                    <textarea
                      className="quote-product-desc"
                      rows={2}
                      value={row.description}
                      onChange={(e) =>
                        updateProduct(index, 'description', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="quote-product-price"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={row.price}
                      onChange={(e) =>
                        updateProduct(index, 'price', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="quote-btn-remove"
                      onClick={() => removeProduct(index)}
                      disabled={products.length <= 1}
                    >
                      הסר
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="quote-btn-add" onClick={addProduct}>
            + הוסף תוצר
          </button>

          <div className="quote-totals">
            <div className="quote-total-row">
              <span>סה״כ לפני מע״מ</span>
              <strong>{totals.price.toLocaleString('he-IL')}</strong>
            </div>
            <div className="quote-total-row">
              <span>מע״מ (18%)</span>
              <strong>{totals.tax_price.toLocaleString('he-IL')}</strong>
            </div>
            <div className="quote-total-row quote-total-final">
              <span>סה״כ כולל מע״מ</span>
              <strong>{totals.total_with_tax.toLocaleString('he-IL')}</strong>
            </div>
          </div>
        </section>

        <div className="quote-doc-meta">
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">תנאי תשלום</span>
            <textarea
              className="quote-doc-textarea"
              rows={2}
              value={paymentConditions}
              onChange={(e) => setPaymentConditions(e.target.value)}
            />
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">מועד תשלום</span>
            <input
              className="quote-doc-input-inline"
              type="date"
              value={paymentDeadline}
              onChange={(e) => setPaymentDeadline(e.target.value)}
            />
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">מועד מסירת סקיצה</span>
            <input
              className="quote-doc-input-inline"
              type="date"
              value={sketchDeliverDeadline}
              onChange={(e) => setSketchDeliverDeadline(e.target.value)}
            />
          </div>
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">מועד מסירת פרויקט</span>
            <input
              className="quote-doc-input-inline"
              type="date"
              value={projectDeadline}
              onChange={(e) => setProjectDeadline(e.target.value)}
            />
          </div>
          <div className="quote-doc-meta-row quote-delivery-row">
            <span className="quote-doc-label">הובלה ללקוח</span>
            <div className="quote-delivery-options" role="group" aria-label="הובלה ללקוח">
              <label className="quote-radio-label">
                <input
                  type="radio"
                  name="delivery_to_client"
                  value="company"
                  checked={deliveryToClientBy === 'company'}
                  onChange={() => setDeliveryToClientBy('company')}
                />
                <span>ע״י החברה</span>
              </label>
              <label className="quote-radio-label">
                <input
                  type="radio"
                  name="delivery_to_client"
                  value="client"
                  checked={deliveryToClientBy === 'client'}
                  onChange={() => setDeliveryToClientBy('client')}
                />
                <span>ע״י הלקוח</span>
              </label>
              <button
                type="button"
                className="quote-delivery-clear"
                onClick={() => setDeliveryToClientBy('')}
              >
                נקה בחירה
              </button>
            </div>
          </div>
        </div>

        <section
          className="quote-post-actions-section"
          aria-labelledby="quote-post-actions-heading"
        >
          <h2 id="quote-post-actions-heading" className="quote-section-title">
            פעולות לאחר יצירת מסמך
          </h2>
          <p className="quote-post-actions-intro">
            סמן אם לשלוח את ההצעה ללקוח לאחר השמירה, והוסף טקסט שיופיע בגוף המייל (אופציונלי).
          </p>
          <div className="quote-doc-meta">
            <div className="quote-doc-meta-row quote-checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={sendToClient}
                  onChange={(e) => setSendToClient(e.target.checked)}
                />
                <span className="quote-doc-label inline">שליחה ללקוח</span>
              </label>
            </div>
            <div className="quote-doc-meta-row">
              <span className="quote-doc-label">תוספות לגוף המייל</span>
              <textarea
                className="quote-doc-textarea"
                rows={4}
                value={sendToClientEmailAdditions}
                onChange={(e) => setSendToClientEmailAdditions(e.target.value)}
                placeholder="טקסט שיישלח בגוף המייל ללקוח כשהאפשרות שלמעלה מסומנת"
              />
            </div>
          </div>
        </section>

        <div className="quote-form-actions">
          <button
            type="submit"
            className="quote-submit-btn"
            disabled={submitting}
          >
            {submitting ? 'שולח…' : 'שמור הצעת מחיר'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default QuoteForm
