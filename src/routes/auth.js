const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const tokenService = require('../services/token');

const router = express.Router();

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

// 需要请求的权限
const SCOPES = [
  'offline',
  'read:recovery',
  'read:sleep',
  'read:workout',
  'read:cycles',
  'read:profile'
].join(' ');

// GET /auth/start - 发起 OAuth 授权
router.get('/start', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.WHOOP_REDIRECT_URI,
    scope: SCOPES,
    state: state
  });

  const authUrl = `${WHOOP_AUTH_URL}?${params.toString()}`;
  res.redirect(authUrl);
});

// GET /auth/callback - OAuth 回调
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Authorization Failed</h1>
          <p>${error_description || error}</p>
          <a href="/auth/start">Try Again</a>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    // 用 code 换取 token
    const response = await axios.post(WHOOP_TOKEN_URL, new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      redirect_uri: process.env.WHOOP_REDIRECT_URI
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // 保存 token
    tokenService.saveToken({
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in
    });

    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>WHOOP Connected!</h1>
          <p>Authorization successful. You can now return to ChatGPT.</p>
          <p style="color: #888; font-size: 14px;">This window can be closed.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Token exchange failed:', err.response?.data || err.message);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Authorization Failed</h1>
          <p>${err.response?.data?.error_description || 'Failed to exchange code for token'}</p>
          <a href="/auth/start">Try Again</a>
        </body>
      </html>
    `);
  }
});

// GET /auth/status - 检查授权状态
router.get('/status', (req, res) => {
  const token = tokenService.getToken();

  if (!token) {
    return res.json({
      authorized: false,
      message: 'Not authorized. Please visit /auth/start'
    });
  }

  const expired = tokenService.isTokenExpired();

  res.json({
    authorized: true,
    expired: expired,
    expires_at: new Date(token.expires_at).toISOString(),
    updated_at: new Date(token.updated_at).toISOString()
  });
});

module.exports = router;
