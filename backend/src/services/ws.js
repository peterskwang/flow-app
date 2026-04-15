const { WebSocketServer } = require('ws');
const { pool } = require('../config/db');

// In-memory room registry: groupId → Set<ws>
const rooms = new Map();
// User → ws mapping
const userSockets = new Map();
// Per-user audio sequence numbers
const speakerSeq = new Map();

function startHeartbeat(ws) {
  ws.on('pong', () => {
    if (ws.pongTimeout) {
      clearTimeout(ws.pongTimeout);
      ws.pongTimeout = null;
    }
  });

  ws.heartbeatInterval = setInterval(() => {
    if (ws.readyState !== 1) return;
    try {
      ws.ping();
      if (ws.pongTimeout) clearTimeout(ws.pongTimeout);
      ws.pongTimeout = setTimeout(() => {
        console.warn('[WS] Closing stale connection');
        ws.terminate();
      }, 10000);
    } catch (err) {
      console.error('[WS] Heartbeat error:', err.message);
    }
  }, 30000);
}

function cleanupHeartbeat(ws) {
  if (ws.heartbeatInterval) {
    clearInterval(ws.heartbeatInterval);
    ws.heartbeatInterval = null;
  }
  if (ws.pongTimeout) {
    clearTimeout(ws.pongTimeout);
    ws.pongTimeout = null;
  }
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('[WS] New connection');
    startHeartbeat(ws);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        await handleMessage(ws, msg);
      } catch (e) {
        console.error('[WS] Message handling error:', e.message);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      cleanupHeartbeat(ws);
      handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  });

  console.log('[FLOW] WebSocket server ready');
  return wss;
}

async function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'join': {
      // { type: 'join', userId, groupId, name }
      if (!rooms.has(msg.groupId)) rooms.set(msg.groupId, new Set());
      const room = rooms.get(msg.groupId);
      if (room.size >= 20) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 20 members)' }));
        ws.close(1008, 'room_full');
        return;
      }

      ws.userId = msg.userId;
      ws.groupId = msg.groupId;
      ws.name = msg.name;
      userSockets.set(msg.userId, ws);
      room.add(ws);
      speakerSeq.set(msg.userId, 0);

      broadcastToGroup(msg.groupId, {
        type: 'member_joined',
        userId: msg.userId,
        name: msg.name,
      }, ws);

      ws.send(JSON.stringify({ type: 'joined', groupId: msg.groupId }));
      break;
    }

    case 'location': {
      // { type: 'location', userId, groupId, lat, lng }
      broadcastToGroup(msg.groupId, {
        type: 'location',
        userId: msg.userId,
        lat: msg.lat,
        lng: msg.lng,
        ts: Date.now(),
      }, ws);

      try {
        await pool.query(
          `INSERT INTO locations (user_id, group_id, lat, lng, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id) DO UPDATE
           SET group_id = excluded.group_id,
               lat = excluded.lat,
               lng = excluded.lng,
               updated_at = now()`,
          [msg.userId, msg.groupId, msg.lat, msg.lng]
        );
      } catch (err) {
        console.error('[WS] Location persistence failed:', err.message);
      }
      break;
    }

    case 'ptt_start': {
      // { type: 'ptt_start', userId, groupId }
      broadcastToGroup(msg.groupId, {
        type: 'ptt_start',
        userId: msg.userId,
        name: ws.name,
      }, ws);
      break;
    }

    case 'ptt_end': {
      broadcastToGroup(msg.groupId, {
        type: 'ptt_end',
        userId: msg.userId,
      }, ws);
      break;
    }

    case 'audio_chunk': {
      // { type: 'audio_chunk', userId, groupId, data: <base64 opus frame> }
      const nextSeq = (speakerSeq.get(msg.userId) || 0) + 1;
      speakerSeq.set(msg.userId, nextSeq);
      broadcastToGroup(msg.groupId, {
        type: 'audio_chunk',
        userId: msg.userId,
        data: msg.data,
        seqNum: nextSeq,
      }, ws);
      break;
    }

    case 'sos': {
      // { type: 'sos', userId, groupId, lat, lng }
      broadcastToGroup(msg.groupId, {
        type: 'sos',
        userId: msg.userId,
        name: ws.name,
        lat: msg.lat,
        lng: msg.lng,
        ts: Date.now(),
      });  // broadcast to ALL including sender
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
  }
}

function handleDisconnect(ws) {
  if (ws.userId) {
    userSockets.delete(ws.userId);
    speakerSeq.delete(ws.userId);
  }
  if (ws.groupId && rooms.has(ws.groupId)) {
    const room = rooms.get(ws.groupId);
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(ws.groupId);
    }
    broadcastToGroup(ws.groupId, {
      type: 'member_left',
      userId: ws.userId,
      name: ws.name,
    });
  }
}

function broadcastToGroup(groupId, msg, exclude = null) {
  const room = rooms.get(groupId);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const client of room) {
    if (client !== exclude && client.readyState === 1) {
      client.send(payload);
    }
  }
}

module.exports = { setupWebSocket };
