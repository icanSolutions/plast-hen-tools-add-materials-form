import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT) || 587
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASS are required')
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return transporter
}

/**
 * Send an email (plain and/or HTML, optional attachments).
 * @param {string} to
 * @param {string} subject
 * @param {string} [text] - Plain text body (fallback when html is set)
 * @param {{ filename: string, content: Buffer }[]} [attachments]
 * @param {{ html?: string }} [options]
 */
export async function sendMail(to, subject, text, attachments = [], options = {}) {
  console.log('[email] sendMail to=', to, 'subject=', subject)
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  const transport = getTransporter()
  const html = options.html != null ? String(options.html) : ''
  try {
    await transport.sendMail({
      from,
      to,
      subject,
      text: text || (html ? ' ' : ''),
      html: html || undefined,
      attachments: attachments.length ? attachments : undefined,
    })
    console.log('[email] sendMail ok')
  } catch (err) {
    console.error('[email] sendMail error', err.message)
    throw err
  }
}
