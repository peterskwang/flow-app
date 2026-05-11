const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const appleSignin = require('apple-signin-auth');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const EXPO_PUSH_TOKEN_REGEX = /^ExponentPushToken\[[^\]]+\]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 12;

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  });
}

// POST /api/auth/signup — Email/password registration
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email.toLowerCase(), passwordHash, name.trim()]
    );
    const user = result.rows[0];
    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at } });
  } catch (e) {
    if (e.code === '23505' && e.constraint && e.constraint.includes('email')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('[auth] signup error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login — Email/password login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, name, password_hash, banned_at FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.banned_at) {
      return res.status(403).json({ error: 'Account banned' });
    }
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error('[auth] login error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/apple — Apple Sign In
router.post('/apple', async (req, res) => {
  const { identityToken, name } = req.body || {};

  if (!identityToken) {
    return res.status(400).json({ error: 'identityToken required' });
  }

  try {
    const applePayload = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_CLIENT_ID || 'com.wooverse.app',
      ignoreExpiration: false
    });
    const appleSub = applePayload.sub;
    const appleEmail = applePayload.email || null;

    // UPSERT by apple_sub
    const upsertResult = await pool.query(
      `INSERT INTO users (apple_sub, email, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (apple_sub) DO UPDATE SET
         last_login_at = now(),
         email = COALESCE(EXCLUDED.email, users.email),
         name = CASE
           WHEN users.name IS NULL OR users.name = '' THEN COALESCE(EXCLUDED.name, users.name)
           ELSE users.name
         END
       RETURNING id, email, name, banned_at`,
      [appleSub, appleEmail, name ? name.trim() : null]
    );
    const user = upsertResult.rows[0];
    if (user.banned_at) {
      return res.status(403).json({ error: 'Account banned' });
    }
    const token = signToken({ userId: user.id, appleSub });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    console.error('[auth] apple error:', e.message);
    if (e.message && (e.message.includes('invalid') || e.message.includes('expired'))) {
      return res.status(401).json({ error: 'Invalid or expired Apple identity token' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register — Legacy device_id (backward compat, deprecated)
router.post('/register', async (req, res) => {
  console.warn('[auth] DEPRECATED: /api/auth/register called — client should migrate to /signup or /login');
  res.set('X-Deprecated', 'true');

  const resolvedName = (req.body.name || req.body.display_name || '').trim();
  const deviceId = req.body.device_id;
  if (!deviceId || !resolvedName) {
    return res.status(400).json({ error: 'device_id and name required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO users (device_id, name)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, device_id, name, created_at, banned_at`,
      [deviceId, resolvedName]
    );
    const user = result.rows[0];
    if (user.banned_at) {
      return res.status(403).json({ error: 'Account banned' });
    }
    const token = signToken({ userId: user.id, deviceId: user.device_id });
    res.json({ token, user });
  } catch (e) {
    console.error('[auth] register error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/push-token — Register push notification token
router.post('/push-token', requireAuth, async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'token required' });
  }
  if (!EXPO_PUSH_TOKEN_REGEX.test(token)) {
    return res.status(400).json({ error: 'invalid token format' });
  }

  try {
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET token = EXCLUDED.token,
             platform = EXCLUDED.platform,
             updated_at = now()`,
      [req.user.userId, token, platform || null]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth] push-token error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/users/me — Update display name
router.patch('/users/me', requireAuth, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const trimmed = name.trim();
  if (trimmed.length > 50) {
    return res.status(400).json({ error: 'Name must be 50 characters or fewer' });
  }
  try {
    const result = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name',
      [trimmed, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ ok: true, user: result.rows[0] });
  } catch (e) {
    console.error('[auth] patch-me error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
