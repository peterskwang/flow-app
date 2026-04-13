const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../config/db');

// Trigger SOS
// POST /api/sos
router.post('/', requireAuth, async (req, res) => {
  const { group_id, lat, lng } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO sos_events (user_id, group_id, lat, lng)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.userId, group_id, lat, lng]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve SOS
// POST /api/sos/:id/resolve
router.post('/:id/resolve', requireAuth, async (req, res) => {
  await pool.query(
    'UPDATE sos_events SET resolved_at=now(), resolved_by=$1 WHERE id=$2',
    [req.user.userId, req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;
