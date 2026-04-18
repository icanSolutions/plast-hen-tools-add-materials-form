import express from 'express'
import { exchangeCodeForTokens, getOAuthAuthUrl } from '../lib/googleOAuth.js'

const router = express.Router()

function requireSetupKey(req, res, next) {
  const expected = process.env.GOOGLE_OAUTH_SETUP_KEY
  if (!expected || expected.length < 8) {
    return res
      .status(503)
      .type('text/plain')
      .send(
        'Set GOOGLE_OAUTH_SETUP_KEY in .env (min 8 chars) before using OAuth setup routes.'
      )
  }
  const provided =
    req.query.setup_key ||
    req.query.key ||
    req.get('x-google-oauth-setup-key')
  if (provided !== expected) {
    return res.status(403).type('text/plain').send('Forbidden: invalid or missing setup key.')
  }
  next()
}

/**
 * GET /api/google/oauth/start?setup_key=...
 * Redirects to Google consent (local: http://localhost:3001/api/google/oauth/start?setup_key=YOUR_KEY)
 */
router.get('/oauth/start', requireSetupKey, (req, res) => {
  try {
    const url = getOAuthAuthUrl()
    res.redirect(url)
  } catch (e) {
    res.status(500).type('text/plain').send(String(e.message))
  }
})

/**
 * GET /api/google/oauth/callback?code=...
 * Called by Google (no setup key). Exchange code and show refresh_token for .env.
 */
router.get('/oauth/callback', async (req, res) => {
  const err = req.query.error
  if (err) {
    return res.status(400).type('text/html').send(
      `<pre>OAuth error: ${escapeHtml(String(err))}\n${escapeHtml(String(req.query.error_description || ''))}</pre>`
    )
  }
  const code = req.query.code
  if (!code || typeof code !== 'string') {
    return res.status(400).type('text/plain').send('Missing ?code= from Google.')
  }
  try {
    const tokens = await exchangeCodeForTokens(code)
    const refresh = tokens.refresh_token
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Google OAuth</title></head><body style="font-family:sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;">
<h1>Google OAuth connected</h1>
<p>Add this to <code>server/.env</code> (or Railway variables), then restart the server:</p>
<pre style="background:#f4f4f4;padding:1rem;overflow:auto;word-break:break-all;">GOOGLE_OAUTH_REFRESH_TOKEN=${escapeHtml(refresh || '(none — revoke app access in Google Account and try again with prompt=consent)')}</pre>
${refresh ? '<p><strong>Keep this secret.</strong> Remove GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_JSON if you use OAuth only.</p>' : '<p>If refresh_token is missing: open <a href="https://myaccount.google.com/permissions">Google Account → Third-party access</a>, remove this app, then visit <strong>/api/google/oauth/start</strong> again with your setup_key.</p>'}
<p>Scopes granted: drive, documents.</p>
</body></html>`
    res.status(200).type('html').send(html)
  } catch (e) {
    res
      .status(500)
      .type('text/plain')
      .send(`Token exchange failed: ${e.message}`)
  }
})

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default router
