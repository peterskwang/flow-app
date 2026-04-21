const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const EXPO_PUSH_TOKEN_REGEX = /^ExponentPushToken\[[^\]]+\]$/;

// Register / login by device_id + name
// POST /api/auth/register
router.post('/register', async (req, res) => {
  const resolvedName = (req.body.name || req.body.display_name || '').trim();
  const deviceId = req.body.device_id;
  if (!deviceId || !resolvedName) {
    return res.status(400).json({ error: 'device_id and name required' });
  }
  try {
    // Upsert user
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
    const token = jwt.sign(
      { userId: user.id, deviceId: user.device_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
    res.json({ token, user });
  } catch (e) {
    console.error('[auth] register error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register push notification token
// POST /api/auth/push-token
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

module.exports = router;
