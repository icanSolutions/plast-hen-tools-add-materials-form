import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import ReferrerGate from './components/ReferrerGate'
import MultiRecordForm from './components/MultiRecordForm'
import SupplierOrderForm from './components/SupplierOrderForm'
import SupplierQuoteRequestForm from './components/SupplierQuoteRequestForm'
import ApproveSupplierQuoteForm from './components/ApproveSupplierQuoteForm'
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
                הזנת חומרי גלם, הזמנות מספקים ובקשות הצעת מחיר
              </p>
            </div>
            <img src={logo} alt="Plast Hen logo" className="app-header-logo" />
          </div>
          <nav className="app-main-nav" aria-label="בחירת טופס">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `app-main-nav-link${isActive ? ' active' : ''}`
              }
            >
              חומרי גלם
            </NavLink>
            <NavLink
              to="/supplier-order"
              className={({ isActive }) =>
                `app-main-nav-link${isActive ? ' active' : ''}`
              }
            >
              הזמנה מספק
            </NavLink>
            <NavLink
              to="/supplier-quote-request"
              className={({ isActive }) =>
                `app-main-nav-link${isActive ? ' active' : ''}`
              }
            >
              בקשת הצעת מחיר
            </NavLink>
            <NavLink
              to="/approve-supplier-quote"
              className={({ isActive }) =>
                `app-main-nav-link${isActive ? ' active' : ''}`
              }
            >
              אישור הצעת ספק
            </NavLink>
            <NavLink
              to="/quote"
              className={({ isActive }) =>
                `app-main-nav-link${isActive ? ' active' : ''}`
              }
            >
              הצעת מחיר
            </NavLink>
          </nav>
        </header>

        <div className="container">
          <Routes>
            <Route
              path="/supplier-order"
              element={<SupplierOrderForm />}
            />
            <Route
              path="/supplier-quote-request"
              element={<SupplierQuoteRequestForm />}
            />
            <Route
              path="/approve-supplier-quote"
              element={<ApproveSupplierQuoteForm />}
            />
            <Route path="/quote" element={<QuoteForm />} />
            <Route path="/" element={<MultiRecordForm />} />
          </Routes>
        </div>
      </div>
    </ReferrerGate>
  )
}

export default App
