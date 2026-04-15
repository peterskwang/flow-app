const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT id, name, banned_at FROM users WHERE id = $1', [decoded.userId]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const userRecord = result.rows[0];
    if (userRecord.banned_at) {
      return res.status(403).json({ error: 'Account banned' });
    }
    req.user = { ...decoded, name: userRecord.name };
    next();
  } catch (e) {
    console.error('[auth] token verification failed:', e.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
