import React, { useState, useEffect } from 'react'
import { createRecords, fetchProductionProjects, fetchMaterials } from '../services/airtable'
import SearchableSelect from './SearchableSelect'
import './MultiRecordForm.css'

const MultiRecordForm = () => {
  const [records, setRecords] = useState([
    { productionProject: '', material: '', quantity: '' }
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState(null)
  const [productionProjects, setProductionProjects] = useState([])
  const [materials, setMaterials] = useState([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)

  // Fetch dropdown options from Airtable on component mount
  useEffect(() => {
    const loadOptions = async () => {
      try {
        setIsLoadingOptions(true)
        const [projects, mats] = await Promise.all([
          fetchProductionProjects(),
          fetchMaterials()
        ])
        setProductionProjects(projects)
        setMaterials(mats)
      } catch (error) {
        setSubmitStatus({ 
          type: 'error', 
          message: `שגיאה בטעינת אפשרויות: ${error.message}` 
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
      { productionProject: defaultProductionProject, material: '', quantity: '' },
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus(null)

    try {
      // Filter out empty records (all fields empty)
      const validRecords = records.filter(record => 
        record.productionProject || record.material || record.quantity
      )

      if (validRecords.length === 0) {
        setSubmitStatus({ type: 'error', message: 'אנא מלא לפחות רשומה אחת' })
        setIsSubmitting(false)
        return
      }

      // Validate required fields
      const invalidRecords = validRecords.filter(record => 
        !record.productionProject || !record.material || !record.quantity
      )

      if (invalidRecords.length > 0) {
        setSubmitStatus({ type: 'error', message: 'אנא מלא את כל השדות הנדרשים בכל הרשומות' })
        setIsSubmitting(false)
        return
      }

      const result = await createRecords(validRecords)
      setSubmitStatus({ 
        type: 'success', 
        message: `נוצרו בהצלחה ${result.length} רשומה/ות ב-Airtable!` 
      })
      
      // Reset form after successful submission
      setTimeout(() => {
        setRecords([{ productionProject: '', material: '', quantity: '' }])
        setSubmitStatus(null)
      }, 3000)
    } catch (error) {
      setSubmitStatus({ 
        type: 'error', 
        message: error.message || 'שגיאה ביצירת רשומות. אנא בדוק את הגדרות ה-Airtable שלך.' 
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="multi-record-form">
      {isLoadingOptions && (
        <div className="loading-message">טוען אפשרויות...</div>
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
                  placeholder="חפש או בחר תיק ייצור..."
                  disabled={isLoadingOptions}
                  aria-label="Production project"
                />
              </div>

              <div className="field-group">
                <label htmlFor={`material-${index}`}>חומר *</label>
                <SearchableSelect
                  id={`material-${index}`}
                  options={materials}
                  value={record.material}
                  onChange={(id) => updateRecord(index, 'material', id)}
                  placeholder="חפש או בחר חומר גלם..."
                  disabled={isLoadingOptions}
                  aria-label="Material"
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
                  required
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

      {submitStatus && (
        <div className={`status-message ${submitStatus.type}`}>
          {submitStatus.message}
        </div>
      )}
    </form>
  )
}

export default MultiRecordForm
