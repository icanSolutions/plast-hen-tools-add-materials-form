import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  fetchQuoteCustomers,
  fetchQuoteContacts,
  fetchQuoteEmployees,
  fetchQuoteNextReferencePreview,
  submitQuote,
} from '../services/airtable'
import SearchableSelect from './SearchableSelect'
import './QuoteForm.css'

const emptyProduct = () => ({ description: '', price: '' })

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Builds Airtable text like "10 ימים" / "3 חודשים" (empty if no positive integer). */
function formatOffsetDeadlineString(amountStr, unit) {
  const raw = String(amountStr ?? '').trim()
  if (raw === '') return ''
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return ''
  return unit === 'months' ? `${n} חודשים` : `${n} ימים`
}

const CLIENT_SUPPLY_NOTE = 'אספקה בשער מפעלינו ע״י המזמין'

function notesWithClientSupplyLine(baseNotes, deliveryByClient) {
  const base = String(baseNotes ?? '')
  if (!deliveryByClient) return base
  if (base.includes(CLIENT_SUPPLY_NOTE)) return base
  const trimmed = base.trimEnd()
  return trimmed ? `${trimmed}\n${CLIENT_SUPPLY_NOTE}` : CLIENT_SUPPLY_NOTE
}

/** Single Airtable text field when הובלה ע״י החברה — הובלה, תוספות, מחיר לפני מע״מ. */
function buildTransportingAdditionalsPayload(
  deliveryBy,
  transportLine,
  extrasLine,
  transportPriceBeforeTax
) {
  if (deliveryBy !== 'company') return ''
  const t = String(transportLine ?? '').trim()
  const e = String(extrasLine ?? '').trim()
  const parts = []
  if (t) parts.push(`הובלה: ${t}`)
  if (e) parts.push(`תוספות: ${e}`)
  if (transportPriceBeforeTax > 0) {
    parts.push(
      `מחיר הובלה (לפני מע״מ): ${transportPriceBeforeTax.toLocaleString('he-IL')}`
    )
  }
  return parts.join('\n')
}

function parseMoneyInput(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function emailDocumentShell(innerTdHtml) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
</head>

<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f6f6f6;direction:rtl;">

<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6f6;padding:20px;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:6px;padding:30px;text-align:right;line-height:1.6;color:#333;">

<tr>
<td style="font-size:16px;">
${innerTdHtml}
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>`
}

function escapeHtmlForEmailPreview(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function nlToBrEscaped(s) {
  return escapeHtmlForEmailPreview(s).replace(/\r\n|\r|\n/g, '<br>')
}

/**
 * Replaces common n8n Webhook body expressions with current form values for a client-safe preview.
 * Unknown `{{ ... }}` blocks are stripped to a muted placeholder.
 */
function substituteEmailPreviewPlaceholders(html, v) {
  let out = html
  const sub = (re, replacement) => {
    out = out.replace(re, replacement)
  }

  sub(
    /\{\{\s*\$\(['"]Webhook['"]\)\.item\.json\.body\.contact\s*\}\}/g,
    escapeHtmlForEmailPreview(v.contact)
  )
  sub(
    /\{\{\s*\$\(['"]Webhook['"]\)\.item\.json\.body\.quote_ref\s*\}\}/g,
    escapeHtmlForEmailPreview(v.quoteRef)
  )
  sub(
    /\{\{\s*\$\(['"]Webhook['"]\)\.item\.json\.body\.quote_reference\s*\}\}/g,
    escapeHtmlForEmailPreview(v.quoteRef)
  )
  sub(
    /\{\{\s*\$\(['"]Webhook['"]\)\.item\.json\.body\.description\s*\}\}/g,
    nlToBrEscaped(v.description)
  )
  sub(
    /\{\{\s*\$\(['"]Webhook['"]\)\.item\.json\.body\.created_by\s*\|\|\s*""\s*\}\}/gi,
    escapeHtmlForEmailPreview(v.createdBy)
  )
  sub(
    /\{\{\s*\$\(['"]Webhook['"]\)\.item\.json\.body\.created_by\s*\}\}/g,
    escapeHtmlForEmailPreview(v.createdBy)
  )

  out = out.replace(
    /\{\{[\s\S]*?\}\}/g,
    '<span style="opacity:0.45;font-size:0.9em;">[…]</span>'
  )
  return out
}

/** Loads substituted preview HTML into an iframe and enables designMode for WYSIWYG edits. */
function writeEmailPreviewEditableIframe(iframe, html, dirtyRef) {
  if (!iframe) return
  const doc = iframe.contentDocument
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()
  try {
    doc.designMode = 'on'
  } catch {
    /* ignore */
  }
  const markDirty = () => {
    if (dirtyRef) dirtyRef.current = true
  }
  doc.addEventListener('input', markDirty)
  doc.addEventListener('keyup', markDirty)
}

const FORMAL_EMAIL_INNER_HTML = `<p>
שלום {{ $('Webhook').item.json.body.contact }},
</p>

<p>
בהמשך לפנייתך, מצורפת הצעת מחיר מס'
<strong>{{ $('Webhook').item.json.body.quote_ref }}</strong>
עבור
<strong>{{ $('Webhook').item.json.body.description }}</strong>.
</p>

<p>
ההצעה הוכנה בהתאם לנתונים שנמסרו לנו וכוללת את פירוט המוצרים, המפרט הטכני והתמחור המלא.
</p>

<p>
נשמח לעמוד לרשותך לכל שאלה מקצועית, התאמות נדרשות או הבהרות נוספות.<br>
במידה ונדרש עדכון למפרט או לכמויות, ניתן לחזור אלינו במייל חוזר או בטלפון.
</p>

<p>
אנו בפלסט-חן מקפידים על ייצור איכותי בהתאם לדרישות התעשייה ולסטנדרטים מחמירים,
ומתחייבים לליווי מקצועי לאורך כל תהליך ההזמנה והאספקה.
</p>

<p>
נשמח להמשך שיתוף פעולה.
</p>

<br>

<p>
בברכה,<br>
<strong>{{ $('Webhook').item.json.body.created_by ||""}}</strong><br>
פלסטחן – פתרונות מיכלי פלסטיק לתעשייה
</p>`

const SHORT_EMAIL_INNER_HTML = `<p>
שלום {{ $('Webhook').item.json.body.contact }},
</p>

<p>
מצורפת הצעת מחיר מס'
<strong>{{ $('Webhook').item.json.body.quote_ref }}</strong>
עבור
<strong>{{ $('Webhook').item.json.body.description }}</strong>.
</p>

<p>
לשאלות והבהרות — נשמח לעזור במייל או בטלפון.
</p>

<p>
בברכה,<br>
<strong>{{ $('Webhook').item.json.body.created_by ||""}}</strong><br>
פלסטחן – פתרונות מיכלי פלסטיק לתעשייה
</p>`

function emailInnerForTemplate(template) {
  if (template === 'short') return SHORT_EMAIL_INNER_HTML.trim()
  if (template === 'custom') return FORMAL_EMAIL_INNER_HTML.trim()
  return FORMAL_EMAIL_INNER_HTML.trim()
}

function buildClientEmailBodyHtml(template) {
  return emailDocumentShell(emailInnerForTemplate(template))
}

const QuoteForm = () => {
  const [customers, setCustomers] = useState([])
  const [employees, setEmployees] = useState([])
  const [createdById, setCreatedById] = useState('')
  const [contacts, setContacts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [contactId, setContactId] = useState('')
  const [isNewContact, setIsNewContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [description, setDescription] = useState('')
  const [companyTransportLine, setCompanyTransportLine] = useState('')
  const [companyTransportExtras, setCompanyTransportExtras] = useState('')
  const [companyTransportPrice, setCompanyTransportPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [products, setProducts] = useState([emptyProduct()])
  const [paymentConditions, setPaymentConditions] = useState('')
  const [sketchDeadlineAmount, setSketchDeadlineAmount] = useState('')
  const [sketchDeadlineUnit, setSketchDeadlineUnit] = useState('days')
  const [projectDeadlineAmount, setProjectDeadlineAmount] = useState('')
  const [projectDeadlineUnit, setProjectDeadlineUnit] = useState('days')
  const [deliveryToClientBy, setDeliveryToClientBy] = useState('')
  const [sendToClient, setSendToClient] = useState(false)
  const [clientEmailBodyTemplate, setClientEmailBodyTemplate] = useState('formal')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** Fetch / client-side validation banner on the form (not the post-submit page). */
  const [formAlert, setFormAlert] = useState(null)
  /** After API response: full-page success or error. */
  const [submitResult, setSubmitResult] = useState(null)
  /** Shown on the form only — server decides final ref after create (formula / sorted prediction). */
  const [previewQuoteReference, setPreviewQuoteReference] = useState('')
  const resultTitleRef = useRef(null)
  const emailPreviewIframeRef = useRef(null)
  const emailPreviewDirtyRef = useRef(false)

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
    if (loadingOptions || submitResult) return
    let cancelled = false
    ;(async () => {
      const ref = await fetchQuoteNextReferencePreview()
      if (!cancelled) setPreviewQuoteReference(ref)
    })()
    return () => {
      cancelled = true
    }
  }, [loadingOptions, submitResult])

  useEffect(() => {
    if (!customerId) {
      setContacts([])
      setContactId('')
      setIsNewContact(false)
      setNewContactName('')
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
          setIsNewContact(false)
          setNewContactName('')
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

  const previewContactName = isNewContact
    ? newContactName.trim()
    : (selectedContact?.name || '').trim()

  const mergedClientEmailBodyHtml = useMemo(
    () => buildClientEmailBodyHtml(clientEmailBodyTemplate),
    [clientEmailBodyTemplate]
  )

  const clientEmailPreviewHtml = useMemo(
    () =>
      substituteEmailPreviewPlaceholders(mergedClientEmailBodyHtml, {
        contact: previewContactName || '—',
        quoteRef: (previewQuoteReference || '').trim() || '—',
        description,
        createdBy: (selectedEmployee?.name || '').trim(),
      }),
    [
      mergedClientEmailBodyHtml,
      previewContactName,
      previewQuoteReference,
      description,
      selectedEmployee?.name,
    ]
  )

  useEffect(() => {
    emailPreviewDirtyRef.current = false
  }, [clientEmailBodyTemplate])

  useEffect(() => {
    if (emailPreviewDirtyRef.current) return
    writeEmailPreviewEditableIframe(
      emailPreviewIframeRef.current,
      clientEmailPreviewHtml,
      emailPreviewDirtyRef
    )
  }, [clientEmailPreviewHtml, clientEmailBodyTemplate])

  useEffect(() => {
    if (isNewContact) return
    if (selectedContact) {
      setEmail(selectedContact.email || '')
      setPhone(selectedContact.phone || '')
    } else {
      setEmail('')
      setPhone('')
    }
  }, [selectedContact, isNewContact])

  const transportCompanyAmount = useMemo(() => {
    if (deliveryToClientBy !== 'company') return 0
    return parseMoneyInput(companyTransportPrice)
  }, [deliveryToClientBy, companyTransportPrice])

  const totals = useMemo(() => {
    let productsSum = 0
    for (const p of products) {
      const n = parseFloat(String(p.price).replace(',', '.'))
      if (!Number.isNaN(n)) productsSum += n
    }
    const price = productsSum + transportCompanyAmount
    const tax = Math.round(price * 0.18 * 100) / 100
    const total = Math.round((price + tax) * 100) / 100
    return {
      productsSum,
      transportCompanyAmount,
      price,
      tax_price: tax,
      total_with_tax: total,
    }
  }, [products, transportCompanyAmount])

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
    setIsNewContact(false)
    setNewContactName('')
    setContacts([])
    setDescription('')
    setCompanyTransportLine('')
    setCompanyTransportExtras('')
    setCompanyTransportPrice('')
    setNotes('')
    setInternalNotes('')
    setProducts([emptyProduct()])
    setPaymentConditions('')
    setSketchDeadlineAmount('')
    setSketchDeadlineUnit('days')
    setProjectDeadlineAmount('')
    setProjectDeadlineUnit('days')
    setDeliveryToClientBy('')
    setSendToClient(false)
    setClientEmailBodyTemplate('formal')
    emailPreviewDirtyRef.current = false
    setEmail('')
    setPhone('')
    setFormAlert(null)
    setSubmitResult(null)
    setPreviewQuoteReference('')
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
    if (!isNewContact && !contactId) {
      setFormAlert({ type: 'error', message: 'יש לבחור איש קשר או ליצור איש קשר חדש' })
      return
    }
    if (isNewContact && !newContactName.trim()) {
      setFormAlert({ type: 'error', message: 'יש להזין שם לאיש הקשר החדש' })
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

    const transportAmtSubmit =
      deliveryToClientBy === 'company' ? parseMoneyInput(companyTransportPrice) : 0
    const transporting_additionals = buildTransportingAdditionalsPayload(
      deliveryToClientBy,
      companyTransportLine,
      companyTransportExtras,
      transportAmtSubmit
    )
    const notesOut = notesWithClientSupplyLine(notes, deliveryToClientBy === 'client')

    const iframeDoc = emailPreviewIframeRef.current?.contentDocument
    const client_email_body_html =
      emailPreviewDirtyRef.current && iframeDoc?.documentElement
        ? iframeDoc.documentElement.outerHTML
        : mergedClientEmailBodyHtml

    const payload = {
      description,
      created_by: [createdById],
      customer: [customerId],
      customer_name: selectedCustomer?.name || '',
      ...(isNewContact
        ? {
            new_contact: {
              name: newContactName.trim(),
              email,
              phone,
            },
          }
        : {
            contact: [contactId],
            contact_name: selectedContact?.name || '',
          }),
      created_by_name: selectedEmployee?.name || '',
      transporting_additionals,
      notes: notesOut,
      internal_notes: internalNotes,
      products: productLines,
      price: totals.price,
      tax_price: totals.tax_price,
      total_with_tax: totals.total_with_tax,
      payment_conditions: paymentConditions,
      sketch_deliver_deadline: formatOffsetDeadlineString(
        sketchDeadlineAmount,
        sketchDeadlineUnit
      ),
      project_deadline: formatOffsetDeadlineString(
        projectDeadlineAmount,
        projectDeadlineUnit
      ),
      delivery_to_client_by: deliveryToClientBy,
      send_to_client: sendToClient,
      client_email_body_template: clientEmailBodyTemplate,
      client_email_body_html,
      send_to_client_email_additions: '',
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
                    {String(submitResult.quote_reference || '')
                      .trim() || '—'}
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
        {previewQuoteReference ? (
          <p className="quote-doc-preview-ref" dir="ltr">
            מספר הצעה צפוי (משוער): <strong>{previewQuoteReference}</strong>
          </p>
        ) : null}

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
              {!isNewContact ? (
                <SearchableSelect
                  options={contacts.map((c) => ({ id: c.id, name: c.name }))}
                  value={contactId}
                  onChange={(id) => {
                    setIsNewContact(false)
                    setNewContactName('')
                    setContactId(id)
                  }}
                  allowCreateNew
                  onCreateNew={(name) => {
                    setIsNewContact(true)
                    setNewContactName(name)
                    setContactId('')
                  }}
                  placeholder={
                    loadingContacts
                      ? 'טוען…'
                      : customerId
                        ? 'בחר או הקלד שם — איש קשר חדש…'
                        : 'בחר קודם לקוח'
                  }
                  disabled={!customerId || loadingContacts}
                  aria-label="איש קשר"
                />
              ) : (
                <div className="quote-new-contact-wrap">
                  <input
                    className="quote-doc-input-inline quote-new-contact-name"
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="שם איש קשר חדש"
                    aria-label="שם איש קשר חדש"
                  />
                  <button
                    type="button"
                    className="quote-new-contact-back"
                    onClick={() => {
                      setIsNewContact(false)
                      setNewContactName('')
                    }}
                  >
                    בחר מרשימה
                  </button>
                </div>
              )}
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
        </div>

        <div className="quote-doc-meta">
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
          {deliveryToClientBy === 'company' ? (
            <div
              className="quote-company-transport-block"
              role="region"
              aria-label="הובלה ותוספות — ע״י החברה"
            >
              <p className="quote-company-transport-intro">
                פירוט הובלה ותוספות (נכלל במחיר לפני מע״מ)
              </p>
              <div className="quote-doc-meta-row">
                <span className="quote-doc-label">הובלה</span>
                <textarea
                  className="quote-doc-textarea"
                  rows={2}
                  value={companyTransportLine}
                  onChange={(e) => setCompanyTransportLine(e.target.value)}
                  placeholder="תיאור / פירוט הובלה"
                />
              </div>
              <div className="quote-doc-meta-row">
                <span className="quote-doc-label">תוספות</span>
                <textarea
                  className="quote-doc-textarea"
                  rows={2}
                  value={companyTransportExtras}
                  onChange={(e) => setCompanyTransportExtras(e.target.value)}
                />
              </div>
              <div className="quote-doc-meta-row">
                <span className="quote-doc-label">מחיר (לפני מע״מ)</span>
                <input
                  className="quote-doc-input-inline quote-company-transport-price"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={companyTransportPrice}
                  onChange={(e) => setCompanyTransportPrice(e.target.value)}
                  dir="ltr"
                  placeholder="0"
                  aria-label="מחיר הובלה לפני מע״מ"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="quote-doc-meta">
          <div className="quote-doc-meta-row quote-deadline-offset-row">
            <span className="quote-doc-label">סקיצה — תוך</span>
            <div className="quote-deadline-offset">
              <input
                className="quote-deadline-num"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={sketchDeadlineAmount}
                onChange={(e) => setSketchDeadlineAmount(e.target.value)}
                placeholder="מספר"
                aria-label="מספר ימים או חודשים למסירת סקיצה"
              />
              <select
                className="quote-deadline-unit"
                value={sketchDeadlineUnit}
                onChange={(e) => setSketchDeadlineUnit(e.target.value)}
                aria-label="יחידת זמן למסירת סקיצה"
              >
                <option value="days">ימים</option>
                <option value="months">חודשים</option>
              </select>
            </div>
            <p className="quote-deadline-hint">
              נשמר כטקסט ב-Airtable (למשל «10 ימים»). התאריך הסופי יחושב במערכת.
            </p>
          </div>
          <div className="quote-doc-meta-row quote-deadline-offset-row">
            <span className="quote-doc-label">פרויקט — תוך</span>
            <div className="quote-deadline-offset">
              <input
                className="quote-deadline-num"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={projectDeadlineAmount}
                onChange={(e) => setProjectDeadlineAmount(e.target.value)}
                placeholder="מספר"
                aria-label="מספר ימים או חודשים למסירת פרויקט"
              />
              <select
                className="quote-deadline-unit"
                value={projectDeadlineUnit}
                onChange={(e) => setProjectDeadlineUnit(e.target.value)}
                aria-label="יחידת זמן למסירת פרויקט"
              >
                <option value="days">ימים</option>
                <option value="months">חודשים</option>
              </select>
            </div>
            <p className="quote-deadline-hint">
              נשמר כטקסט ב-Airtable (למשל «3 חודשים»). התאריך הסופי יחושב במערכת.
            </p>
          </div>
        </div>

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
        </section>

        <section
          className="quote-products-section quote-price-calc-section"
          aria-labelledby="quote-price-calc-heading"
        >
          <h2 id="quote-price-calc-heading" className="quote-section-title">
            חישוב מחיר
          </h2>
          <div className="quote-totals">
            {transportCompanyAmount > 0 ? (
              <>
                <div className="quote-total-row quote-total-sub">
                  <span>סה״כ תוצרים</span>
                  <strong>{totals.productsSum.toLocaleString('he-IL')}</strong>
                </div>
                <div className="quote-total-row quote-total-sub">
                  <span>הובלה (ע״י החברה)</span>
                  <strong>{transportCompanyAmount.toLocaleString('he-IL')}</strong>
                </div>
              </>
            ) : null}
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
            <span className="quote-doc-label">הערות</span>
            <textarea
              className="quote-doc-textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {deliveryToClientBy === 'client' ? (
              <p className="quote-field-note">
                בשמירה יתווסף אוטומטית: «{CLIENT_SUPPLY_NOTE}»
              </p>
            ) : null}
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

        <div className="quote-doc-meta">
          <div className="quote-doc-meta-row">
            <span className="quote-doc-label">תנאי תשלום</span>
            <div className="quote-doc-field-stack">
              <textarea
                className="quote-doc-textarea"
                rows={2}
                value={paymentConditions}
                onChange={(e) => setPaymentConditions(e.target.value)}
                autoComplete="off"
              />
              <p className="quote-field-note">
                תיאור תנאים בטקסט בלבד — אין כאן שדה תאריך לתשלום.
              </p>
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
            סמן אם לשלוח את ההצעה ללקוח לאחר השמירה. ניתן לבחור סוג תבנית לגוף המייל ולהוסיף טקסט
            משלים (אופציונלי).
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
            <div className="quote-doc-meta-row quote-delivery-row">
              <span className="quote-doc-label">תבנית גוף המייל</span>
              <div
                className="quote-delivery-options"
                role="radiogroup"
                aria-label="תבנית גוף המייל"
              >
                <label className="quote-radio-label">
                  <input
                    type="radio"
                    name="client_email_body_template"
                    value="formal"
                    checked={clientEmailBodyTemplate === 'formal'}
                    onChange={() => setClientEmailBodyTemplate('formal')}
                  />
                  <span>רשמי</span>
                </label>
                <label className="quote-radio-label">
                  <input
                    type="radio"
                    name="client_email_body_template"
                    value="short"
                    checked={clientEmailBodyTemplate === 'short'}
                    onChange={() => setClientEmailBodyTemplate('short')}
                  />
                  <span>קצר</span>
                </label>
                <label className="quote-radio-label">
                  <input
                    type="radio"
                    name="client_email_body_template"
                    value="custom"
                    checked={clientEmailBodyTemplate === 'custom'}
                    onChange={() => setClientEmailBodyTemplate('custom')}
                  />
                  <span>התאמה אישית</span>
                </label>
              </div>
            </div>
            <p className="quote-email-preview-note">
              הטקסט ניתן לעריכה.{' '}
              <button
                type="button"
                className="quote-email-resync-btn"
                onClick={() => {
                  emailPreviewDirtyRef.current = false
                  writeEmailPreviewEditableIframe(
                    emailPreviewIframeRef.current,
                    clientEmailPreviewHtml,
                    emailPreviewDirtyRef
                  )
                }}
              >
                סנכרון מחדש מהטופס
              </button>
            </p>
            <div className="quote-doc-meta-row quote-email-rendered-row">
              <span className="quote-doc-label">תצוגת מייל</span>
              <div className="quote-email-client-preview-wrap">
                <iframe
                  ref={emailPreviewIframeRef}
                  title="תצוגת מייל ללקוח"
                  className="quote-email-client-preview-frame"
                  sandbox="allow-same-origin"
                />
              </div>
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
