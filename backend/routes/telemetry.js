// backend/routes/telemetry.js
const express = require("express");
const { query } = require("../db/database");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();

// Note: POST /api/telemetry is deprecated. Agents send to POST /device-data in server.js now.
// Command queue is stored in app via app.get("commandQueue") — a Map<deviceId, command>


// Get the most recent reading from each active device
router.get("/latest", authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT ON (t.device_id)
        t.device_id, t.device_name, t.serial_number, t.ip_address, t.os,
        t.cpu, t.ram, t.disk, t.antivirus, t.firewall,
        t.risk_score, t.risk_level, t.status, t.recorded_at,
        t.latitude, t.longitude,
        a.asset_id AS registered_asset_id
      FROM device_telemetry t
      LEFT JOIN assets a ON t.device_id = a.asset_id OR t.serial_number = a.serial_number
      ORDER BY t.device_id, t.recorded_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /latest failed:", err.message);
    res.status(500).json({ error: "Failed to fetch telemetry" });
  }
});

// Get last N records for a device (history)
router.get("/history/:deviceId", authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await query(`
      SELECT cpu, ram, disk, risk_score, recorded_at
      FROM device_telemetry
      WHERE device_id = $1
      ORDER BY recorded_at DESC
      LIMIT $2
    `, [req.params.deviceId, limit]);
    res.json(result.rows.reverse()); // chronological order
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Get average CPU/RAM and device count summary
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(DISTINCT device_id)                       AS total_devices,
        COUNT(DISTINCT device_id) FILTER (
          WHERE recorded_at > NOW() - INTERVAL '35 seconds'
        )                                               AS online_devices,
        ROUND(AVG(cpu),1)                               AS avg_cpu,
        ROUND(AVG(ram),1)                               AS avg_ram,
        COUNT(*) FILTER (WHERE risk_level = 'HIGH')     AS high_risk_count
      FROM device_telemetry
      WHERE recorded_at > NOW() - INTERVAL '5 minutes'
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// Simulate discovering a new IoT device (registers it automatically)
router.post("/discover", authenticateToken, async (req, res) => {
  try {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const lat = 6.9271 + (Math.random() * 0.06 - 0.03);
    const lon = 79.8612 + (Math.random() * 0.06 - 0.03);
    const locationsList = ["Server Room B", "Smart Lab Annex", "Kandy Control Gateway", "Corporate HQ Floor 2"];
    const locName = locationsList[Math.floor(Math.random() * locationsList.length)];

    const newDevice = {
      device_id: `IOT-${randomId}`,
      device_name: `Smart Sensor Node ${randomId}`,
      ip: `192.168.10.${Math.floor(20 + Math.random() * 200)}`,
      os: "FreeRTOS 10.4.3",
      cpu: Math.floor(20 + Math.random() * 30),
      ram: Math.floor(15 + Math.random() * 40),
      disk: Math.floor(5 + Math.random() * 10),
      net_sent_mb: parseFloat((Math.random() * 10).toFixed(2)),
      net_recv_mb: parseFloat((Math.random() * 50).toFixed(2)),
      proc_count: Math.floor(10 + Math.random() * 15),
      antivirus: true,
      firewall: true,
      os_outdated: false,
      risk_score: Math.floor(Math.random() * 30),
      risk_level: "LOW",
      latitude: lat,
      longitude: lon,
      location: locName
    };

    await query(`
      INSERT INTO device_telemetry
        (device_id, device_name, ip_address, os, cpu, ram, disk,
         net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
         os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
         risk_score, risk_level, status, recorded_at, latitude, longitude)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,true,false,$14,$15,'ONLINE', NOW(), $16, $17)
    `, [
      newDevice.device_id, newDevice.device_name, newDevice.ip, newDevice.os,
      newDevice.cpu, newDevice.ram, newDevice.disk,
      newDevice.net_sent_mb, newDevice.net_recv_mb, newDevice.proc_count,
      newDevice.antivirus, newDevice.firewall, newDevice.os_outdated,
      newDevice.risk_score, newDevice.risk_level, lat, lon
    ]);

    // Also insert a matching record into assets so it's a fully recognized device!
    const assetId = `AST-${randomId}`;
    await query(`
      INSERT INTO assets (asset_id, serial_number, brand, model, category, status, location)
      VALUES ($1, $2, 'IoT Core', $3, 'IoT Device', 'in_use', $4)
      ON CONFLICT DO NOTHING
    `, [assetId, `SN-IOT-${randomId}`, newDevice.device_name, locName]);

    // Broadcast the new device discovery via socket.io
    const io = req.app.get("socketio");
    if (io) {
      io.emit("telemetry-update", {
        ...newDevice,
        ip_address: newDevice.ip,
        status: 'ONLINE',
        recorded_at: new Date().toISOString()
      });
    }

    res.json(newDevice);
  } catch (err) {
    console.error("Device discovery error:", err.message);
    res.status(500).json({ error: "Failed to discover device" });
  }
});

// Get current agent script version from server filesystem configuration
router.get("/agent/version", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const agentPath = path.join(__dirname, "../../agent/agent.py");
    if (!fs.existsSync(agentPath)) {
      return res.status(404).json({ error: "Agent file not found on server" });
    }
    const agentCode = fs.readFileSync(agentPath, "utf8");
    const versionMatch = agentCode.match(/AGENT_VERSION\s*=\s*"(.*?)"/);
    const version = versionMatch ? versionMatch[1] : "1.0";
    res.json({ version });
  } catch (err) {
    console.error("Agent version check error:", err.message);
    res.status(500).json({ error: "Failed to read agent version" });
  }
});

// Download the compiled agent exe — auto-configures SERVER_URL
router.get("/agent/download", (req, res) => {
  try {
    const fs   = require("fs");
    const path = require("path");
    const exePath = path.join(__dirname, "../downloads/SecureAssetsAgent.exe");

    if (!fs.existsSync(exePath)) {
      // Fallback: serve the .py script if exe not built yet
      const agentPath = path.join(__dirname, "../../agent/agent.py");
      if (!fs.existsSync(agentPath)) {
        return res.status(404).json({ error: "Agent not found. Run agent/build_exe.bat first." });
      }
      let agentCode = fs.readFileSync(agentPath, "utf8");
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const host     = req.get("host") || "localhost:5000";
      const dynamicUrl = `${protocol}://${host}/device-data`;
      agentCode = agentCode.replace(/SERVER_URL\s*=\s*".*?"/, `SERVER_URL   = "${dynamicUrl}"`);
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", "attachment; filename=agent.py");
      return res.send(agentCode);
    }

    res.setHeader("Content-Disposition", "attachment; filename=SecureAssetsAgent.exe");
    res.sendFile(exePath);
  } catch (err) {
    console.error("Agent download error:", err.message);
    res.status(500).json({ error: "Failed to download agent" });
  }
});

// Download the pre-compiled python telemetry agent exe (explicit route)
router.get("/agent/download-exe", (req, res) => {
  try {
    const fs   = require("fs");
    const path = require("path");
    const exePath = path.join(__dirname, "../downloads/SecureAssetsAgent.exe");

    if (!fs.existsSync(exePath)) {
      return res.status(404).json({ 
        error: "Compiled executable not found on server", 
        message: "Please run agent/build_exe.bat on a Windows machine first to compile the agent and place the executable on the server." 
      });
    }

    res.setHeader("Content-Disposition", "attachment; filename=SecureAssetsAgent.exe");
    res.sendFile(exePath);
  } catch (err) {
    console.error("Exe download error:", err.message);
    res.status(500).json({ error: "Failed to download compiled agent application" });
  }
});

// Download the pre-configured config.json for the agent
router.get("/agent/download-config", (req, res) => {
  try {
    const protocol  = req.headers["x-forwarded-proto"] || "http";
    const hostHeader = req.get("host") || "localhost:5000";
    // Use the host IP only (not port from request — agent always hits 5000)
    const hostOnly  = hostHeader.split(":")[0];
    const config = {
      SERVER_URL:   `${protocol}://${hostOnly}:5000/device-data`,
      INTERVAL_SEC: 5,
      TEST_MODE:    false
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=config.json");
    res.send(JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("Config download error:", err.message);
    res.status(500).json({ error: "Failed to generate config" });
  }
});


// Reboot all online devices (takes them offline, queues command for agent to execute)
router.post("/devices/restart-all", authenticateToken, async (req, res) => {
  try {
    // Get all online devices from latest readings
    const latestRes = await query(`
      SELECT DISTINCT ON (device_id)
        device_id, device_name, ip_address, os,
        cpu, ram, disk, antivirus, firewall,
        risk_score, risk_level, status, net_sent_mb, net_recv_mb, proc_count, os_outdated
      FROM device_telemetry
      ORDER BY device_id, recorded_at DESC
    `);
    
    // Filter to only those currently ONLINE
    const onlineDevices = latestRes.rows.filter(d => d.status !== 'OFFLINE');
    
    if (onlineDevices.length === 0) {
      return res.json({ message: "No online devices to restart", count: 0 });
    }
    
    const io = req.app.get("socketio");
    const commandQueue = req.app.get("commandQueue");
    const issuedBy = req.user?.name || "admin";
    const now = new Date().toISOString();
    
    for (const dev of onlineDevices) {
      const deviceId = dev.device_id;
      
      // Queue command for agent
      if (commandQueue) {
        commandQueue.set(deviceId, { command: "restart", issued_at: now, issued_by: issuedBy });
      }

      // Insert an OFFLINE status entry
      await query(`
        INSERT INTO device_telemetry
          (device_id, device_name, ip_address, os, cpu, ram, disk,
           net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
           os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
           risk_score, risk_level, status)
        VALUES ($1, $2, $3, $4, 0, 0, $5, 0, 0, 0, $6, $7, $8, true, true, false, 0, 'LOW', 'OFFLINE')
      `, [deviceId, dev.device_name, dev.ip_address, dev.os, dev.disk, dev.antivirus, dev.firewall, dev.os_outdated]);
      
      // Log into audit_logs table
      await query(`
        INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
        VALUES ($1, 'Device Restart Triggered', 'device', $2, $3)
      `, [req.user.id, deviceId, JSON.stringify({ device_name: dev.device_name, bulk: true })]).catch(() => {});
      
      // Broadcast offline state immediately to dashboards
      if (io) {
        io.emit("device-offline", { device_id: deviceId, timestamp: now });
      }
    }
    
    res.json({ message: `Bulk restart command sent to ${onlineDevices.length} devices`, count: onlineDevices.length });
  } catch (err) {
    console.error("Bulk restart error:", err.message);
    res.status(500).json({ error: "Failed to process bulk restart command" });
  }
});

// Shutdown all online devices (takes them offline, queues command for agent to execute)
router.post("/devices/shutdown-all", authenticateToken, async (req, res) => {
  try {
    // Get all online devices from latest readings
    const latestRes = await query(`
      SELECT DISTINCT ON (device_id)
        device_id, device_name, ip_address, os,
        cpu, ram, disk, antivirus, firewall,
        risk_score, risk_level, status, net_sent_mb, net_recv_mb, proc_count, os_outdated
      FROM device_telemetry
      ORDER BY device_id, recorded_at DESC
    `);
    
    // Filter to only those currently ONLINE
    const onlineDevices = latestRes.rows.filter(d => d.status !== 'OFFLINE');
    
    if (onlineDevices.length === 0) {
      return res.json({ message: "No online devices to shut down", count: 0 });
    }
    
    const io = req.app.get("socketio");
    const commandQueue = req.app.get("commandQueue");
    const issuedBy = req.user?.name || "admin";
    const now = new Date().toISOString();
    
    for (const dev of onlineDevices) {
      const deviceId = dev.device_id;
      
      // Queue command for agent
      if (commandQueue) {
        commandQueue.set(deviceId, { command: "shutdown", issued_at: now, issued_by: issuedBy });
      }

      // Insert an OFFLINE status entry
      await query(`
        INSERT INTO device_telemetry
          (device_id, device_name, ip_address, os, cpu, ram, disk,
           net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
           os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
           risk_score, risk_level, status)
        VALUES ($1, $2, $3, $4, 0, 0, $5, 0, 0, 0, $6, $7, $8, true, true, false, 0, 'LOW', 'OFFLINE')
      `, [deviceId, dev.device_name, dev.ip_address, dev.os, dev.disk, dev.antivirus, dev.firewall, dev.os_outdated]);
      
      // Log into audit_logs table
      await query(`
        INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
        VALUES ($1, 'Device Shutdown Triggered', 'device', $2, $3)
      `, [req.user.id, deviceId, JSON.stringify({ device_name: dev.device_name, bulk: true })]).catch(() => {});
      
      // Broadcast offline status
      if (io) {
        io.emit("device-offline", { device_id: deviceId, timestamp: now });
      }
    }
    
    res.json({ message: `Bulk shutdown command sent to ${onlineDevices.length} devices`, count: onlineDevices.length });
  } catch (err) {
    console.error("Bulk shutdown error:", err.message);
    res.status(500).json({ error: "Failed to process bulk shutdown command" });
  }
});

// Reboot device (takes it offline, queues command for agent to execute)
router.post("/device/:deviceId/restart", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const commandQueue = req.app.get("commandQueue");
    const issuedBy = req.user?.name || "admin";
    const now = new Date().toISOString();
    
    // Get latest telemetry entry to copy non-transient characteristics (OS version, disk state, firewall)
    const latestRes = await query(`
      SELECT DISTINCT ON (device_id)
        device_id, device_name, ip_address, os,
        cpu, ram, disk, antivirus, firewall,
        risk_score, risk_level, status, net_sent_mb, net_recv_mb, proc_count, os_outdated
      FROM device_telemetry
      WHERE device_id = $1
      ORDER BY device_id, recorded_at DESC
    `, [deviceId]);
    
    if (latestRes.rows.length === 0) {
      return res.status(404).json({ error: "Device not found in telemetry database" });
    }
    
    const dev = latestRes.rows[0];
    
    // Queue command for agent
    if (commandQueue) {
      commandQueue.set(deviceId, { command: "restart", issued_at: now, issued_by: issuedBy });
      console.log(`[CMD] RESTART queued for device: ${deviceId}`);
    }

    // Insert an OFFLINE status entry
    await query(`
      INSERT INTO device_telemetry
        (device_id, device_name, ip_address, os, cpu, ram, disk,
         net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
         os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
         risk_score, risk_level, status)
      VALUES ($1, $2, $3, $4, 0, 0, $5, 0, 0, 0, $6, $7, $8, true, true, false, 0, 'LOW', 'OFFLINE')
    `, [deviceId, dev.device_name, dev.ip_address, dev.os, dev.disk, dev.antivirus, dev.firewall, dev.os_outdated]);
    
    // Log into audit_logs table
    await query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, 'Device Restart Triggered', 'device', $2, $3)
    `, [req.user.id, deviceId, JSON.stringify({ device_name: dev.device_name })]).catch(() => {});
    
    // Broadcast offline state immediately to dashboards
    const liveDevices = req.app.get("liveDevices");
    if (liveDevices && liveDevices[deviceId]) {
      liveDevices[deviceId].status = "OFFLINE";
      liveDevices[deviceId].lastSeen = 0;
    }

    const io = req.app.get("socketio");
    if (io) {
      io.emit("device-offline", { device_id: deviceId, timestamp: now });
    }
    
    res.json({ message: "Restart command sent successfully" });
  } catch (err) {
    console.error("Restart error:", err.message);
    res.status(500).json({ error: "Failed to process restart command" });
  }
});

// Shut down a device (turns it offline, queues command for agent to execute)
router.post("/device/:deviceId/shutdown", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const commandQueue = req.app.get("commandQueue");
    const issuedBy = req.user?.name || "admin";
    const now = new Date().toISOString();
    
    // Get latest telemetry entry
    const latestRes = await query(`
      SELECT DISTINCT ON (device_id)
        device_id, device_name, ip_address, os,
        cpu, ram, disk, antivirus, firewall,
        risk_score, risk_level, status, net_sent_mb, net_recv_mb, proc_count, os_outdated
      FROM device_telemetry
      WHERE device_id = $1
      ORDER BY device_id, recorded_at DESC
    `, [deviceId]);
    
    if (latestRes.rows.length === 0) {
      return res.status(404).json({ error: "Device not found in telemetry database" });
    }
    
    const dev = latestRes.rows[0];
    
    // Queue command for agent
    if (commandQueue) {
      commandQueue.set(deviceId, { command: "shutdown", issued_at: now, issued_by: issuedBy });
      console.log(`[CMD] SHUTDOWN queued for device: ${deviceId}`);
    }

    // Insert an OFFLINE status entry
    await query(`
      INSERT INTO device_telemetry
        (device_id, device_name, ip_address, os, cpu, ram, disk,
         net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
         os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
         risk_score, risk_level, status)
      VALUES ($1, $2, $3, $4, 0, 0, $5, 0, 0, 0, $6, $7, $8, true, true, false, 0, 'LOW', 'OFFLINE')
    `, [deviceId, dev.device_name, dev.ip_address, dev.os, dev.disk, dev.antivirus, dev.firewall, dev.os_outdated]);
    
    // Log into audit_logs table
    await query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, 'Device Shutdown Triggered', 'device', $2, $3)
    `, [req.user.id, deviceId, JSON.stringify({ device_name: dev.device_name })]).catch(() => {});
    
    // Broadcast offline status
    const liveDevices = req.app.get("liveDevices");
    if (liveDevices && liveDevices[deviceId]) {
      liveDevices[deviceId].status = "OFFLINE";
      liveDevices[deviceId].lastSeen = 0;
    }

    const io = req.app.get("socketio");
    if (io) {
      io.emit("device-offline", { device_id: deviceId, timestamp: now });
    }
    
    res.json({ message: "Shutdown command sent successfully" });
  } catch (err) {
    console.error("Shutdown error:", err.message);
    res.status(500).json({ error: "Failed to process shutdown command" });
  }
});

// Upgrade device firmware version
router.post("/device/:deviceId/update-firmware", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const commandQueue = req.app.get("commandQueue");
    const issuedBy = req.user?.name || "admin";
    const now = new Date().toISOString();
    
    // Get latest telemetry entry
    const latestRes = await query(`
      SELECT DISTINCT ON (device_id)
        device_id, device_name, ip_address, os,
        cpu, ram, disk, antivirus, firewall,
        risk_score, risk_level, status, net_sent_mb, net_recv_mb, proc_count, os_outdated
      FROM device_telemetry
      WHERE device_id = $1
      ORDER BY device_id, recorded_at DESC
    `, [deviceId]);
    
    if (latestRes.rows.length === 0) {
      return res.status(404).json({ error: "Device not found in telemetry database" });
    }
    
    const dev = latestRes.rows[0];
    
    // Queue command for agent
    if (commandQueue) {
      commandQueue.set(deviceId, { command: "update", issued_at: now, issued_by: issuedBy });
      console.log(`[CMD] UPDATE queued for device: ${deviceId}`);
    }

    // Calculate new version string
    let currentOs = dev.os || "FreeRTOS 10.4.3";
    let newOs = currentOs;
    
    // If it contains a version number, increment it
    const versionMatch = currentOs.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      const parts = versionMatch[0].split('.').map(Number);
      parts[1] += 1; // Increment middle version part (e.g. 10.4.3 -> 10.5.3 or 10.5.0)
      parts[2] = 0; // reset patch
      newOs = currentOs.replace(versionMatch[0], parts.join('.'));
    } else {
      newOs = `${currentOs} v2.0`;
    }
    
    // Insert updated OS version entry
    await query(`
      INSERT INTO device_telemetry
        (device_id, device_name, ip_address, os, cpu, ram, disk,
         net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
         os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
         risk_score, risk_level, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, true, true, false, $13, $14, 'ONLINE')
    `, [
      deviceId, dev.device_name, dev.ip_address, newOs,
      dev.cpu, dev.ram, dev.disk,
      dev.net_sent_mb, dev.net_recv_mb, dev.proc_count,
      dev.antivirus, dev.firewall, // mark as no longer outdated (false hardcoded above)!
      dev.risk_score, dev.risk_level
    ]);
    
    // Log into audit_logs table
    await query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, 'Firmware Update Triggered', 'device', $2, $3)
    `, [req.user.id, deviceId, JSON.stringify({ previous_os: dev.os, new_os: newOs })]).catch(() => {});
    
    // Broadcast live-update
    const io = req.app.get("socketio");
    if (io) {
      const updatedDev = {
        device_id: deviceId,
        device_name: dev.device_name,
        ip: dev.ip_address,
        ip_address: dev.ip_address,
        os: newOs,
        cpu: dev.cpu,
        ram: dev.ram,
        disk: dev.disk,
        status: 'ONLINE',
        recorded_at: new Date().toISOString()
      };
      io.emit("live-update", updatedDev);
    }
    
    res.json({ message: "Firmware updated successfully", newVersion: newOs });
  } catch (err) {
    console.error("Firmware update error:", err.message);
    res.status(500).json({ error: "Failed to process firmware update command" });
  }
});

// Remediate a device violation (e.g. enable antivirus, start firewall, patch OS, kill blacklisted apps, restrict USB)
router.post("/device/:deviceId/remediate", authenticateToken, async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const { type } = req.body; // 'antivirus' | 'firewall' | 'os_patch' | 'kill_apps' | 'usb_restrict'
    
    // Get latest telemetry entry
    const latestRes = await query(`
      SELECT DISTINCT ON (device_id) *
      FROM device_telemetry
      WHERE device_id = $1
      ORDER BY device_id, recorded_at DESC
    `, [deviceId]);
    
    if (latestRes.rows.length === 0) {
      return res.status(404).json({ error: "Device not found in telemetry database" });
    }
    
    const dev = latestRes.rows[0];
    
    let antivirus = dev.antivirus;
    let firewall = dev.firewall;
    let osOutdated = dev.os_outdated;
    let unauthorizedSoftware = dev.unauthorized_software_found;
    let usbRestricted = dev.usb_restricted;
    let passwordPolicyCompliant = dev.password_policy_compliant;
    let cpu = dev.cpu;
    let ram = dev.ram;
    
    let actionText = "";
    if (type === 'antivirus') {
      antivirus = true;
      actionText = "Compliance Remediation: Antivirus Enabled";
    } else if (type === 'firewall') {
      firewall = true;
      actionText = "Compliance Remediation: Firewall Activated";
    } else if (type === 'os_patch') {
      osOutdated = false;
      actionText = "Compliance Remediation: OS Hotfix Applied";
    } else if (type === 'kill_apps') {
      unauthorizedSoftware = false;
      // also reset cpu and ram slightly if they were overloaded by these apps!
      cpu = Math.max(10, cpu - 30);
      ram = Math.max(30, ram - 20);
      actionText = "Compliance Remediation: Blacklisted Apps Terminated";
    } else if (type === 'usb_restrict') {
      usbRestricted = true;
      actionText = "Compliance Remediation: USB Access Restricted";
    } else {
      return res.status(400).json({ error: "Invalid remediation type" });
    }
    
    // Recalculate risk score
    let score = 0;
    if (cpu > 90) score += 30; else if (cpu > 70) score += 15;
    if (ram > 85) score += 25; else if (ram > 70) score += 10;
    if (!antivirus) score += 25;
    if (!firewall) score += 15;
    if (dev.disk > 90) score += 15; else if (dev.disk > 80) score += 5;
    if (osOutdated) score += 10;
    if (usbRestricted === false) score += 15;
    if (passwordPolicyCompliant === false) score += 15;
    if (unauthorizedSoftware === true) score += 20;
    const riskScore = Math.min(score, 100);
    const riskLevel = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";
    
    // Insert updated telemetry entry
    await query(`
      INSERT INTO device_telemetry
        (device_id, device_name, ip_address, os, cpu, ram, disk,
         net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
         os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
         risk_score, risk_level, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'ONLINE')
    `, [
      deviceId, dev.device_name, dev.ip_address, dev.os,
      cpu, ram, dev.disk,
      dev.net_sent_mb, dev.net_recv_mb, Math.max(10, dev.proc_count - 4),
      antivirus, firewall, osOutdated, usbRestricted,
      passwordPolicyCompliant, unauthorizedSoftware,
      riskScore, riskLevel
    ]);
    
    // Log into audit_logs table
    await query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, $2, 'device', $3, $4)
    `, [req.user.id, actionText, deviceId, JSON.stringify({ device_name: dev.device_name })]).catch(() => {});
    
    // Auto-resolve corresponding compliance violation security alert if any exist!
    let violationDescriptionPattern = "";
    if (type === 'antivirus') {
      violationDescriptionPattern = "%Antivirus%Disabled%";
    } else if (type === 'firewall') {
      violationDescriptionPattern = "%Firewall%Deactivated%";
    } else if (type === 'os_patch') {
      violationDescriptionPattern = "%Outdated OS%";
    } else if (type === 'kill_apps') {
      violationDescriptionPattern = "%Blacklisted%";
    } else if (type === 'usb_restrict') {
      violationDescriptionPattern = "%USB Storage Unrestricted%";
    }
    
    const io = req.app.get("socketio");
    if (violationDescriptionPattern) {
      const updateAlerts = await query(`
        UPDATE security_alerts
        SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
        WHERE device_id = $2 AND description ILIKE $3 AND status = 'open'
        RETURNING *
      `, [req.user.id, deviceId, violationDescriptionPattern]);
      
      if (io && updateAlerts.rows.length > 0) {
        updateAlerts.rows.forEach(alert => {
          io.emit("alert-resolved", alert);
        });
      }
    }
    
    // Broadcast live telemetry update
    if (io) {
      const enriched = {
        device_id: deviceId,
        device_name: dev.device_name,
        ip: dev.ip_address,
        ip_address: dev.ip_address,
        os: dev.os,
        cpu,
        ram,
        disk: dev.disk,
        antivirus,
        firewall,
        os_outdated: osOutdated,
        usb_restricted: usbRestricted,
        password_policy_compliant: passwordPolicyCompliant,
        unauthorized_software_found: unauthorizedSoftware,
        risk_score: riskScore,
        risk_level: riskLevel,
        status: 'ONLINE',
        recorded_at: new Date().toISOString()
      };
      io.emit("live-update", enriched);
    }
    
    res.json({ message: "Remediation applied successfully", riskScore, riskLevel });
  } catch (err) {
    console.error("Remediation endpoint error:", err.message);
    res.status(500).json({ error: "Failed to apply remediation" });
  }
});

// Delete ALL telemetry data (full wipe) — admin only (preserves live agent)
router.delete("/all", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
  try {
    // Remove all telemetry records from DB EXCEPT for the live agent (serial: 5CD3383BHL)
    await query("DELETE FROM device_telemetry WHERE serial_number IS NULL OR serial_number != '5CD3383BHL'");

    // Clear in-memory live store
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

    res.json({ message: "All test device telemetry cleared successfully, preserving live agent" });
  } catch (err) {
    console.error("Clear all telemetry error:", err.message);
    res.status(500).json({ error: "Failed to clear telemetry" });
  }
});

// Delete telemetry data for a device — admin only
router.delete("/device/:deviceId", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    // Delete all telemetry logs for this device
    await query(`
      DELETE FROM device_telemetry WHERE device_id = $1
    `, [deviceId]);
    
    // Remove from in-memory liveDevices store
    const liveDevices = req.app.get("liveDevices");
    if (liveDevices && liveDevices[deviceId]) {
      delete liveDevices[deviceId];
    }
    
    // Broadcast status change or device-removed event
    const io = req.app.get("socketio");
    if (io) {
      io.emit("device-offline", { device_id: deviceId, timestamp: new Date().toISOString() });
      io.emit("device-removed", { device_id: deviceId });
    }
    
    res.json({ message: "Device telemetry removed successfully" });
  } catch (err) {
    console.error("Remove device telemetry error:", err.message);
    res.status(500).json({ error: "Failed to remove device telemetry" });
  }
});
// Export latest device telemetry snapshot as CSV or JSON
router.get("/export", authenticateToken, async (req, res) => {
  const format = req.query.format || 'csv';
  try {
    const result = await query(`
      SELECT DISTINCT ON (device_id)
        device_id, device_name, ip_address, os,
        cpu, ram, disk, net_sent_mb, net_recv_mb, proc_count,
        antivirus, firewall, os_outdated,
        usb_restricted, password_policy_compliant, unauthorized_software_found,
        risk_score, risk_level, status,
        latitude, longitude, recorded_at
      FROM device_telemetry
      ORDER BY device_id, recorded_at DESC
    `);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_Devices.json');
      res.setHeader('Content-Type', 'application/json');
      return res.json(result.rows);
    }

    const headers = ['Device ID','Device Name','IP Address','OS','CPU %','RAM %','Disk %','Net Sent MB','Net Recv MB','Processes','Antivirus','Firewall','OS Outdated','USB Restricted','Password Policy','Unauthorized SW','Risk Score','Risk Level','Status','Latitude','Longitude','Last Seen'];
    const rows = result.rows.map(r => [
      r.device_id, r.device_name || '', r.ip_address || '', r.os || '',
      r.cpu || 0, r.ram || 0, r.disk || 0,
      r.net_sent_mb || 0, r.net_recv_mb || 0, r.proc_count || 0,
      r.antivirus ? 'Yes' : 'No', r.firewall ? 'Yes' : 'No',
      r.os_outdated ? 'Yes' : 'No', r.usb_restricted ? 'Yes' : 'No',
      r.password_policy_compliant ? 'Yes' : 'No',
      r.unauthorized_software_found ? 'DETECTED' : 'Clean',
      r.risk_score || 0, r.risk_level || 'LOW', r.status || '',
      r.latitude || '', r.longitude || '',
      r.recorded_at ? new Date(r.recorded_at).toLocaleString() : ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_DeviceTelemetry.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    console.error('Telemetry export error:', err.message);
    res.status(500).json({ error: 'Failed to export telemetry data' });
  }
});

// Generate and serve a one-liner PowerShell setup script for endpoint devices
router.get("/agent/install", (req, res) => {
  try {
    const protocol  = req.headers["x-forwarded-proto"] || "http";
    const hostHeader = req.get("host") || "localhost:5000";
    const serverUrl = `${protocol}://${hostHeader}`;

    // PowerShell script to deploy EDR agent on client Windows machine
    const psScript = `# SecureAssets EDR Agent - Automated Deployment Script
# Run this script as Administrator to install the agent as a background SYSTEM service.

$serverUrl = "${serverUrl}"
$installDir = "C:\\Program Files\\SecureAssetsAgent"
$exePath = "$installDir\\SecureAssetsAgent.exe"
$taskName = "SecureAssetsAgent"

Write-Host "[*] Starting SecureAssets EDR Agent Automated Installer..." -ForegroundColor Cyan

# 1. Check Administrator rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "[-] This script must be run as Administrator! Open PowerShell as Admin and try again."
    Exit
}

# 2. Create installation directory
if (!(Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Write-Host "[+] Created installation directory: $installDir" -ForegroundColor Green
}

# 3. Terminate running instances and clean previous Scheduled Task
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Write-Host "[*] Removing existing scheduled task for clean install..."
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}

# Stop any lingering process
Stop-Process -Name "SecureAssetsAgent" -Force -ErrorAction SilentlyContinue

# 4. Download EDR Agent executable
Write-Host "[*] Downloading standalone EDR Agent executable..."
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "$serverUrl/api/telemetry/agent/download" -OutFile $exePath -UseBasicParsing
    Write-Host "[+] Download complete: $exePath" -ForegroundColor Green
} catch {
    Write-Error "[-] Download failed! Ensure the backend server is reachable at $serverUrl: $_"
    Exit
}

# 5. Create Scheduled Task to run as SYSTEM on startup (silent background execution)
Write-Host "[*] Registering Scheduled Task as SYSTEM..."
$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $installDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

# 6. Start EDR Agent execution
Write-Host "[*] Launching the EDR Agent service..."
Start-ScheduledTask -TaskName $taskName

Write-Host "[SUCCESS] SecureAssets EDR Agent has been successfully configured and started!" -ForegroundColor Green
Write-Host "[*] Check the dashboard to confirm the device is now reporting telemetry." -ForegroundColor Green
`;

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", "attachment; filename=install.ps1");
    res.send(psScript);
  } catch (err) {
    console.error("Install script generation error:", err.message);
    res.status(500).json({ error: "Failed to generate installation script" });
  }
});

module.exports = router;


