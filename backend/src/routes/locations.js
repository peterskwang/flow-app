const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../config/db');

// Broadcast my location (REST fallback — WS is primary)
// POST /api/locations
router.post('/', requireAuth, async (req, res) => {
  const { group_id, lat, lng } = req.body;
  if (!group_id || lat == null || lng == null) {
    return res.status(400).json({ error: 'group_id, lat, lng required' });
  }
  try {
    await pool.query(
      `INSERT INTO locations (user_id, group_id, lat, lng, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET group_id=$2, lat=$3, lng=$4, updated_at=now()`,
      [req.user.userId, group_id, lat, lng]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all teammate locations for a group
// GET /api/locations/:groupId
router.get('/:groupId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.user_id, u.name, l.lat, l.lng, l.updated_at
       FROM locations l
       JOIN users u ON u.id = l.user_id
       WHERE l.group_id = $1
       AND l.updated_at > now() - interval '10 minutes'`,
      [req.params.groupId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
