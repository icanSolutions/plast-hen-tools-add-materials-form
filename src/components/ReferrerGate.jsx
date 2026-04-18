import React, { useState, useEffect } from 'react'
import { isAllowedReferrer } from '../utils/referrerGate'
import './ReferrerGate.css'

/**
 * Renders children only when the page was opened from an allowed referrer (e.g. Airtable).
 * Otherwise shows a blocked message. No form or API calls when blocked.
 */
const ReferrerGate = ({ children }) => {
  const [allowed, setAllowed] = useState(null)

  useEffect(() => {
    setAllowed(isAllowedReferrer())
  }, [])

  if (allowed === null) {
    return (
      <div className="referrer-gate referrer-gate-loading">
        <p>טוען...</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="referrer-gate referrer-gate-blocked">
        <div className="referrer-gate-blocked-content">
          <h1>הטופס זמין רק עבור מפתח מ-Airtable</h1>
          <p>
            טופס זה זמין רק כאשר נפתחים אליו מקישור מתוך Airtable. אנא פתחו את הקישור
            מתוך הבסיס או הדשבורד שלכם ב-Airtable.
            <br />
          לטיפול בבעיות צרו קשר עם המפתח
          </p>
        </div>
      </div>
    )
  }

  return children
}

export default ReferrerGate
