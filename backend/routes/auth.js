// backend/routes/auth.js
const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { query } = require("../db/database");
const { authenticateToken } = require("../middleware/auth");
const { generateSecret, verify, generateURI } = require('otplib');
const QRCode = require('qrcode');
require("dotenv").config();

const router = express.Router();

// Register a new user — public endpoint forces 'viewer' role.
// Admins creating higher-privilege accounts must use the authenticated route below.
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Public registration ALWAYS creates viewer accounts (security fix: Bug #3)
    const safeRole = 'viewer';

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
      [name, email, hashedPassword, safeRole, department]
    );

    res.status(201).json({ message: "User registered successfully", user: result.rows[0] });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Authenticated registration — allows admins to create admin/super_admin accounts
router.post("/register-admin", authenticateToken, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!['admin', 'super_admin'].includes(callerRole)) {
      return res.status(403).json({ error: "Insufficient privileges to create privileged accounts" });
    }

    const { name, email, password, role = "viewer", department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Only super_admin can create another super_admin (Bug #2 prevention)
    if (role === 'super_admin' && callerRole !== 'super_admin') {
      return res.status(403).json({ error: "Only a Super Admin can create another Super Admin" });
    }

    const allowed = ['viewer', 'admin', 'super_admin'];
    if (!allowed.includes(role)) {
      return res.status(400).json({ error: "Invalid role specified" });
    }

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (name, email, password, role, department)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, department, created_at`,
      [name, email, hashedPassword, role, department]
    );

    res.status(201).json({ message: "User created successfully", user: result.rows[0] });
  } catch (err) {
    console.error("Admin register error:", err);
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

    if (user.is_2fa_enabled) {
      // Create a temporary token for 2FA verification
      const tempToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name, department: user.department, is2FAPending: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      return res.json({
        requires2FA: true,
        tempToken,
        user: { email: user.email }
      });
    }

    // Insert security audit entry for successful login — auto-closed, never floods the SOC dashboard (Bug #13 fix)
    const successAlertId = `INC-${Date.now()}`;
    const successDesc = `User ${user.name} (${user.email}) logged in successfully.`;
    await query(
      `INSERT INTO security_alerts (alert_id, type, severity, description, status, resolved_at)
       VALUES ($1, 'User Authentication', 'LOW', $2, 'resolved', NOW())`,
      [successAlertId, successDesc]
    );
    // No socket broadcast for routine successful logins — reduces noise on SOC dashboard

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

// ─── 2FA Verification during login ──────────────────────────────────────────
router.post("/2fa/verify", async (req, res) => {
  try {
    const { tempToken, token: code } = req.body;
    if (!tempToken || !code) return res.status(400).json({ error: "Missing parameters" });

    // Verify temp token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    if (!decoded.is2FAPending) return res.status(401).json({ error: "Invalid token type" });

    // Fetch user and 2FA secret
    const result = await query("SELECT * FROM users WHERE id = $1", [decoded.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const user = result.rows[0];
    const verifyRes = await verify({ secret: user.two_factor_secret, token: code });
    const isValid = verifyRes.valid;

    if (!isValid) {
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    // Success - generate real token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      }
    });
  } catch (err) {
    console.error("2FA Verify error:", err);
    res.status(500).json({ error: "Verification failed" });
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

// ─── 2FA Setup Endpoints ──────────────────────────────────────────────────────
router.get("/2fa/generate", authenticateToken, async (req, res) => {
  try {
    const secret = generateSecret();
    const otpauth = generateURI({
      issuer: "SecureAssets",
      label: req.user.email || 'admin@secureassets.local',
      secret
    });
    
    // Generate QR Code data URL
    const qrCodeUrl = await QRCode.toDataURL(otpauth);
    
    res.json({ success: true, secret, qrCodeUrl });
  } catch (err) {
    console.error("Generate 2FA error:", err);
    res.status(500).json({ error: "Failed to generate 2FA secret" });
  }
});

router.post("/2fa/enable", authenticateToken, async (req, res) => {
  try {
    const { secret, token: code } = req.body;
    if (!secret || !code) return res.status(400).json({ error: "Secret and token required" });

    const verifyRes = await verify({ secret, token: code });
    const isValid = verifyRes.valid;
    if (!isValid) return res.status(400).json({ error: "Invalid token" });

    // Update user record
    await query(
      "UPDATE users SET two_factor_secret = $1, is_2fa_enabled = true WHERE id = $2",
      [secret, req.user.id]
    );

    res.json({ success: true, message: "Two-factor authentication enabled successfully" });
  } catch (err) {
    console.error("Enable 2FA error:", err);
    res.status(500).json({ error: "Failed to enable 2FA" });
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

// Update a user's role — requires admin or super_admin (Bug #2 fix)
router.put("/users/:id/role", authenticateToken, async (req, res) => {
  try {
    const callerRole = req.user.role;

    // Only admins and super_admins can change roles
    if (!['admin', 'super_admin'].includes(callerRole)) {
      return res.status(403).json({ error: "Insufficient privileges to change user roles" });
    }

    const { role } = req.body;
    const allowed  = ['super_admin', 'admin', 'viewer'];
    if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });

    // Only super_admin can assign or revoke the super_admin role
    if (role === 'super_admin' && callerRole !== 'super_admin') {
      return res.status(403).json({ error: "Only a Super Admin can assign the Super Admin role" });
    }

    // Prevent a non-super_admin from downgrading a super_admin account
    const targetRes = await query("SELECT role FROM users WHERE id = $1", [req.params.id]);
    if (targetRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    if (targetRes.rows[0].role === 'super_admin' && callerRole !== 'super_admin') {
      return res.status(403).json({ error: "Only a Super Admin can modify another Super Admin's role" });
    }

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

// Delete a user (admin operation)
router.delete("/users/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;

    // Verify role (only admin or super_admin can delete users)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: "Access denied. Only Admins can delete users." });
    }

    // Prevent deleting yourself
    if (parseInt(userId, 10) === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own active account" });
    }

    // Run cleanups inside transaction
    await query("BEGIN");
    await query("UPDATE assets SET created_by = NULL WHERE created_by = $1", [userId]);
    await query("UPDATE security_alerts SET resolved_by = NULL WHERE resolved_by = $1", [userId]);
    await query("UPDATE maintenance_logs SET created_by = NULL WHERE created_by = $1", [userId]);
    await query("UPDATE audit_logs SET user_id = NULL WHERE user_id = $1", [userId]);

    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id, name, email", [userId]);
    await query("COMMIT");

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User deleted successfully", deletedUser: result.rows[0] });
  } catch (err) {
    await query("ROLLBACK");
    console.error("Delete user error:", err.message);
    res.status(500).json({ error: "Failed to delete user account" });
  }
});


// Helper endpoint to seed dummy users — also resets passwords so they stay accessible (Bug #4 fix)
router.post("/seed-demo", async (req, res) => {
  try {
    const demoUsers = [
      { name: "Super Administrator", email: "superadmin@company.com", password: "admin123",  role: "super_admin", department: "Executive" },
      { name: "System Admin",        email: "admin@company.com",      password: "admin123",  role: "admin",       department: "IT Security" },
      { name: "Viewer Account",      email: "viewer@company.com",     password: "viewer123", role: "viewer",      department: "Operations" },
    ];

    const results = [];
    for (const u of demoUsers) {
      const hashed = await bcrypt.hash(u.password, 12);
      const existing = await query("SELECT id FROM users WHERE email = $1", [u.email]);
      if (existing.rows.length === 0) {
        // Create fresh
        const r = await query(
          "INSERT INTO users (name, email, password, role, department) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role",
          [u.name, u.email, hashed, u.role, u.department]
        );
        results.push({ created: true, ...r.rows[0] });
      } else {
        // Always reset password so accounts remain accessible
        const r = await query(
          "UPDATE users SET password = $1, role = $2, is_active = true, updated_at = NOW() WHERE email = $3 RETURNING id, name, email, role",
          [hashed, u.role, u.email]
        );
        results.push({ created: false, passwordReset: true, ...r.rows[0] });
      }
    }
    res.json({ message: "Demo users seeded / passwords reset", users: results });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Failed to seed demo users" });
  }
});

module.exports = router;
