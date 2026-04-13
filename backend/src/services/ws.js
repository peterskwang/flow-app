const { WebSocketServer } = require('ws');

// In-memory room registry: groupId → Set<ws>
const rooms = new Map();
// User → ws mapping
const userSockets = new Map();

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('[WS] New connection');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  });

  console.log('[FLOW] WebSocket server ready');
  return wss;
}

function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'join': {
      // { type: 'join', userId, groupId, name }
      ws.userId = msg.userId;
      ws.groupId = msg.groupId;
      ws.name = msg.name;
      userSockets.set(msg.userId, ws);

      if (!rooms.has(msg.groupId)) rooms.set(msg.groupId, new Set());
      rooms.get(msg.groupId).add(ws);

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
      broadcastToGroup(msg.groupId, {
        type: 'audio_chunk',
        userId: msg.userId,
        data: msg.data,
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
  if (ws.userId) userSockets.delete(ws.userId);
  if (ws.groupId && rooms.has(ws.groupId)) {
    rooms.get(ws.groupId).delete(ws);
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
