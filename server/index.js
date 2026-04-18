import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import supplierOrderRoutes from './routes/supplierOrder.js'
import googleAuthRoutes from './routes/googleAuth.js'
import quoteSubmitRoutes from './routes/quoteSubmit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
const PORT = process.env.PORT || 3001

const distPath = path.join(__dirname, '..', 'dist')

app.use(cors({ origin: true }))
app.use(express.json({ limit: '2mb' }))

app.use('/api/google', googleAuthRoutes)
app.use('/api/supplier-order', supplierOrderRoutes)
app.use('/api/quote', quoteSubmitRoutes)

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distPath, 'index.html'), (err) => next(err))
  })
}

app.use((err, req, res, next) => {
  console.error('[server] error', err.message, err.response?.status, err.response?.data)
  const status = err.response?.status >= 400 ? err.response.status : 500
  const message = err.response?.data?.error?.message || err.message || 'Internal server error'
  res.status(status).json({ error: message })
})

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
  if (fs.existsSync(distPath)) {
    console.log(`Serving static app from ${distPath}`)
  }
})
