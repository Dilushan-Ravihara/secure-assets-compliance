// backend/routes/employees.js
const express = require("express");
const { query } = require("../db/database");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Get employee list, support search and department filters
router.get("/", async (req, res) => {
  try {
    const { search, department, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const params     = [];
    let p = 1;

    if (search) {
      conditions.push(`(name ILIKE $${p} OR employee_id ILIKE $${p} OR email ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }
    if (department) { conditions.push(`department = $${p}`); params.push(department); p++; }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const result = await query(`
      SELECT e.*, COUNT(a.id) AS asset_count
      FROM employees e
      LEFT JOIN assets a ON a.assigned_to = e.id
      ${where}
      GROUP BY e.id
      ORDER BY e.name ASC
      LIMIT $${p} OFFSET $${p+1}
    `, [...params, limitNum, offset]);

    const countResult = await query(`SELECT COUNT(*) FROM employees ${where}`, params);

    res.json({
      data:       result.rows,
      total:      parseInt(countResult.rows[0].count),
      page:       pageNum,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum)
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// Get a single employee details and assets assigned to them
router.get("/:id", async (req, res) => {
  try {
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);

    const emp = await query(`
      SELECT * FROM employees 
      WHERE (CASE WHEN $1 = true THEN id = $2 ELSE false END)
         OR UPPER(employee_id) = UPPER($3)
    `, [isNumeric, isNumeric ? parseInt(rawId, 10) : 0, rawId]);

    if (emp.rows.length === 0) return res.status(404).json({ error: "Employee not found" });

    const assets = await query(
      "SELECT id, asset_id, brand, model, category, status FROM assets WHERE assigned_to = $1",
      [emp.rows[0].id]
    );

    res.json({ ...emp.rows[0], assigned_assets: assets.rows });
  } catch (err) {
    console.error("Get employee error:", err.message);
    res.status(500).json({ error: "Failed to fetch employee" });
  }
});

// Add a new employee
router.post("/", async (req, res) => {
  try {
    const { employee_id, name, email, phone, department, designation, location } = req.body;
    if (!employee_id || !name) return res.status(400).json({ error: "employee_id and name required" });

    const result = await query(`
      INSERT INTO employees (employee_id, name, email, phone, department, designation, location)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [employee_id, name, email, phone, department, designation, location]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Employee ID or email already exists" });
    res.status(500).json({ error: "Failed to create employee" });
  }
});

// Update an existing employee details
router.put("/:id", async (req, res) => {
  try {
    const { name, email, phone, department, designation, location, is_active } = req.body;
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);

    const result = await query(`
      UPDATE employees SET
        name=$1, email=$2, phone=$3, department=$4, designation=$5, location=$6,
        is_active=$7, updated_at=NOW()
      WHERE (CASE WHEN $8 = true THEN id = $9 ELSE false END)
         OR UPPER(employee_id) = UPPER($10)
      RETURNING *
    `, [name, email, phone, department, designation, location, is_active, isNumeric, isNumeric ? parseInt(rawId, 10) : 0, rawId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Employee not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update employee error:", err.message);
    res.status(500).json({ error: "Failed to update employee" });
  }
});

// Delete an employee (only admins allowed)
router.delete("/:id", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);
    let result;

    if (isNumeric) {
      result = await query(
        "DELETE FROM employees WHERE id = $1 RETURNING name, employee_id",
        [parseInt(rawId, 10)]
      );
    }

    if (!result || result.rows.length === 0) {
      result = await query(
        "DELETE FROM employees WHERE employee_id = $1 RETURNING name, employee_id",
        [rawId]
      );
    }

    if (result.rows.length === 0) return res.status(404).json({ error: "Employee not found" });
    res.json({ message: "Employee removed", employee: result.rows[0] });
  } catch (err) {
    console.error("Delete employee error:", err.message);
    res.status(500).json({ error: "Failed to delete employee" });
  }
});

// Allocate an asset to this employee
router.post("/:id/allocate", async (req, res) => {
  try {
    const employeeId = req.params.id; // DB ID of employee
    const { assetDbId } = req.body; // DB ID of asset to assign

    if (!assetDbId) {
      return res.status(400).json({ error: "assetDbId is required" });
    }

    // Set assigned_to and status
    const result = await query(
      "UPDATE assets SET assigned_to = $1, status = 'in_use', updated_at = NOW() WHERE id = $2 RETURNING *",
      [employeeId, assetDbId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found" });
    }

    // Audit log
    if (req.user?.id) {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, "ALLOCATE_ASSET", "assets", result.rows[0].asset_id, JSON.stringify({ employee_id: employeeId })]
      ).catch(() => {});
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Allocate asset error:", err);
    res.status(500).json({ error: "Failed to allocate asset" });
  }
});

// Deallocate an asset from this employee
router.post("/:id/deallocate", async (req, res) => {
  try {
    const { assetDbId } = req.body; // DB ID of asset to unassign

    if (!assetDbId) {
      return res.status(400).json({ error: "assetDbId is required" });
    }

    // Set assigned_to = NULL and status = 'available'
    const result = await query(
      "UPDATE assets SET assigned_to = NULL, status = 'available', updated_at = NOW() WHERE id = $1 RETURNING *",
      [assetDbId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found" });
    }

    // Audit log
    if (req.user?.id) {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, "DEALLOCATE_ASSET", "assets", result.rows[0].asset_id, JSON.stringify({})]
      ).catch(() => {});
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Deallocate asset error:", err);
    res.status(500).json({ error: "Failed to deallocate asset" });
  }
});

module.exports = router;
