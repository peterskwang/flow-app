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
    // Check if user is banned
    const result = await pool.query('SELECT banned_at FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length > 0 && result.rows[0].banned_at) {
      return res.status(403).json({ error: 'Account banned' });
    }
    req.user = {
      userId: decoded.userId,
      email: decoded.email || null,
      appleSub: decoded.appleSub || null,
      deviceId: decoded.deviceId || null
    };
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    return res.status(500).json({ error: 'Auth error' });
  }
}

module.exports = { requireAuth };
