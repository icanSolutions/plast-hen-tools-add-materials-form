import { google } from 'googleapis'
import { Readable } from 'stream'
import { getOAuthClientForApi } from './googleOAuth.js'

const SCOPES_SERVICE_ACCOUNT = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
]

let driveClient = null
let googleAuth = null

async function getCredentialsServiceAccount() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (json) {
    try {
      return typeof json === 'string' ? JSON.parse(json) : json
    } catch (e) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON')
    }
  }
  if (path) {
    const { readFile } = await import('fs/promises')
    const content = await readFile(path, 'utf8')
    return JSON.parse(content)
  }
  throw new Error(
    'Service account: set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON. Or use OAuth: GOOGLE_OAUTH_REFRESH_TOKEN + client env vars.'
  )
}

function authMode() {
  const explicit = process.env.GOOGLE_AUTH_MODE
  if (explicit === 'service_account') return 'service_account'
  if (explicit === 'oauth') return 'oauth'
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) return 'oauth'
  return 'service_account'
}

/**
 * Shared auth for Drive and Docs API (OAuth user or service account).
 */
export async function getGoogleAuth() {
  if (googleAuth) return googleAuth

  const mode = authMode()
  if (mode === 'oauth') {
    googleAuth = await getOAuthClientForApi()
    console.log('[google-auth] OAuth (user refresh token)')
    return googleAuth
  }

  const credentials = await getCredentialsServiceAccount()
  console.log(
    '[google-auth] service account:',
    credentials?.client_email,
    'project:',
    credentials?.project_id
  )
  googleAuth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES_SERVICE_ACCOUNT,
  })
  return googleAuth
}

async function getDrive() {
  if (driveClient) return driveClient
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID is required')
  const auth = await getGoogleAuth()
  driveClient = google.drive({ version: 'v3', auth })
  return driveClient
}

/**
 * Upload a buffer to Google Drive in the configured folder; make it viewable by anyone with link.
 * @param {Buffer} buffer - PDF (or other) file content
 * @param {string} filename - e.g. "order-123.pdf"
 * @returns {Promise<string>} - Web view URL of the file
 */
export async function uploadPdfToDrive(buffer, filename) {
  console.log('[drive] uploadPdfToDrive', filename)
  const drive = await getDrive()
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  const stream = Readable.from(buffer)
  let res
  try {
    res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: stream,
      },
      fields: 'id, webViewLink',
    })
  } catch (err) {
    console.error('[drive] uploadPdfToDrive error', err.message, err.response?.data)
    throw err
  }

  const fileId = res.data.id
  if (!fileId) throw new Error('Drive upload did not return file id')

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  })

  const link = res.data.webViewLink
  if (link) return link
  return `https://drive.google.com/file/d/${fileId}/view`
}

/**
 * Copy a Google Doc (template) into the target folder. Returns the new file ID.
 */
export async function copyTemplateToFolder(templateId, folderId, newName) {
  const drive = await getDrive()
  const res = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: newName, parents: [folderId] },
    fields: 'id',
  })
  const id = res.data.id
  if (!id) throw new Error('Drive copy did not return file id')
  return id
}

/**
 * Export a Google Doc as PDF and return the buffer.
 */
export async function exportDocAsPdf(fileId) {
  const drive = await getDrive()
  const res = await drive.files.export(
    { fileId, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data)
}
