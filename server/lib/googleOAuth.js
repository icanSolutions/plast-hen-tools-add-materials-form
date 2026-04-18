import { google } from 'googleapis'

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
]

/**
 * @returns {import('google-auth-library').OAuth2Client}
 */
export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'OAuth: set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI'
    )
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getOAuthAuthUrl() {
  const oauth2 = createOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
  })
}

/**
 * @param {string} code
 * @returns {Promise<import('google-auth-library').Credentials>}
 */
export async function exchangeCodeForTokens(code) {
  const oauth2 = createOAuth2Client()
  const { tokens } = await oauth2.getToken(code)
  return tokens
}

/**
 * OAuth2 client with refresh token (for Drive + Docs API).
 * @returns {Promise<import('google-auth-library').OAuth2Client>}
 */
export async function getOAuthClientForApi() {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!refreshToken) {
    throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN is required when using Google OAuth')
  }
  const oauth2 = createOAuth2Client()
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}
