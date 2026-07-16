// backend/routes/dashboard.js
// Aggregated dashboard statistics endpoint
const express = require("express");
const { query } = require("../db/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Get overall stats for all dashboard cards (runs parallel queries to keep it fast)
router.get("/stats", async (req, res) => {
  try {
    const [assets, security, maintenance, telemetry] = await Promise.all([
      // Asset counts
      query(`
        SELECT
          COUNT(*)                                       AS total_assets,
          COUNT(*) FILTER (WHERE status = 'in_use')      AS active_assets,
          COUNT(*) FILTER (WHERE status = 'repair')      AS in_repair,
          0                                              AS expired_warranty
        FROM assets
      `),
      // Security summary
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open' AND severity = 'CRITICAL') AS critical_open,
          COUNT(*) FILTER (WHERE status = 'open')                           AS total_open,
          COUNT(*) FILTER (WHERE resolved_at > NOW() - INTERVAL '24h')      AS resolved_today
        FROM security_alerts
      `),
      // Maintenance
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')    AS pending_tickets,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS active_tickets
        FROM maintenance_logs
      `),
      // Check telemetry (device is online if seen in the last 35 seconds)
      query(`
        SELECT
          COUNT(DISTINCT device_id)                     AS total_devices,
          COUNT(DISTINCT device_id) FILTER (
            WHERE recorded_at > NOW() - INTERVAL '35 seconds'
          )                                             AS online_devices
        FROM device_telemetry
        WHERE recorded_at > NOW() - INTERVAL '5 minutes'
      `),
    ]);

    const io = req.app.get("socketio");
    const activeSessions = io ? io.sockets.sockets.size : 0;

    res.json({
      assets:      assets.rows[0],
      security:    security.rows[0],
      maintenance: maintenance.rows[0],
      telemetry:   telemetry.rows[0],
      active_sessions: activeSessions || 1, // Fallback to 1 representing the current admin user
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// Get the 10 most recent open security alerts
router.get("/recent-alerts", async (req, res) => {
  try {
    const result = await query(`
      SELECT sa.alert_id, sa.type, sa.severity, sa.description, sa.status, sa.created_at,
             sa.device_id,
             COALESCE(a.asset_id, sa.device_id, 'Unknown') AS asset_code,
             a.brand, a.model
      FROM security_alerts sa
      LEFT JOIN assets a ON sa.asset_id = a.id
      WHERE sa.status = 'open'
      ORDER BY sa.created_at DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recent alerts" });
  }
});

// Get 7-day daily threat count for dashboard chart
router.get("/threat-history", authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        DATE(created_at)::text AS date,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical,
        COUNT(*) FILTER (WHERE severity = 'HIGH')     AS high,
        COUNT(*)                                       AS total
      FROM security_alerts
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);
    // Pad missing days with zeros for a full 7-day range
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const found = result.rows.find(r => r.date === dateStr);
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        critical: found ? parseInt(found.critical) : 0,
        high:     found ? parseInt(found.high)     : 0,
        total:    found ? parseInt(found.total)    : 0
      });
    }
    res.json(days);
  } catch (err) {
    console.error("Threat history error:", err);
    res.status(500).json({ error: "Failed to fetch threat history" });
  }
});

// Get the last 20 audit log entries so we know who did what
router.get("/audit-logs", async (req, res) => {
  try {
    const result = await query(`
      SELECT al.*, u.name AS user_name, u.role AS user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// Full paginated audit logs with search + action filter for the Audit Log page
router.get("/audit-logs-full", async (req, res) => {
  try {
    const { page = 1, limit = 20, search, action } = req.query;
    const pageNum  = parseInt(page)  || 1;
    const limitNum = parseInt(limit) || 20;
    const offset   = (pageNum - 1) * limitNum;

    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (search) {
      conditions.push(`(al.action ILIKE $${p} OR al.entity ILIKE $${p} OR al.entity_id::text ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }
    if (action && action !== 'all') {
      conditions.push(`al.action = $${p}`);
      params.push(action); p++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [logsResult, countResult] = await Promise.all([
      query(`
        SELECT al.*, u.name AS user_name, u.role AS user_role
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${where}
        ORDER BY al.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, limitNum, offset]),
      query(`
        SELECT COUNT(*) AS total FROM audit_logs al ${where}
      `, params),
    ]);

    res.json({
      logs:  logsResult.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      page:  pageNum,
      pages: Math.ceil(parseInt(countResult.rows[0]?.total || 0) / limitNum),
    });
  } catch (err) {
    console.error("Audit logs full error:", err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

module.exports = router;
