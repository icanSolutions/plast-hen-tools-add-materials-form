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
 * Send an email (e.g. to supplier with PDF link or attachment).
 * @param {string} to - Email address
 * @param {string} subject - Subject line
 * @param {string} text - Plain text body
 * @param {{ filename: string, content: Buffer }[]} [attachments] - Optional attachments
 */
export async function sendMail(to, subject, text, attachments = []) {
  console.log('[email] sendMail to=', to, 'subject=', subject)
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  const transport = getTransporter()
  try {
    await transport.sendMail({
      from,
      to,
      subject,
      text,
      attachments: attachments.length ? attachments : undefined,
    })
    console.log('[email] sendMail ok')
  } catch (err) {
    console.error('[email] sendMail error', err.message)
    throw err
  }
}
