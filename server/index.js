import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import supplierOrderRoutes from './routes/supplierOrder.js'
import googleAuthRoutes from './routes/googleAuth.js'
import quoteSubmitRoutes from './routes/quoteSubmit.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: true }))
app.use(express.json({ limit: '2mb' }))

app.use('/api/google', googleAuthRoutes)
app.use('/api/supplier-order', supplierOrderRoutes)
app.use('/api/quote', quoteSubmitRoutes)

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.use((err, req, res, next) => {
  console.error('[server] error', err.message, err.response?.status, err.response?.data)
  const status = err.response?.status >= 400 ? err.response.status : 500
  const message = err.response?.data?.error?.message || err.message || 'Internal server error'
  res.status(status).json({ error: message })
})

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
