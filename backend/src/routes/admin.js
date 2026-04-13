const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// Simple password auth for admin
function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (!pass || pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
  const result = await pool.query(
    'SELECT id, device_id, name, created_at, banned FROM users ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

// GET /api/admin/groups
router.get('/groups', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT g.*, COUNT(gm.user_id) as member_count
     FROM groups g LEFT JOIN group_members gm ON gm.group_id = g.id
     GROUP BY g.id ORDER BY g.created_at DESC`
  );
  res.json(result.rows);
});

// GET /api/admin/sos
router.get('/sos', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT s.*, u.name as user_name
     FROM sos_events s JOIN users u ON u.id = s.user_id
     ORDER BY s.triggered_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

// POST /api/admin/users/:id/ban
router.post('/users/:id/ban', requireAdmin, async (req, res) => {
  await pool.query('UPDATE users SET banned=true WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/admin/groups/:id/close
router.post('/groups/:id/close', requireAdmin, async (req, res) => {
  await pool.query('UPDATE groups SET closed_at=now() WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
