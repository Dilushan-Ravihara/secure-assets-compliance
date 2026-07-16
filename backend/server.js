// backend/server.js  — Main entry point
// PostgreSQL + Socket.IO + Express REST API

require("dotenv").config();
const express      = require("express");
const http         = require("http");
const { Server }   = require("socket.io");
const cors         = require("cors");
const { testConnection, initializeDatabase, query } = require("./db/database");

// Import all route modules
const authRoutes        = require("./routes/auth");
const assetRoutes       = require("./routes/assets");
const employeeRoutes    = require("./routes/employees");
const securityRoutes    = require("./routes/security");
const maintenanceRoutes = require("./routes/maintenance");
const telemetryRoutes   = require("./routes/telemetry");
const dashboardRoutes   = require("./routes/dashboard");
const aiRoutes          = require("./routes/ai");

// Configure express app middlewares
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Status check endpoint to see if the server is running fine
app.get("/", (req, res) => {
  res.json({
    system:  "SecureAssets Enterprise Backend",
    version: "2.0.0",
    status:  "operational",
    time:    new Date().toISOString()
  });
});
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Map all routing endpoints
app.use("/api/auth",        authRoutes);
app.use("/api/assets",      assetRoutes);
app.use("/api/employees",   employeeRoutes);
app.use("/api/security",    securityRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/dashboard",   dashboardRoutes);
app.use("/api/ai",          aiRoutes);
app.use("/api/telemetry",   telemetryRoutes);

// Set up socket server for real-time dashboards communication
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
app.set("socketio", io);

// calculate risk score from 0 to 100 based on device status
function computeRiskScore(data) {
  let score = 0;
  if (data.cpu  > 90)    score += 30; else if (data.cpu  > 70) score += 15;
  if (data.ram  > 85)    score += 25; else if (data.ram  > 70) score += 10;
  if (!data.antivirus)   score += 25;
  if (!data.firewall)    score += 15;
  if (data.disk > 90)    score += 15; else if (data.disk > 80) score += 5;
  if (data.os_outdated)  score += 10;
  if (data.usb_restricted === false)            score += 15;
  if (data.password_policy_compliant === false)  score += 15;
  if (data.unauthorized_software_found === true) score += 20;
  return Math.min(score, 100);
}

// generate warning and critical alerts
function generateAlerts(data) {
  const alerts = [];
  if (data.cpu  > 90)   alerts.push({ level: "CRITICAL", msg: `CPU overload: ${data.cpu}%` });
  else if (data.cpu > 70) alerts.push({ level: "WARNING", msg: `High CPU: ${data.cpu}%` });
  if (data.ram  > 85)   alerts.push({ level: "CRITICAL", msg: `RAM critical: ${data.ram}%` });
  else if (data.ram > 70) alerts.push({ level: "WARNING", msg: `High RAM: ${data.ram}%` });
  if (!data.antivirus)  alerts.push({ level: "CRITICAL", msg: "Antivirus DISABLED" });
  if (!data.firewall)   alerts.push({ level: "WARNING",  msg: "Firewall DISABLED" });
  if (data.disk > 90)   alerts.push({ level: "WARNING",  msg: `Disk critical: ${data.disk}%` });
  if (data.usb_restricted === false)            alerts.push({ level: "WARNING",  msg: "USB Storage Unrestricted" });
  if (data.password_policy_compliant === false)  alerts.push({ level: "WARNING",  msg: "Password Rotation Violations" });
  if (data.unauthorized_software_found === true) alerts.push({ level: "CRITICAL", msg: "Unauthorized Apps Running" });
  return alerts;
}

// in-memory live devices store (offline after 35s)
const liveDevices = {};
app.set("liveDevices", liveDevices);
const OFFLINE_MS  = 35000;

// in-memory command queue — stores pending shutdown/restart commands per device
// Agents poll GET /device-command?device_id=xxx to pick up commands
const commandQueue = new Map();
app.set("commandQueue", commandQueue);

// Agent polls this to check for pending commands (shutdown / restart / update)
// No authentication needed — agents don't carry tokens
app.get("/device-command", async (req, res) => {
  const deviceId = req.query.device_id;
  const serial = req.query.serial_number;
  if (!deviceId) return res.json({ command: null });

  let targetId = deviceId;
  if (serial) {
    try {
      const assetRes = await query("SELECT asset_id FROM assets WHERE serial_number = $1 LIMIT 1", [serial]);
      if (assetRes.rows.length > 0) {
        targetId = assetRes.rows[0].asset_id;
      }
    } catch (err) {
      console.error("Asset lookup in device-command failed:", err.message);
    }
  }

  // Check command queue by mapped asset_id
  let pending = commandQueue.get(String(targetId));
  if (pending) {
    commandQueue.delete(String(targetId));
    console.log(`[CMD] Delivering '${pending.command}' to agent: ${targetId} (hostname: ${deviceId})`);
    return res.json(pending);
  }

  // Fallback to original deviceId
  if (String(targetId) !== String(deviceId)) {
    pending = commandQueue.get(String(deviceId));
    if (pending) {
      commandQueue.delete(String(deviceId));
      console.log(`[CMD] Delivering '${pending.command}' to agent: ${deviceId}`);
      return res.json(pending);
    }
  }

  res.json({ command: null });
});

// device agent sends telemetry data here
app.post("/device-data", async (req, res) => {
  try {
    const data      = req.body;
    if (!data || !data.device_id) return res.status(400).json({ error: "device_id required" });

    let assetFound = false;

    // 1. Look up registered asset by serial number
    if (data.serial_number) {
      try {
        const assetRes = await query("SELECT asset_id FROM assets WHERE serial_number = $1 LIMIT 1", [data.serial_number]);
        if (assetRes.rows.length > 0) {
          data.device_id = assetRes.rows[0].asset_id;
          data.registered_asset_id = assetRes.rows[0].asset_id;
          assetFound = true;
        }
      } catch (err) {
        console.error("Asset lookup by serial number failed:", err.message);
      }
    }

    // 2. If not found by serial, check by asset_id (device_id)
    if (!assetFound) {
      try {
        const assetResId = await query("SELECT asset_id FROM assets WHERE asset_id = $1 LIMIT 1", [data.device_id]);
        if (assetResId.rows.length > 0) {
          data.registered_asset_id = assetResId.rows[0].asset_id;
          assetFound = true;
        }
      } catch (err) {
        console.error("Asset lookup by asset_id failed:", err.message);
      }
    }

    // 3. If still not found, automatically register this EDR client as an active asset
    if (!assetFound) {
      try {
        const brand = data.brand || (data.os && data.os.toLowerCase().includes("windows") ? "Microsoft" : "Unknown Brand");
        const model = data.model || "Generic EDR Client PC";
        const category = data.os && data.os.toLowerCase().includes("server") ? "server" : "desktop";
        // Generate unique serial if EDR agent did not supply one
        const serial = data.serial_number || `SN-${data.device_id}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        const location = data.location || "Main Office";
        
        await query(`
          INSERT INTO assets (asset_id, serial_number, brand, model, category, status, condition, location, notes)
          VALUES ($1, $2, $3, $4, $5, 'in_use', 'good', $6, 'Auto-registered via active EDR Agent telemetry')
          ON CONFLICT (asset_id) DO NOTHING
        `, [data.device_id, serial, brand, model, category, location]);

        console.log(`[Auto-Register] Registered new asset automatically: ${data.device_id} (${serial}) with Brand: ${brand}, Model: ${model}`);
        data.registered_asset_id = data.device_id;
      } catch (err) {
        console.error("Auto-registration of EDR asset failed:", err.message);
      }
    } else {
      // If asset is found, dynamically update its brand and model if they are missing/empty
      try {
        await query(`
          UPDATE assets 
          SET brand = COALESCE(brand, $1), 
              model = COALESCE(model, $2),
              updated_at = NOW()
          WHERE asset_id = $3
        `, [data.brand || null, data.model || null, data.device_id]);
      } catch (err) {
        console.error("Updating asset brand/model details failed:", err.message);
      }
    }

    const riskScore = computeRiskScore(data);
    const riskLevel = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";
    const alerts    = generateAlerts(data);

    // merge stats
    const enriched = {
      ...data,
      risk_score: riskScore,
      risk_level: riskLevel,
      alerts,
      timestamp:  new Date().toISOString(),
      status:     "ONLINE",
      latitude:   data.latitude !== undefined ? parseFloat(data.latitude) : null,
      longitude:  data.longitude !== undefined ? parseFloat(data.longitude) : null,
    };

    // save telemetry data to postgres in background
    query(`
      INSERT INTO device_telemetry
        (device_id, device_name, serial_number, ip_address, os, cpu, ram, disk,
         net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
         os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
         risk_score, risk_level, status, latitude, longitude)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'ONLINE',$20,$21)
    `, [
      data.device_id, data.device_name, data.serial_number || null, data.ip, data.os,
      data.cpu, data.ram, data.disk,
      data.net_sent_mb, data.net_recv_mb, data.proc_count,
      data.antivirus, data.firewall, data.os_outdated,
      data.usb_restricted !== undefined ? data.usb_restricted : true,
      data.password_policy_compliant !== undefined ? data.password_policy_compliant : true,
      data.unauthorized_software_found !== undefined ? data.unauthorized_software_found : false,
      riskScore, riskLevel,
      enriched.latitude, enriched.longitude
    ]).catch(err => console.error("Telemetry DB error:", err.message));

    // Update asset location in DB if location name is sent
    if (data.location) {
      query(
        `UPDATE assets SET location = $1, updated_at = NOW() WHERE asset_id = $2`,
        [data.location, data.device_id]
      ).catch(err => {
        console.error("Asset location update failed:", err.message);
      });
    }

    // add critical warnings to security alerts table and notify UI
    if (alerts.some(a => a.level === "CRITICAL")) {
      alerts.filter(a => a.level === "CRITICAL").forEach(alert => {
        const alertId = `INC-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
        query(
          `INSERT INTO security_alerts (alert_id, device_id, type, severity, description)
           VALUES ($1,$2,$3,'CRITICAL',$4) RETURNING *`,
          [alertId, data.device_id, "Automated Detection", alert.msg]
        ).then(result => {
          if (result.rows.length > 0) {
            io.emit("security-alert", result.rows[0]);
          }
        }).catch((dbErr) => console.error("Auto security alert DB error:", dbErr.message));
      });
    }

    // save to cache
    liveDevices[data.device_id] = { ...enriched, lastSeen: Date.now() };
    
    // push update to UI dashboards
    io.emit("live-update", enriched);

    // Automatically resolve any 'Device Disconnected' alerts for this device when it comes back online
    query(`
      UPDATE security_alerts
      SET status = 'resolved', resolved_at = NOW()
      WHERE device_id = $1 AND type = 'Device Disconnected' AND status = 'open'
      RETURNING *
    `, [data.device_id]).then(result => {
      if (result.rows.length > 0 && io) {
        result.rows.forEach(alert => {
          io.emit("alert-resolved", alert);
        });
      }
    }).catch(err => console.error("Error resolving offline alerts:", err.message));

    // send socket alert for critical cases
    if (alerts.some(a => a.level === "CRITICAL")) {
      io.emit("critical-alert", { device_id: data.device_id, alerts });
    }

    res.json({ status: "ok", risk_score: riskScore, risk_level: riskLevel });
  } catch (err) {
    console.error("Device-data error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Mount the historical query endpoint
app.use("/api/telemetry", telemetryRoutes);

// Endpoint to generate database backups programmatically
app.post("/api/settings/backup", async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");

    // Fetch data from all database tables
    const users = await query("SELECT id, name, email, role, created_at FROM users;");
    const employees = await query("SELECT * FROM employees;");
    const assets = await query("SELECT * FROM assets;");
    const telemetry = await query("SELECT * FROM device_telemetry ORDER BY recorded_at DESC LIMIT 1000;");
    const alerts = await query("SELECT * FROM security_alerts;");
    const maintenance = await query("SELECT * FROM maintenance_logs;");
    const audits = await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500;");

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "2.0",
      tables: {
        users: users.rows,
        employees: employees.rows,
        assets: assets.rows,
        device_telemetry: telemetry.rows,
        security_alerts: alerts.rows,
        maintenance_logs: maintenance.rows,
        audit_logs: audits.rows
      }
    };

    // Make sure backup directory exists inside backend
    const backupDir = path.join(__dirname, "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filename = `secureassets_backup_${Date.now()}.json`;
    const filepath = path.join(backupDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), "utf8");

    console.log(`[Backup] Database backup successfully created: ${filename}`);

    res.json({
      success: true,
      message: "Database backup completed successfully.",
      filename: filename,
      downloadUrl: `http://localhost:5000/api/settings/backup/download/${filename}`
    });
  } catch (err) {
    console.error("Backup creation failed:", err.message);
    res.status(500).json({ error: "Failed to generate database backup" });
  }
});

// Download endpoint for server backups
app.get("/api/settings/backup/download/:filename", (req, res) => {
  const path = require("path");
  const filename = req.params.filename;
  const filepath = path.join(__dirname, "backups", filename);
  res.download(filepath, filename);
});

// Handle websocket dashboard connections
io.on("connection", (socket) => {
  console.log(`[WS] Dashboard connected: ${socket.id}`);

  // Send the initial device list snapshot immediately on connect
  const now      = Date.now();
  const snapshot = Object.values(liveDevices).map(d => ({
    ...d,
    status: now - d.lastSeen > OFFLINE_MS ? "OFFLINE" : "ONLINE",
  }));
  socket.emit("device-snapshot", snapshot);

  socket.on("disconnect", () => console.log(`[WS] Dashboard disconnected: ${socket.id}`));
});

// Heartbeat checker to mark devices offline if they haven't sent data for 35 seconds
setInterval(() => {
  const now = Date.now();
  Object.keys(liveDevices).forEach(id => {
    if (liveDevices[id].status === "ONLINE" && now - liveDevices[id].lastSeen > OFFLINE_MS) {
      liveDevices[id].status = "OFFLINE";
      io.emit("device-offline", { device_id: id, timestamp: new Date().toISOString() });

      // Mark offline in DB
      query(
        `UPDATE device_telemetry SET status='OFFLINE'
         WHERE device_id=$1 AND recorded_at = (
           SELECT MAX(recorded_at) FROM device_telemetry WHERE device_id=$1
         )`, [id]
      ).catch(() => {});

      // Create automated warning alert for device offline state
      const alertId = `INC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      query(`
        INSERT INTO security_alerts (alert_id, device_id, type, severity, description, status)
        VALUES ($1, $2, 'Device Disconnected', 'WARNING', $3, 'open')
        ON CONFLICT DO NOTHING
      `, [alertId, id, `Device ${id} has gone offline. Telemetry stream interrupted.`]).then(() => {
        io.emit("security-alert", {
          alert_id: alertId,
          device_id: id,
          type: 'Device Disconnected',
          severity: 'WARNING',
          description: `Device ${id} has gone offline. Telemetry stream interrupted.`,
          status: 'open',
          created_at: new Date()
        });
      }).catch((dbErr) => console.error("Auto offline alert DB error:", dbErr.message));
    }
  });
}, 5000);

// Catch-all middleware for errors so the server doesn't crash
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Initialize DB connection and boot up server listener
const PORT = process.env.PORT || 5000;

async function startServer() {
  console.log("\n🔐 SecureAssets Enterprise Backend v2.0");
  console.log("═".repeat(45));

  const dbOk = await testConnection();
  if (!dbOk) {
    console.error("❌ Cannot start without database. Check .env settings.");
    process.exit(1);
  }

  await initializeDatabase();

  server.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log("\n📡 API Endpoints:");
    console.log(`   POST /api/auth/login`);
    console.log(`   POST /api/auth/register`);
    console.log(`   GET  /api/assets`);
    console.log(`   GET  /api/employees`);
    console.log(`   GET  /api/security/alerts`);
    console.log(`   GET  /api/maintenance`);
    console.log(`   GET  /api/dashboard/stats`);
    console.log(`   POST /device-data     ← Python agent sends here`);
    console.log(`\n🔌 WebSocket ready for real-time connections`);
  });

  // Handle EADDRINUSE gracefully — port already in use (e.g. from previous nodemon run)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Another process is still running.`);
      console.error(`   Run: taskkill /F /IM node.exe  (Windows) to kill all node processes, then restart.`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

// Graceful shutdown for nodemon hot-restarts (SIGUSR2) and SIGTERM
const gracefulShutdown = (signal) => {
  console.log(`\n[${signal}] Graceful shutdown initiated...`);
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.kill(process.pid, signal);
  });
};

process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => {
  console.log('\n[SIGINT] Shutting down...');
  server.close(() => process.exit(0));
});

startServer();

