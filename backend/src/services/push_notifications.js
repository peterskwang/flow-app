const { pool } = require('../config/db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function getTokensForUsers(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }

  const placeholders = userIds.map((_, idx) => `$${idx + 1}`).join(', ');
  const result = await pool.query(
    `SELECT token FROM push_tokens WHERE user_id IN (${placeholders})`,
    userIds
  );
  return result.rows.map((row) => row.token);
}

async function sendSosPush(userIds = [], triggeredBy = {}, location = {}) {
  const total = Array.isArray(userIds) ? userIds.length : 0;
  if (total === 0) {
    console.log('[push] No recipients for SOS push');
    return;
  }

  let tokens;
  try {
    tokens = await getTokensForUsers(userIds);
  } catch (e) {
    console.error('[push] Failed to fetch push tokens:', e.message);
    return;
  }

  if (tokens.length === 0) {
    console.log(`[push] SOS push: ${total} users have no registered tokens — skipping`);
    return;
  }

  const coordStr =
    location.lat != null && location.lng != null
      ? `${Number(location.lat).toFixed(4)}, ${Number(location.lng).toFixed(4)}`
      : 'unknown location';

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: '🚨 SOS Alert',
    body: `${triggeredBy.name || 'A teammate'} needs help at ${coordStr}`,
    data: {
      type: 'sos_alert',
      user_id: triggeredBy.id,
      username: triggeredBy.name,
      lat: location.lat,
      lng: location.lng,
    },
    priority: 'high',
    channelId: 'sos-alerts',
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    const sample = Array.isArray(result?.data) ? result.data.slice(0, 3) : result;
    console.log(`[push] SOS push sent to ${tokens.length} devices`, JSON.stringify(sample));
  } catch (e) {
    console.error('[push] Expo Push API error:', e.message);
  }
}

module.exports = { sendSosPush };
