// backend/routes/auth.js
const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { query } = require("../db/database");
const { authenticateToken } = require("../middleware/auth");
require("dotenv").config();

const router = express.Router();

// Register a new user
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role = "viewer", department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Stop if the email is already in the database
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Encrypt the password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (name, email, password, role, department)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, department, created_at`,
      [name, email, hashedPassword, role, department]
    );

    res.status(201).json({ message: "User registered successfully", user: result.rows[0] });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Log in a user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email]
    );

    // If email isn't found, trigger a high-severity security alert
    if (result.rows.length === 0) {
      const failAlertId = `INC-${Date.now()}`;
      const failDesc = `Failed login attempt: Email ${email} not found or inactive.`;
      const failAlertResult = await query(
        `INSERT INTO security_alerts (alert_id, type, severity, description, status)
         VALUES ($1, 'User Authentication', 'HIGH', $2, 'open') RETURNING *`,
        [failAlertId, failDesc]
      );
      
      const io = req.app.get("socketio");
      if (io) {
        io.emit("security-alert", failAlertResult.rows[0]);
      }

      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    // If password doesn't match, log another security alert
    if (!valid) {
      const failAlertId = `INC-${Date.now()}`;
      const failDesc = `Failed login attempt for user ${user.name} (${user.email}) - Invalid password.`;
      const failAlertResult = await query(
        `INSERT INTO security_alerts (alert_id, type, severity, description, status)
         VALUES ($1, 'User Authentication', 'HIGH', $2, 'open') RETURNING *`,
        [failAlertId, failDesc]
      );

      const io = req.app.get("socketio");
      if (io) {
        io.emit("security-alert", failAlertResult.rows[0]);
      }

      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    await query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);

    // Insert security alert for successful login
    const successAlertId = `INC-${Date.now()}`;
    const successDesc = `User ${user.name} (${user.email}) logged in successfully.`;
    const successAlertResult = await query(
      `INSERT INTO security_alerts (alert_id, type, severity, description, status)
       VALUES ($1, 'User Authentication', 'LOW', $2, 'open') RETURNING *`,
      [successAlertId, successDesc]
    );

    const io = req.app.get("socketio");
    if (io) {
      io.emit("security-alert", successAlertResult.rows[0]);
    }

    // Generate a JWT token that lasts 8 hours
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({
      token,
      user: {
        id:         user.id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        department: user.department,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, email, role, department, last_login, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ─── PUT /api/auth/change-password ───────────────────────────────────────────
router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }
    const result = await query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const valid  = await bcrypt.compare(currentPassword, result.rows[0].password);

    if (!valid) return res.status(401).json({ error: "Current password incorrect" });

    const hashed = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", [hashed, req.user.id]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to update password" });
  }
});

// List all users in the system (for user management)
router.get("/users", authenticateToken, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, email, role, department, is_active, last_login, created_at FROM users ORDER BY role, name"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Update a user's role (admin operation)
router.put("/users/:id/role", authenticateToken, async (req, res) => {
  try {
    const { role } = req.body;
    const allowed  = ['super_admin', 'admin', 'viewer'];
    if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });

    const result = await query(
      "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role",
      [role, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// ─── PUT /api/auth/users/:id/status — Activate / deactivate user ─────────────
router.put("/users/:id/status", authenticateToken, async (req, res) => {
  try {
    const { is_active } = req.body;
    const result = await query(
      "UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, is_active",
      [is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user status" });
  }
});


// Helper endpoint to seed dummy users for quick setup
router.post("/seed-demo", async (req, res) => {
  try {
    const demoUsers = [
      { name: "Super Administrator", email: "superadmin@company.com", password: "admin123",  role: "super_admin", department: "Executive" },
      { name: "System Admin",        email: "admin@company.com",      password: "admin123",  role: "admin",       department: "IT Security" },
      { name: "Viewer Account",      email: "viewer@company.com",     password: "viewer123", role: "viewer",      department: "Operations" },
    ];

    const results = [];
    for (const u of demoUsers) {
      const existing = await query("SELECT id FROM users WHERE email = $1", [u.email]);
      if (existing.rows.length === 0) {
        const hashed = await bcrypt.hash(u.password, 12);
        const r = await query(
          "INSERT INTO users (name, email, password, role, department) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role",
          [u.name, u.email, hashed, u.role, u.department]
        );
        results.push({ created: true, ...r.rows[0] });
      } else {
        results.push({ created: false, email: u.email, note: "Already exists" });
      }
    }
    res.json({ message: "Demo users seeded", users: results });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Failed to seed demo users" });
  }
});

module.exports = router;
