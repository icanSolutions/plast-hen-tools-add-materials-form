import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createRecords, fetchProductionProjects } from '../services/airtable'
import SearchableSelect from './SearchableSelect'
import './MultiRecordForm.css'
import './QuoteForm.css'

const IN_STOCK_OPTIONS = [
  { value: 'במלאי', label: 'במלאי' },
  { value: 'לא במלאי', label: 'לא במלאי' },
  { value: 'הוזמן טלפונית', label: 'הוזמן טלפונית' },
]

const emptyRecord = () => ({
  productionProject: '',
  materialName: '',
  size: '',
  quantity: '',
  inStock: '',
  notes: '',
})

function airtableRecordUrl(recordId) {
  const baseId = import.meta.env.VITE_AIRTABLE_BASE_ID
  const tableId = import.meta.env.VITE_AIRTABLE_TABLE_ID
  if (!baseId || !tableId || !recordId) return ''
  return `https://airtable.com/${baseId}/${tableId}/${recordId}`
}

const MultiRecordForm = () => {
  const [records, setRecords] = useState([emptyRecord()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formAlert, setFormAlert] = useState(null)
  const [submitResult, setSubmitResult] = useState(null)
  const [productionProjects, setProductionProjects] = useState([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
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
    const loadOptions = async () => {
      try {
        setIsLoadingOptions(true)
        const projects = await fetchProductionProjects()
        setProductionProjects(projects)
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

  const addNewRecord = () => {
    const defaultProductionProject = records[0]?.productionProject || ''
    setRecords([
      ...records,
      { ...emptyRecord(), productionProject: defaultProductionProject },
    ])
  }

  const removeRecord = (index) => {
    if (records.length > 1) {
      setRecords(records.filter((_, i) => i !== index))
    }
  }

  const updateRecord = (index, field, value) => {
    const updatedRecords = [...records]
    updatedRecords[index][field] = value
    setRecords(updatedRecords)
  }

  const recordHasAnyValue = (record) =>
    record.productionProject ||
    record.materialName?.trim() ||
    record.size?.trim() ||
    record.quantity ||
    record.inStock ||
    record.notes?.trim()

  const recordIsComplete = (record) =>
    record.productionProject &&
    record.materialName?.trim() &&
    record.quantity !== '' &&
    record.inStock

  const resetForNewEntry = () => {
    setRecords([emptyRecord()])
    setFormAlert(null)
    setSubmitResult(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFormAlert(null)
    setSubmitResult(null)

    try {
      const validRecords = records.filter(recordHasAnyValue)

      if (validRecords.length === 0) {
        setFormAlert({ type: 'error', message: 'אנא מלא לפחות רשומה אחת' })
        setIsSubmitting(false)
        return
      }

      const invalidRecords = validRecords.filter((r) => !recordIsComplete(r))
      if (invalidRecords.length > 0) {
        setFormAlert({
          type: 'error',
          message:
            'אנא מלא פרויקט, שם חומר, כמות ומצב מלאי בכל רשומה (שדות חובה)',
        })
        setIsSubmitting(false)
        return
      }

      const result = await createRecords(validRecords)
      const firstRecordId = result[0]?.id || ''
      setSubmitResult({
        kind: 'success',
        createdCount: result.length,
        firstRecordId,
        airtableRecordUrl: airtableRecordUrl(firstRecordId),
      })
    } catch (error) {
      setSubmitResult({
        kind: 'error',
        message:
          error.message ||
          'שגיאה ביצירת רשומות. אנא בדוק את הגדרות ה-Airtable שלך.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitResult) {
    const ok = submitResult.kind === 'success'
    const airtableUrl = ok ? String(submitResult.airtableRecordUrl || '').trim() : ''

    return (
      <div className="quote-result-page">
        <div className={`quote-result-card ${ok ? 'success' : 'error'}`}>
          <div className="quote-result-announce">
            <h1
              ref={resultTitleRef}
              className="quote-result-title"
              tabIndex={-1}
            >
              {ok ? 'הרשומות נשמרו בהצלחה' : 'השמירה נכשלה'}
            </h1>
            {ok ? (
              <>
                <p className="quote-result-lead">
                  נוצרו{' '}
                  <strong className="quote-result-ref">
                    {submitResult.createdCount}
                  </strong>{' '}
                  רשומה/ות בטבלת חומרים לפרויקט.
                </p>
                {submitResult.firstRecordId ? (
                  <p className="quote-result-meta">
                    מזהה רשומה ראשונה:{' '}
                    <span dir="ltr">{submitResult.firstRecordId}</span>
                  </p>
                ) : null}
                {airtableUrl ? (
                  <p className="quote-result-hint">
                    ניתן לערוך את הרשומות ישירות ב-Airtable — לחצו על הכפתור למטה לפתיחה.
                  </p>
                ) : null}
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
                onClick={() =>
                  window.open(airtableUrl, '_blank', 'noopener,noreferrer')
                }
              >
                פתח ב-Airtable
              </button>
            ) : null}
            <button
              type="button"
              className="multi-record-submit-btn quote-submit-btn"
              onClick={resetForNewEntry}
            >
              הוספת חומרים נוספים
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <h1 className="multi-record-page-title">חומרים לפרויקט</h1>
      <p className="multi-record-page-subtitle">
        הוספת שורות לטבלת חומרים לפרויקט — פרויקט, שם חומר, מידה, כמות, מצב מלאי והערות
      </p>

      <form onSubmit={handleSubmit} className="multi-record-form">
        {isLoadingOptions && (
          <div className="loading-message">טוען אפשרויות...</div>
        )}

        {formAlert && (
          <div
            className={`multi-record-form-alert ${formAlert.type}`}
            role="alert"
          >
            {formAlert.message}
          </div>
        )}

        <div className="records-container">
          {records.map((record, index) => (
            <div key={index} className="record-card">
              <div className="record-header">
                <h3>רשומה {index + 1}</h3>
                {records.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRecord(index)}
                    className="remove-btn"
                    aria-label="הסר רשומה"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="form-fields">
                <div className="field-group">
                  <label htmlFor={`productionProject-${index}`}>פרויקט ייצור *</label>
                  <SearchableSelect
                    id={`productionProject-${index}`}
                    options={productionProjects}
                    value={record.productionProject}
                    onChange={(id) => updateRecord(index, 'productionProject', id)}
                    placeholder="חפש או בחר פרויקט..."
                    disabled={isLoadingOptions}
                    aria-label="פרויקט ייצור"
                  />
                </div>

                <div className="field-group">
                  <label htmlFor={`materialName-${index}`}>שם חומר *</label>
                  <input
                    id={`materialName-${index}`}
                    type="text"
                    value={record.materialName}
                    onChange={(e) =>
                      updateRecord(index, 'materialName', e.target.value)
                    }
                    placeholder="שם החומר"
                    disabled={isLoadingOptions}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor={`size-${index}`}>מידה</label>
                  <input
                    id={`size-${index}`}
                    type="text"
                    value={record.size}
                    onChange={(e) => updateRecord(index, 'size', e.target.value)}
                    placeholder="מידה"
                    disabled={isLoadingOptions}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor={`quantity-${index}`}>כמות *</label>
                  <input
                    id={`quantity-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={record.quantity}
                    onChange={(e) => updateRecord(index, 'quantity', e.target.value)}
                    placeholder="הכנס כמות"
                    disabled={isLoadingOptions}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor={`inStock-${index}`}>במלאי *</label>
                  <select
                    id={`inStock-${index}`}
                    value={record.inStock}
                    onChange={(e) => updateRecord(index, 'inStock', e.target.value)}
                    disabled={isLoadingOptions}
                  >
                    <option value="">בחר מצב מלאי...</option>
                    {IN_STOCK_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label htmlFor={`notes-${index}`}>הערות</label>
                  <textarea
                    id={`notes-${index}`}
                    value={record.notes}
                    onChange={(e) => updateRecord(index, 'notes', e.target.value)}
                    placeholder="הערות (אופציונלי)"
                    rows={3}
                    disabled={isLoadingOptions}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={addNewRecord}
            className="add-record-btn"
            aria-label="הוסף רשומה נוספת"
          >
            <span className="plus-icon">+</span>
            הוסף רשומה נוספת
          </button>

          <button
            type="submit"
            className="submit-btn"
            disabled={isSubmitting || isLoadingOptions}
          >
            {isSubmitting ? 'יוצר רשומות...' : `צור ${records.length} רשומה/ות`}
          </button>
        </div>
      </form>
    </>
  )
}

export default MultiRecordForm
