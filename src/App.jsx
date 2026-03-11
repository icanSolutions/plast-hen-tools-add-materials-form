import React from 'react'
import ReferrerGate from './components/ReferrerGate'
import MultiRecordForm from './components/MultiRecordForm'
import './App.css'

function App() {
  return (
    <ReferrerGate>
      <div className="app">
        <div className="container">
          <h1>טופס הוספת חומרי גלם לתיק ייצור</h1>
          <p className="subtitle">הוסף מספר רשומות בבת אחת באמצעות כפתור ה-+</p>
          <MultiRecordForm />
        </div>
      </div>
    </ReferrerGate>
  )
}

export default App
