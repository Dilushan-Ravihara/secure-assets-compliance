// backend/routes/maintenance.js
const express = require("express");
const { query } = require("../db/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Get list of maintenance tickets, optionally filtering by status
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";
    if (status) { where = "WHERE ml.status = $1"; params.push(status); }

    const result = await query(`
      SELECT ml.*,
             a.asset_id AS asset_code, a.brand, a.model,
             e.name AS assigned_to_name
      FROM maintenance_logs ml
      LEFT JOIN assets    a ON ml.asset_id    = a.id
      LEFT JOIN employees e ON ml.assigned_to = e.id
      ${where}
      ORDER BY ml.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch maintenance logs" });
  }
});

// Create a new maintenance ticket
router.post("/", async (req, res) => {
  try {
    const { asset_id, title, description, priority, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const ticketId = `TKT-${Date.now()}`;
    const result   = await query(`
      INSERT INTO maintenance_logs (ticket_id, asset_id, title, description, priority, assigned_to, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [ticketId, asset_id || null, title, description, priority || 'medium', assigned_to || null, req.user.id]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create maintenance log" });
  }
});

// Update a ticket's status, notes, or cost. If completed, sets completed_at to now.
router.put("/:id", async (req, res) => {
  try {
    const { status, description, cost, assigned_to } = req.body;
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);

    const result = await query(`
      UPDATE maintenance_logs
      SET status=$1, description=$2, cost=$3, assigned_to=$4,
          completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
          updated_at=NOW()
      WHERE (CASE WHEN $5 = true THEN id = $6 ELSE false END)
         OR UPPER(ticket_id) = UPPER($7)
      RETURNING *
    `, [status, description, cost || null, assigned_to || null, isNumeric, isNumeric ? parseInt(rawId, 10) : 0, rawId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Ticket not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update ticket error:", err.message);
    res.status(500).json({ error: "Failed to update maintenance log" });
  }
});

// Delete a maintenance ticket
router.delete("/:id", async (req, res) => {
  try {
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);
    let result;

    if (isNumeric) {
      result = await query(
        "DELETE FROM maintenance_logs WHERE id = $1 RETURNING ticket_id",
        [parseInt(rawId, 10)]
      );
    }

    if (!result || result.rows.length === 0) {
      result = await query(
        "DELETE FROM maintenance_logs WHERE ticket_id = $1 RETURNING ticket_id",
        [rawId]
      );
    }

    if (result.rows.length === 0) return res.status(404).json({ error: "Ticket not found" });
    res.json({ message: "Ticket deleted" });
  } catch (err) {
    console.error("Delete ticket error:", err.message);
    res.status(500).json({ error: "Failed to delete ticket" });
  }
});

// Export maintenance logs as CSV or JSON for reporting
router.get("/export", async (req, res) => {
  const format = req.query.format || 'csv';
  try {
    const result = await query(`
      SELECT 
        ml.ticket_id, ml.title, ml.priority, ml.status,
        ml.description, ml.cost,
        a.asset_id AS asset_code, a.brand, a.model,
        e.name AS assigned_to,
        ml.completed_at, ml.created_at
      FROM maintenance_logs ml
      LEFT JOIN assets    a ON ml.asset_id    = a.id
      LEFT JOIN employees e ON ml.assigned_to = e.id
      ORDER BY ml.created_at DESC
    `);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_Maintenance.json');
      res.setHeader('Content-Type', 'application/json');
      return res.json(result.rows);
    }

    const headers = ['Ticket ID','Title','Priority','Status','Description','Cost','Asset','Assigned To','Completed At','Created At'];
    const rows = result.rows.map(r => [
      r.ticket_id, r.title || '', r.priority || '', r.status || '', r.description || '',
      r.cost || '0', `${r.brand || ''} ${r.model || ''}`.trim() || r.asset_code || '',
      r.assigned_to || 'Unassigned',
      r.completed_at ? new Date(r.completed_at).toLocaleString() : '',
      new Date(r.created_at).toLocaleString()
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_Maintenance.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    console.error('Maintenance export error:', err.message);
    res.status(500).json({ error: 'Failed to export maintenance logs' });
  }
});

module.exports = router;
