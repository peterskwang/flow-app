const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// Register / login by device_id + name
// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { device_id, name } = req.body;
  if (!device_id || !name) {
    return res.status(400).json({ error: 'device_id and name required' });
  }
  try {
    // Upsert user
    const result = await pool.query(
      `INSERT INTO users (device_id, name)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, device_id, name, created_at`,
      [device_id, name]
    );
    const user = result.rows[0];
    if (user.banned) {
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

module.exports = router;
