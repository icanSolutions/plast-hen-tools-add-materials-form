import React from 'react'
import MultiRecordForm from './components/MultiRecordForm'
import './App.css'

function App() {
  return (
    <div className="app">
      <div className="container">
        <h1>טופס הוספת חומרי גלם לתיק ייצור</h1>
        <p className="subtitle">הוסף מספר רשומות בבת אחת באמצעות כפתור ה-+</p>
        <MultiRecordForm />
      </div>
    </div>
  )
}

export default App
