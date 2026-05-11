// app/backend/src/routes/stats.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/stats/me — Full season stats for the authenticated user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1. Aggregated season totals + personal bests in a single query
    const totalsResult = await pool.query(
      `SELECT
         COUNT(*)::int                                   AS total_runs,
         COALESCE(SUM(vertical_meters), 0)::float       AS total_vertical_m,
         COALESCE(SUM(duration_seconds), 0)::int        AS total_duration_s,
         COALESCE(SUM(distance_meters), 0)::float       AS total_distance_m,
         COUNT(DISTINCT DATE(started_at))::int          AS days_on_mountain,
         COALESCE(MAX(max_speed_kmh), 0)::float         AS pb_top_speed_kmh,
         COALESCE(MAX(duration_seconds), 0)::int        AS pb_longest_run_s,
         COALESCE(MAX(distance_meters), 0)::float       AS pb_longest_distance_m,
         -- Speed consistency: stddev of avg_speed_kmh (lower = more consistent)
         COALESCE(STDDEV(avg_speed_kmh), 0)::float      AS speed_stddev
       FROM runs
       WHERE user_id = $1 AND status = 'completed'`,
      [userId]
    );

    // 2. Most vertical in a single day
    const bestDayVertResult = await pool.query(
      `SELECT COALESCE(MAX(day_vert), 0)::float AS pb_best_day_vert_m
       FROM (
         SELECT DATE(started_at) AS day, SUM(vertical_meters) AS day_vert
         FROM runs
         WHERE user_id = $1 AND status = 'completed'
         GROUP BY DATE(started_at)
       ) sub`,
      [userId]
    );

    // 3. Per-day vertical for season chart (last 90 days max)
    const chartResult = await pool.query(
      `SELECT
         DATE(started_at)               AS day,
         SUM(vertical_meters)::float    AS vert_m,
         COUNT(*)::int                  AS run_count
       FROM runs
       WHERE user_id = $1 AND status = 'completed'
         AND started_at >= NOW() - INTERVAL '90 days'
       GROUP BY DATE(started_at)
       ORDER BY day ASC`,
      [userId]
    );

    const totals = totalsResult.rows[0];
    const bestDayVert = bestDayVertResult.rows[0].pb_best_day_vert_m;

    // 4. Skill Score (0–100)
    //
    // Formula (three equally-weighted components, each 0–33.3):
    //
    //   A. Speed component (top speed relative to 120 km/h ceiling):
    //      speed_score = MIN(pb_top_speed_kmh / 120, 1) * 33.3
    //
    //   B. Consistency component (lower stddev of avg_speed = higher score):
    //      consistency_score = MAX(0, 1 - speed_stddev / 30) * 33.3
    //      (stddev ≥ 30 → 0; stddev = 0 → 33.3)
    //
    //   C. Volume component (vert-days — saturates at 50,000 m):
    //      volume_score = MIN(total_vertical_m / 50000, 1) * 33.4
    //
    //   skill_score = ROUND(speed_score + consistency_score + volume_score)
    //
    // First-run users get 0 (no data → all components zero).

    let skillScore = 0;
    if (totals.total_runs > 0) {
      const speedScore = Math.min(totals.pb_top_speed_kmh / 120, 1) * 33.3;
      const consistencyScore = Math.max(0, 1 - totals.speed_stddev / 30) * 33.3;
      const volumeScore = Math.min(totals.total_vertical_m / 50000, 1) * 33.4;
      skillScore = Math.round(speedScore + consistencyScore + volumeScore);
    }

    res.json({
      season: {
        total_runs: totals.total_runs,
        total_vertical_m: totals.total_vertical_m,
        total_duration_s: totals.total_duration_s,
        total_distance_m: totals.total_distance_m,
        days_on_mountain: totals.days_on_mountain,
      },
      personal_bests: {
        top_speed_kmh: totals.pb_top_speed_kmh,
        best_day_vert_m: bestDayVert,
        longest_run_s: totals.pb_longest_run_s,
        longest_distance_m: totals.pb_longest_distance_m,
      },
      skill_score: skillScore,
      chart: chartResult.rows.map(r => ({
        day: r.day,           // "2025-02-14"
        vert_m: r.vert_m,
        run_count: r.run_count,
      })),
    });
  } catch (err) {
    console.error('[Stats] GET /me error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
