require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { setupWebSocket } = require('./services/ws');
const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const locationRoutes = require('./routes/locations');
const sosRoutes = require('./routes/sos');
const adminRoutes = require('./routes/admin');
const runRoutes = require('./routes/runs');
const statsRoutes = require('./routes/stats');

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check — no auth required
app.get('/health', (req, res) => {
  res.json({ status: 'ok', project: 'wooverse', version: '1.0.0' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/stats', statsRoutes);

// WebSocket for real-time: GPS pings + intercom signaling
setupWebSocket(server);

const PORT = process.env.PORT || 8100;
server.listen(PORT, () => {
  console.log(`[Wooverse] Backend running on port ${PORT}`);
  console.log(`[Wooverse] WebSocket on same port (ws://localhost:${PORT}/ws)`);
});

module.exports = { app, server };
