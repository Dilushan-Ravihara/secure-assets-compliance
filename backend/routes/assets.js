// backend/routes/assets.js
const express = require("express");
const { query } = require("../db/database");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Get all assets - supports search and filter by category or status
router.get("/", async (req, res) => {
  try {
    const { search, status, category, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (search) {
      conditions.push(`(a.asset_id ILIKE $${p} OR a.brand ILIKE $${p} OR a.model ILIKE $${p} OR a.serial_number ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }
    if (status) { conditions.push(`a.status = $${p}`); params.push(status); p++; }
    if (category) { conditions.push(`a.category = $${p}`); params.push(category); p++; }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const result = await query(`
      SELECT
        a.*,
        e.name   AS assigned_to_name,
        e.department AS assigned_department
      FROM assets a
      LEFT JOIN employees e ON a.assigned_to = e.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${p} OFFSET $${p+1}
    `, [...params, limitNum, offset]);

    const countResult = await query(`SELECT COUNT(*) FROM assets a ${where}`, params);

    res.json({
      data:        result.rows,
      total:       parseInt(countResult.rows[0].count),
      page:        pageNum,
      totalPages:  Math.ceil(parseInt(countResult.rows[0].count) / limitNum)
    });
  } catch (err) {
    console.error("Assets fetch error:", err);
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});

// Get total counts and combined cost of all assets
router.get("/stats/summary", async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*)                                         AS total,
        COUNT(*) FILTER (WHERE status = 'in_use')        AS in_use,
        COUNT(*) FILTER (WHERE status = 'available')     AS available,
        COUNT(*) FILTER (WHERE status = 'repair')        AS in_repair,
        COUNT(*) FILTER (WHERE status = 'retired')       AS retired,
        SUM(purchase_cost)                               AS total_value
      FROM assets
    `);
    res.json(stats.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Calculate future depreciation and replacement budget projection for assets
router.get("/stats/forecast", async (req, res) => {
  try {
    const result = await query(`
      SELECT id, asset_id, brand, model, category, purchase_cost, COALESCE(purchase_date, created_at, NOW()) AS purchase_date, status, warranty_expiry
      FROM assets
      WHERE purchase_cost IS NOT NULL
    `);

    const assets = result.rows;
    const currentYear = new Date().getFullYear();

    // 1. Calculate Depreciation for each asset
    // Lifespans (years) per category: Laptops (4), Servers (7), Network (5), Printers (5), Mobile (3), Other (5)
    const categoryLifespans = {
      laptop: 4,
      server: 7,
      network: 5,
      printer: 5,
      mobile: 3,
      other: 5
    };

    const straightLineRate = 0.25; // 25% straight line annually
    const reducingBalanceRate = 0.30; // 30% reducing balance annually

    const calculated = assets.map(asset => {
      const cost = parseFloat(asset.purchase_cost);
      const purchaseYear = new Date(asset.purchase_date).getFullYear();
      const ageInYears = Math.max(0, currentYear - purchaseYear);
      const category = (asset.category || 'other').toLowerCase();
      const lifespan = categoryLifespans[category] || 5;

      // straight-line method (salvage value is 10% of cost)
      const salvageValue = cost * 0.1;
      const annualStraightLineDep = (cost - salvageValue) / lifespan;
      const straightLineCurrentValue = Math.max(salvageValue, cost - (annualStraightLineDep * ageInYears));

      // reducing balance method: value = cost * (1 - rate)^age
      const reducingBalanceCurrentValue = Math.max(salvageValue, cost * Math.pow(1 - reducingBalanceRate, ageInYears));

      return {
        id: asset.id,
        asset_id: asset.asset_id,
        brand: asset.brand,
        model: asset.model,
        category: asset.category,
        purchase_cost: cost,
        purchase_date: asset.purchase_date,
        age_years: ageInYears,
        lifespan_years: lifespan,
        straight_line_value: straightLineCurrentValue.toFixed(2),
        reducing_balance_value: reducingBalanceCurrentValue.toFixed(2),
        depreciated_amount: (cost - straightLineCurrentValue).toFixed(2),
        warranty_expired: asset.warranty_expiry ? (new Date(asset.warranty_expiry) < new Date()) : false,
        requires_replacement: ageInYears >= lifespan || asset.status === 'retired'
      };
    });

    // 2. Budget Projections for next 3 Years
    // Project replacement cost based on category replacements
    const projections = {
      year1_budget: 0,
      year2_budget: 0,
      year3_budget: 0,
      year1_count: 0,
      year2_count: 0,
      year3_count: 0,
      items: []
    };

    calculated.forEach(asset => {
      const cost = asset.purchase_cost;
      const purchaseYear = new Date(asset.purchase_date).getFullYear();
      
      // Calculate projected replacement year relative to now
      const replacementYear = purchaseYear + asset.lifespan_years;
      const yearsUntilReplacement = replacementYear - currentYear;

      if (yearsUntilReplacement <= 1 || asset.requires_replacement) {
        projections.year1_budget += cost;
        projections.year1_count += 1;
        projections.items.push({ ...asset, replace_in: "Year 1 (Immediate)" });
      } else if (yearsUntilReplacement === 2) {
        projections.year2_budget += cost;
        projections.year2_count += 1;
        projections.items.push({ ...asset, replace_in: "Year 2" });
      } else if (yearsUntilReplacement === 3) {
        projections.year3_budget += cost;
        projections.year3_count += 1;
        projections.items.push({ ...asset, replace_in: "Year 3" });
      }
    });

    res.json({
      assets: calculated,
      projections: {
        year1_budget: projections.year1_budget.toFixed(2),
        year2_budget: projections.year2_budget.toFixed(2),
        year3_budget: projections.year3_budget.toFixed(2),
        year1_count: projections.year1_count,
        year2_count: projections.year2_count,
        year3_count: projections.year3_count
      },
      replacement_list: projections.items
    });
  } catch (err) {
    console.error("Forecasting stats error:", err.message);
    res.status(500).json({ error: "Failed to generate financial lifecycle forecast" });
  }
});

// Export all assets as CSV or JSON for reporting
router.get("/export", async (req, res) => {
  const format = req.query.format || 'csv';
  try {
    const result = await query(`
      SELECT 
        a.asset_id, a.serial_number, a.brand, a.model, a.category,
        a.status, a.condition, a.purchase_cost, a.purchase_date,
        a.warranty_expiry, a.location, a.notes,
        e.name AS assigned_to, a.created_at
      FROM assets a
      LEFT JOIN employees e ON a.assigned_to = e.id
      ORDER BY a.created_at DESC
    `);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_Assets.json');
      res.setHeader('Content-Type', 'application/json');
      return res.json(result.rows);
    }

    // Build CSV
    const headers = ['Asset ID','Serial Number','Brand','Model','Category','Status','Condition','Purchase Cost','Purchase Date','Warranty Expiry','Location','Assigned To','Created At'];
    const rows = result.rows.map(r => [
      r.asset_id, r.serial_number || '', r.brand || '', r.model || '', r.category || '',
      r.status || '', r.condition || '', r.purchase_cost || '', r.purchase_date ? new Date(r.purchase_date).toLocaleDateString() : '',
      r.warranty_expiry ? new Date(r.warranty_expiry).toLocaleDateString() : '', r.location || '',
      r.assigned_to || 'Unassigned', new Date(r.created_at).toLocaleString()
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_Assets.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    console.error('Asset export error:', err.message);
    res.status(500).json({ error: 'Failed to export assets' });
  }
});

// Get one asset details and its maintenance history by ID
router.get("/:id", async (req, res) => {
  try {
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);

    const result = await query(`
      SELECT a.*, e.name AS assigned_to_name, e.email AS assigned_email, e.department, e.employee_id AS assigned_employee_id
      FROM assets a
      LEFT JOIN employees e ON a.assigned_to = e.id
      WHERE (CASE WHEN $1 = true THEN a.id = $2 ELSE false END)
         OR UPPER(a.asset_id) = UPPER($3)
         OR REPLACE(UPPER(a.asset_id), '-', '') = REPLACE(UPPER($3), '-', '')
    `, [isNumeric, isNumeric ? parseInt(rawId, 10) : 0, rawId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Asset not found" });

    const asset = result.rows[0];

    // Maintenance history
    const maintenance = await query(
      "SELECT * FROM maintenance_logs WHERE asset_id = $1 ORDER BY created_at DESC",
      [asset.id]
    );

    res.json({ ...asset, maintenance_history: maintenance.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch asset" });
  }
});

// Add a new asset to system and write to audit logs
router.post("/", async (req, res) => {
  try {
    const {
      asset_id, serial_number, brand, model, category, status,
      condition, purchase_date, warranty_expiry, purchase_cost,
      location, notes, assigned_to
    } = req.body;

    if (!asset_id || !brand || !model) {
      return res.status(400).json({ error: "asset_id, brand, and model are required" });
    }

    const result = await query(`
      INSERT INTO assets
        (asset_id, serial_number, brand, model, category, status, condition,
         purchase_date, warranty_expiry, purchase_cost, location, notes, assigned_to, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [asset_id, serial_number, brand, model, category, status || 'available',
        condition || 'good', purchase_date ?? null, warranty_expiry ?? null,
        purchase_cost ?? null, location, notes, assigned_to ?? null, req.user.id]);

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, "CREATE_ASSET", "assets", asset_id, JSON.stringify({ brand, model })]
    );

    // Automatically seed an initial offline telemetry record for computing assets
    const computingCategories = ['Laptop', 'Desktop', 'Server', 'IoT Device', 'Network Device'];
    if (computingCategories.includes(category)) {
      // Determine default OS based on category
      let defaultOS = "Unknown OS";
      if (category === 'Laptop' || category === 'Desktop') {
        defaultOS = "Windows 11 / macOS";
      } else if (category === 'Server') {
        defaultOS = "Linux Ubuntu / Windows Server";
      } else if (category === 'IoT Device') {
        defaultOS = "FreeRTOS / Embedded Linux";
      }

      await query(`
        INSERT INTO device_telemetry (
          device_id, device_name, ip_address, os, cpu, ram, disk,
          net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
          os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
          risk_score, risk_level, status, recorded_at
        ) VALUES ($1, $2, '0.0.0.0', $3, 0, 0, 0, 0.00, 0.00, 0, false, false, false, true, true, false, 0, 'LOW', 'OFFLINE', NOW())
      `, [asset_id, `${brand} ${model}`, defaultOS]).catch(err => {
        console.error("Failed to seed initial device telemetry on asset creation:", err.message);
      });

      // Broadcast real-time live-update websocket event
      const enriched = {
        device_id: asset_id,
        device_name: `${brand} ${model}`,
        ip_address: '0.0.0.0',
        ip: '0.0.0.0',
        os: defaultOS,
        cpu: 0,
        ram: 0,
        disk: 0,
        net_sent_mb: 0,
        net_recv_mb: 0,
        proc_count: 0,
        antivirus: false,
        firewall: false,
        os_outdated: false,
        usb_restricted: true,
        password_policy_compliant: true,
        unauthorized_software_found: false,
        risk_score: 0,
        risk_level: 'LOW',
        status: 'OFFLINE',
        recorded_at: new Date().toISOString()
      };
      
      const io = req.app.get("socketio");
      if (io) {
        io.emit("live-update", enriched);
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Asset ID or Serial Number already exists" });
    console.error("Create asset error:", err);
    res.status(500).json({ error: "Failed to create asset" });
  }
});

// Update asset details
router.put("/:id", async (req, res) => {
  try {
    const {
      serial_number, brand, model, category, status, condition,
      purchase_date, warranty_expiry, purchase_cost, location, notes, assigned_to
    } = req.body;
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);

    const result = await query(`
      UPDATE assets SET
        serial_number=$1, brand=$2, model=$3, category=$4, status=$5, condition=$6,
        purchase_date=$7, warranty_expiry=$8, purchase_cost=$9, location=$10, notes=$11,
        assigned_to=$12, updated_at=NOW()
      WHERE (CASE WHEN $13 = true THEN id = $14 ELSE false END)
         OR UPPER(asset_id) = UPPER($15)
      RETURNING *
    `, [serial_number, brand, model, category, status, condition,
        purchase_date ?? null, warranty_expiry ?? null, purchase_cost ?? null,
        location, notes, assigned_to ?? null, isNumeric, isNumeric ? parseInt(rawId, 10) : 0, rawId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Asset not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update asset error:", err.message);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

// Delete ALL assets (admin only — irreversible, preserves live agent)
router.delete("/all", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    // Delete all telemetry logs EXCEPT for the live agent (serial: 5CD3383BHL)
    await query("DELETE FROM device_telemetry WHERE serial_number IS NULL OR serial_number != '5CD3383BHL'");

    // Delete all assets EXCEPT for the live agent (serial: 5CD3383BHL)
    const result = await query("DELETE FROM assets WHERE serial_number IS NULL OR serial_number != '5CD3383BHL' RETURNING asset_id");
    const count  = result.rows.length;

    // Reset in-memory live store for all except the live agent
    const liveDevices = req.app.get("liveDevices");
    const io = req.app.get("socketio");
    if (liveDevices) {
      Object.keys(liveDevices).forEach(id => {
        if (liveDevices[id].serial_number !== '5CD3383BHL') {
          delete liveDevices[id];
          if (io) {
            io.emit("device-removed", { device_id: id });
          }
        }
      });
    }

    // Audit log
    if (req.user?.id) {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, "DELETE_ALL_ASSETS", "assets", "ALL_EXCEPT_LIVE", JSON.stringify({ count })]
      ).catch(() => {});
    }
    res.json({ message: `All ${count} test assets cleared successfully, preserving live agent`, count });
  } catch (err) {
    console.error("Delete all assets error:", err.message);
    res.status(500).json({ error: "Failed to delete all assets" });
  }
});

// Delete an asset (only admins can do this)
router.delete("/:id", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);
    let result;

    if (isNumeric) {
      result = await query(
        "DELETE FROM assets WHERE id = $1 RETURNING asset_id, brand, model",
        [parseInt(rawId, 10)]
      );
    }

    // If not numeric or not found by numeric id, try by asset_id string (e.g. "AST-1234")
    if (!result || result.rows.length === 0) {
      result = await query(
        "DELETE FROM assets WHERE asset_id = $1 RETURNING asset_id, brand, model",
        [rawId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found" });
    }

    // Audit log (if user has a real id)
    if (req.user?.id) {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, "DELETE_ASSET", "assets", result.rows[0].asset_id, JSON.stringify(result.rows[0])]
      ).catch(() => {}); // Non-blocking audit
    }

    res.json({ message: "Asset deleted successfully", asset: result.rows[0] });
  } catch (err) {
    console.error("Delete asset error:", err.message);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});


module.exports = router;
