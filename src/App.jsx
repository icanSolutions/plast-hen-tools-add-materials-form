import React from 'react'
import { Routes, Route } from 'react-router-dom'
import ReferrerGate from './components/ReferrerGate'
import MultiRecordForm from './components/MultiRecordForm'
import SupplierOrderForm from './components/SupplierOrderForm'
import QuoteForm from './components/QuoteForm'
import logo from './assets/logo.png'
import './App.css'

function App() {
  return (
    <ReferrerGate>
      <div className="app">
        <header className="app-header">
          <div className="app-header-inner">
            <div className="app-header-title">
              <h1>כלי הזנת נתונים לפלסט חן</h1>
              <p className="app-header-subtitle">
                הזנת חומרי גלם לתיקי ייצור והזמנות חדשות מספקים
              </p>
            </div>
            <img src={logo} alt="Plast Hen logo" className="app-header-logo" />
          </div>
        </header>

        <div className="container">
          <Routes>
            <Route
              path="/supplier-order"
              element={<SupplierOrderForm />}
            />
            <Route path="/quote" element={<QuoteForm />} />
            <Route
              path="/"
              element={
                <>
                  <h1>טופס הוספת חומרי גלם לתיק ייצור</h1>
                  <p className="subtitle">הוסף מספר רשומות בבת אחת באמצעות כפתור ה-+</p>
                  <MultiRecordForm />
                </>
              }
            />
          </Routes>
        </div>
      </div>
    </ReferrerGate>
  )
}

export default App
