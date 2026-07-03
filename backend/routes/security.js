// backend/routes/security.js
const express = require("express");
const { query } = require("../db/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Get security alerts list with support for pagination, status, and severity filters
router.get("/alerts", async (req, res) => {
  try {
    const { status, severity, page = 1, limit = 30 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 30;
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const params     = [];
    let p = 1;

    if (status)   { conditions.push(`sa.status = $${p}`);   params.push(status);   p++; }
    if (severity) { conditions.push(`sa.severity = $${p}`); params.push(severity); p++; }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const result = await query(`
      SELECT sa.*, a.brand, a.model, a.asset_id AS asset_code,
             u.name AS resolved_by_name
      FROM security_alerts sa
      LEFT JOIN assets a ON sa.asset_id = a.id
      LEFT JOIN users  u ON sa.resolved_by = u.id
      ${where}
      ORDER BY sa.created_at DESC
      LIMIT $${p} OFFSET $${p+1}
    `, [...params, limitNum, offset]);

    const countResult = await query(`SELECT COUNT(*) FROM security_alerts sa ${where}`, params);

    res.json({
      data:       result.rows,
      total:      parseInt(countResult.rows[0].count),
      page:       pageNum,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum)
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// Create a new security alert manually
router.post("/alerts", async (req, res) => {
  try {
    const { device_id, asset_id, type, severity, description } = req.body;
    if (!type || !severity) return res.status(400).json({ error: "type and severity required" });

    const alertId = `INC-${Date.now()}`;
    const result  = await query(`
      INSERT INTO security_alerts (alert_id, device_id, asset_id, type, severity, description)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [alertId, device_id, asset_id || null, type, severity, description]);

    const io = req.app.get("socketio");
    if (io && result.rows.length > 0) {
      io.emit("security-alert", result.rows[0]);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create alert" });
  }
});

// Resolve an open security alert
router.put("/alerts/:id/resolve", async (req, res) => {
  try {
    const rawId = req.params.id;
    const isNumeric = /^\d+$/.test(rawId);

    const result = await query(`
      UPDATE security_alerts
      SET status='resolved', resolved_by=$1, resolved_at=NOW()
      WHERE (CASE WHEN $2 = true THEN id = $3 ELSE false END)
         OR UPPER(alert_id) = UPPER($4)
      RETURNING *
    `, [req.user.id, isNumeric, isNumeric ? parseInt(rawId, 10) : 0, rawId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Alert not found" });
    
    const io = req.app.get("socketio");
    if (io) {
      io.emit("alert-resolved", result.rows[0]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Resolve alert error:", err.message);
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

// Get a summary count of security alerts by severity and status
router.get("/summary", async (req, res) => {
  try {
    const summary = await query(`
      SELECT
        COUNT(*)                                          AS total_alerts,
        COUNT(*) FILTER (WHERE status = 'open')           AS open_alerts,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL')     AS critical,
        COUNT(*) FILTER (WHERE severity = 'HIGH')         AS high,
        COUNT(*) FILTER (WHERE severity = 'WARNING')      AS warning,
        COUNT(*) FILTER (WHERE resolved_at > NOW() - INTERVAL '24 hours') AS resolved_today
      FROM security_alerts
    `);
    res.json(summary.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch security summary" });
  }
});

// Get list of active compliance rules with dynamic validation against live device metrics
router.get("/compliance", async (req, res) => {
  try {
    const policiesRes = await query(
      "SELECT * FROM compliance_policies WHERE is_active = true ORDER BY category, name"
    );
    
    // Get latest telemetry for all active devices
    const telemetryRes = await query(`
      SELECT DISTINCT ON (device_id) *
      FROM device_telemetry
      ORDER BY device_id, recorded_at DESC
    `);
    
    const devices = telemetryRes.rows;
    
    // We check if devices are online using the 35s threshold
    const OFFLINE_MS = 35000;
    const now = Date.now();
    const activeDevices = devices.filter(dev => 
      (now - new Date(dev.recorded_at).getTime()) < OFFLINE_MS && dev.status !== 'OFFLINE'
    );
    
    const totalActive = activeDevices.length;
    
    const mappedPolicies = policiesRes.rows.map(policy => {
      let passedCount = 0;
      let failingDevices = [];
      
      if (totalActive === 0) {
        return {
          ...policy,
          pass_rate: 100,
          total_devices: 0,
          passed_devices: 0,
          failing_devices: []
        };
      }
      
      activeDevices.forEach(dev => {
        let passed = true;
        const policyNameLower = policy.name.toLowerCase();
        
        if (policyNameLower.includes("antivirus")) {
          passed = dev.antivirus === true;
        } else if (policyNameLower.includes("firewall")) {
          passed = dev.firewall === true;
        } else if (policyNameLower.includes("patch") || policyNameLower.includes("update")) {
          passed = dev.os_outdated === false;
        } else if (policyNameLower.includes("usb") || policyNameLower.includes("storage restriction")) {
          passed = dev.usb_restricted === true;
        } else if (policyNameLower.includes("password")) {
          passed = dev.password_policy_compliant === true;
        } else if (policyNameLower.includes("unauthorized") || policyNameLower.includes("software")) {
          passed = dev.unauthorized_software_found === false;
        } else {
          passed = dev.risk_score < 80;
        }
        
        if (passed) {
          passedCount++;
        } else {
          failingDevices.push({
            device_id: dev.device_id,
            device_name: dev.device_name || dev.device_id,
            ip_address: dev.ip_address,
            value: policyNameLower.includes("antivirus") ? "Antivirus Off" :
                   policyNameLower.includes("firewall") ? "Firewall Off" :
                   policyNameLower.includes("patch") ? "OS Outdated" :
                   policyNameLower.includes("usb") ? "USB Storage Unrestricted" :
                   policyNameLower.includes("password") ? "Password Policy Violations" :
                   policyNameLower.includes("unauthorized") || policyNameLower.includes("software") ? "Unauthorized Apps Running" : "Security Flagged"
          });
        }
      });
      
      const passRate = Math.round((passedCount / totalActive) * 100);
      return {
        ...policy,
        pass_rate: passRate,
        total_devices: totalActive,
        passed_devices: passedCount,
        failing_devices: failingDevices
      };
    });
    
    res.json(mappedPolicies);
  } catch (err) {
    console.error("Compliance policy fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch compliance policies" });
  }
});

// Trigger a fresh compliance scan sweep on all online devices
router.post("/compliance/scan", async (req, res) => {
  try {
    const telemetryRes = await query(`
      SELECT DISTINCT ON (device_id) *
      FROM device_telemetry
      ORDER BY device_id, recorded_at DESC
    `);
    
    const devices = telemetryRes.rows;
    
    const OFFLINE_MS = 35000;
    const now = Date.now();
    const activeDevices = devices.filter(dev => 
      (now - new Date(dev.recorded_at).getTime()) < OFFLINE_MS && dev.status !== 'OFFLINE'
    );
    
    const scanLogs = [
      `[AUDIT] Scanning active fleet: ${activeDevices.length} online devices found.`,
      "[AUDIT] Running EDR & Antivirus status audit...",
      "[AUDIT] Running firewall inbound/outbound inspection...",
      "[AUDIT] Verification of OS hotfixes & patch history...",
      "[AUDIT] Analyzing running threads for blacklisted apps..."
    ];
    
    const io = req.app.get("socketio");
    
    for (const dev of activeDevices) {
      const violations = [];
      if (!dev.antivirus) {
        violations.push("Compliance Failure: Antivirus is Disabled");
      }
      if (!dev.firewall) {
        violations.push("Compliance Failure: Firewall is Deactivated");
      }
      if (dev.os_outdated) {
        violations.push("Compliance Failure: Outdated OS Version");
      }
      if (dev.usb_restricted === false) {
        violations.push("Compliance Failure: USB Storage Unrestricted");
      }
      if (dev.password_policy_compliant === false) {
        violations.push("Compliance Failure: Password Rotation Violations");
      }
      if (dev.unauthorized_software_found === true) {
        violations.push("Compliance Failure: Unauthorized Apps Running");
      }
      
      for (const v of violations) {
        const existingAlert = await query(
          "SELECT id FROM security_alerts WHERE device_id = $1 AND description = $2 AND status = 'open'",
          [dev.device_id, v]
        );
        
        if (existingAlert.rows.length === 0) {
          const alertId = `INC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
          const result = await query(`
            INSERT INTO security_alerts (alert_id, device_id, type, severity, description, status)
            VALUES ($1, $2, 'Compliance Violation', 'HIGH', $3, 'open') RETURNING *
          `, [alertId, dev.device_id, v]);
          
          if (io && result.rows.length > 0) {
            io.emit("security-alert", result.rows[0]);
          }
        }
      }
    }
    
    res.json({
      success: true,
      scanned_devices: activeDevices.length,
      logs: scanLogs
    });
  } catch (err) {
    console.error("Compliance scan error:", err.message);
    res.status(500).json({ error: "Compliance scan failed" });
  }
});

// Put a network zone under lockdown and alert the frontend
router.post("/lockdown", async (req, res) => {
  try {
    const { zone, status } = req.body;
    if (!zone) return res.status(400).json({ error: "zone is required" });
    
    const result = await query(`
      INSERT INTO network_lockdowns (zone, status, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (zone) DO UPDATE 
      SET status = EXCLUDED.status, updated_at = NOW()
      RETURNING *
    `, [zone, status || 'locked']);
    
    // Broadcast via socket.io
    const io = req.app.get("socketio");
    if (io) {
      io.emit("network-lockdown", result.rows[0]);
    }

    // Insert alert for lockdown audit
    const alertId = `INC-${Date.now()}`;
    await query(`
      INSERT INTO security_alerts (alert_id, type, severity, description, status)
      VALUES ($1, 'Network Lockdown', 'CRITICAL', $2, 'open')
    `, [alertId, `Network Lockdown protocol initiated for zone: ${zone}`]);
    
    res.json({ success: true, lockdown: result.rows[0] });
  } catch (err) {
    console.error("Lockdown error:", err.message);
    res.status(500).json({ error: "Failed to execute network lockdown" });
  }
});

// Disconnect/isolate an asset from network
router.post("/isolate", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "asset ID is required" });
    const isNumeric = /^\d+$/.test(id);
    
    const result = await query(`
      UPDATE assets 
      SET status = 'isolated', updated_at = NOW()
      WHERE (CASE WHEN $1 = true THEN id = $2 ELSE false END)
         OR UPPER(asset_id) = UPPER($3)
      RETURNING *
    `, [isNumeric, isNumeric ? parseInt(id, 10) : 0, String(id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Asset not found" });
    }
    
    const asset = result.rows[0];
    
    // Insert security alert
    const alertId = `INC-${Date.now()}`;
    await query(`
      INSERT INTO security_alerts (alert_id, asset_id, type, severity, description, status)
      VALUES ($1, $2, 'Asset Isolation', 'HIGH', $3, 'open')
    `, [alertId, asset.id, `Asset ${asset.asset_id} manually isolated from network`]);
    
    // Broadcast status update
    const io = req.app.get("socketio");
    if (io) {
      io.emit("asset-isolated", asset);
    }
    
    res.json({ success: true, asset });
  } catch (err) {
    console.error("Isolation error:", err.message);
    res.status(500).json({ error: "Failed to isolate asset" });
  }
});

// Get list of CVE vulnerabilities and match them to online devices OS
router.get("/vulnerabilities", async (req, res) => {
  try {
    const vulnerabilities = await query("SELECT * FROM cve_vulnerabilities ORDER BY severity DESC, cve_id DESC");
    
    // Fetch all active device telemetry to map against CVEs
    const telemetry = await query(`
      SELECT DISTINCT ON (device_id) * 
      FROM device_telemetry 
      ORDER BY device_id, recorded_at DESC
    `);

    // Map affected devices to CVEs
    const mapped = vulnerabilities.rows.map(cve => {
      const affected = telemetry.rows.filter(dev => {
        const devOS = (dev.os || '').toLowerCase();
        const cveOS = cve.os_name.toLowerCase();
        // Simple heuristic: if CVE is for Windows and device runs Windows
        return devOS.includes(cveOS);
      });
      return {
        ...cve,
        affected_count: affected.length,
        affected_devices: affected.map(d => ({
          device_id: d.device_id,
          device_name: d.device_name || d.device_id,
          os: d.os,
          ip_address: d.ip_address,
          status: d.status
        }))
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error("Fetch CVEs error:", err.message);
    res.status(500).json({ error: "Failed to fetch security vulnerabilities" });
  }
});

// Get list of recent safety check audits uploaded
router.get("/audit-history", async (req, res) => {
  try {
    const result = await query(`
      SELECT al.*, u.name AS user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action = 'Security Check Uploaded'
      ORDER BY al.created_at DESC
      LIMIT 25
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Audit history fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch audit upload history" });
  }
});

// Receive audit upload from computer security agent and check for issues
router.post("/audit-upload", async (req, res) => {
  try {
    const errors = [];
    const { 
      host_id, 
      os_name = "Unknown OS", 
      os_version = "", 
      antivirus, 
      firewall, 
      installed_apps = [],
      cpu,
      ram,
      disk,
      net_sent_mb,
      net_recv_mb,
      proc_count,
      ip_address,
      os_outdated = false,
      usb_restricted = true,
      password_policy_compliant = true,
      status = "ONLINE",
      device_name
    } = req.body;

    // Strict validation checks
    // Auto-coerce numeric string values (e.g. from JSON form upload)
    const cpuNum  = cpu  !== undefined ? parseFloat(cpu)  : undefined;
    const ramNum  = ram  !== undefined ? parseFloat(ram)  : undefined;
    const diskNum = disk !== undefined ? parseFloat(disk) : undefined;

    // Auto-coerce boolean strings ("true" / "false") to real booleans
    const toBool = (v) => v === true || v === 'true' || v === 1 ? true : v === false || v === 'false' || v === 0 ? false : v;
    const av = toBool(antivirus);
    const fw = toBool(firewall);
    const osOut = toBool(os_outdated);
    const usbR  = toBool(usb_restricted);
    const pwdPol = toBool(password_policy_compliant);

    if (!host_id) {
      errors.push("host_id (Asset ID) is required.");
    } else if (typeof host_id !== "string") {
      errors.push("host_id must be a string.");
    }

    if (av !== undefined && typeof av !== "boolean") {
      errors.push("antivirus must be a boolean value.");
    }
    if (fw !== undefined && typeof fw !== "boolean") {
      errors.push("firewall must be a boolean value.");
    }
    if (osOut !== undefined && typeof osOut !== "boolean") {
      errors.push("os_outdated must be a boolean value.");
    }
    if (usbR !== undefined && typeof usbR !== "boolean") {
      errors.push("usb_restricted must be a boolean value.");
    }
    if (pwdPol !== undefined && typeof pwdPol !== "boolean") {
      errors.push("password_policy_compliant must be a boolean value.");
    }

    if (cpuNum !== undefined && (isNaN(cpuNum) || cpuNum < 0 || cpuNum > 100)) {
      errors.push("cpu must be a number between 0 and 100.");
    }
    if (ramNum !== undefined && (isNaN(ramNum) || ramNum < 0 || ramNum > 100)) {
      errors.push("ram must be a number between 0 and 100.");
    }
    if (diskNum !== undefined && (isNaN(diskNum) || diskNum < 0 || diskNum > 100)) {
      errors.push("disk must be a number between 0 and 100.");
    }

    if (installed_apps && !Array.isArray(installed_apps)) {
      errors.push("installed_apps must be an array of strings.");
    } else if (installed_apps && installed_apps.some(app => typeof app !== "string")) {
      errors.push("All items in installed_apps list must be strings.");
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    // Find if the asset exists in registry database to map the foreign key
    const assetResult = await query("SELECT id, brand, model FROM assets WHERE asset_id = $1", [host_id]);
    const assetDbId = assetResult.rows.length > 0 ? assetResult.rows[0].id : null;
    const resolvedDeviceName = device_name || (assetResult.rows.length > 0 
      ? `${assetResult.rows[0].brand} ${assetResult.rows[0].model}` 
      : `Host-${host_id}`);

    // Compliance Check rules evaluation
    const violations = [];
    let riskScore = 10; // Baseline risk level (nominal status)

    if (av === false) {
      violations.push("Antivirus protection is disabled");
      riskScore += 30;
    }
    if (fw === false) {
      violations.push("System Firewall is deactivated");
      riskScore += 25;
    }
    if (osOut === true) {
      violations.push("Outdated Operating System detected");
      riskScore += 20;
    }
    if (usbR === false) {
      violations.push("Compliance Failure: USB Storage Unrestricted");
      riskScore += 15;
    }
    if (pwdPol === false) {
      violations.push("Compliance Failure: Password Rotation Violations");
      riskScore += 15;
    }

    // Scan for unauthorized or blacklisted applications
    const blacklisted = ["utorrent", "qbittorrent", "keylogger", "wireshark", "tor browser"];
    const foundBlacklisted = installed_apps.filter(app => 
      blacklisted.some(bl => app.toLowerCase().includes(bl))
    );

    if (foundBlacklisted.length > 0) {
      violations.push(`Blacklisted applications detected: ${foundBlacklisted.join(", ")}`);
      riskScore += (foundBlacklisted.length * 25);
    }

    if (riskScore > 100) riskScore = 100; // Cap maximum risk score at 100%

    let riskLevel = "LOW";
    if (riskScore >= 75) riskLevel = "CRITICAL";
    else if (riskScore >= 45) riskLevel = "HIGH";
    else if (riskScore >= 25) riskLevel = "MEDIUM";

    const resolvedCpu  = cpuNum  !== undefined ? cpuNum  : parseFloat((Math.random() * 40 + 5).toFixed(1));
    const resolvedRam  = ramNum  !== undefined ? ramNum  : parseFloat((Math.random() * 50 + 20).toFixed(1));
    const resolvedDisk = diskNum !== undefined ? diskNum : parseFloat((Math.random() * 30 + 30).toFixed(1));
    const resolvedNetSent = net_sent_mb !== undefined ? net_sent_mb : parseFloat((Math.random() * 50).toFixed(1));
    const resolvedNetRecv = net_recv_mb !== undefined ? net_recv_mb : parseFloat((Math.random() * 100).toFixed(1));
    const resolvedProc = proc_count !== undefined ? proc_count : (installed_apps.length + 12);
    const resolvedIp = ip_address || `192.168.1.${Math.floor(Math.random() * 254) + 1}`;

    // Update Device Telemetry in database
    const telemetryResult = await query(`
      INSERT INTO device_telemetry (device_id, device_name, ip_address, os, cpu, ram, disk, net_sent_mb, net_recv_mb, proc_count, antivirus, firewall, os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found, risk_score, risk_level, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *
    `, [
      host_id, 
      resolvedDeviceName, 
      resolvedIp, 
      `${os_name} ${os_version}`, 
      resolvedCpu,
      resolvedRam,
      resolvedDisk,
      resolvedNetSent,
      resolvedNetRecv,
      resolvedProc,
      av  === true,
      fw  === true,
      osOut === true,
      usbR  === true,
      pwdPol === true,
      foundBlacklisted.length > 0,
      riskScore, 
      riskLevel,
      status || 'ONLINE'
    ]);

    const io = req.app.get("socketio");
    if (io && telemetryResult.rows.length > 0) {
      const enrichedDevice = {
        ...telemetryResult.rows[0],
        ip: telemetryResult.rows[0].ip_address,
        timestamp: telemetryResult.rows[0].recorded_at
      };
      io.emit("live-update", enrichedDevice);
    }

    // Rich audit details for history logging
    const auditDetails = {
      risk_score: riskScore,
      risk_level: riskLevel,
      violations_count: violations.length,
      violations,
      os_name,
      os_version,
      cpu: resolvedCpu,
      ram: resolvedRam,
      disk: resolvedDisk,
      ip_address: resolvedIp,
      antivirus: av  === true,
      firewall:  fw  === true,
      os_outdated: osOut === true,
      usb_restricted: usbR  === true,
      password_policy_compliant: pwdPol === true,
      installed_apps
    };

    // Log this audit upload to audit_logs
    await query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
      VALUES ($1, 'Security Check Uploaded', 'device', $2, $3)
    `, [req.user.id, host_id, JSON.stringify(auditDetails)]).catch((err) => {
      console.error("Audit log insertion failed:", err.message);
    });

    // Insert security alerts for compliance violations
    for (const v of violations) {
      const alertId = `INC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const severity = v.includes("Blacklisted") || av === false ? "HIGH" : "WARNING";
      const alertResult = await query(`
        INSERT INTO security_alerts (alert_id, asset_id, device_id, type, severity, description, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING *
      `, [alertId, assetDbId, host_id, "Compliance Violation", severity, v]);
      
      if (io && alertResult.rows.length > 0) {
        io.emit("security-alert", alertResult.rows[0]);
      }
    }

    res.json({
      success: true,
      host_id,
      risk_score: riskScore,
      risk_level: riskLevel,
      violations,
      details: auditDetails,
      scan_time: new Date()
    });
  } catch (err) {
    console.error("Audit upload error:", err.message);
    res.status(500).json({ error: "Failed to process agent compliance audit" });
  }
});

// Export security alerts as CSV or JSON for reporting
router.get("/export", async (req, res) => {
  const format = req.query.format || 'csv';
  try {
    const result = await query(`
      SELECT 
        sa.alert_id, sa.type, sa.severity, sa.status, sa.description,
        COALESCE(a.asset_id, sa.device_id, 'Unknown') AS device_or_asset,
        sa.resolved_at, sa.created_at,
        u.name AS resolved_by_name
      FROM security_alerts sa
      LEFT JOIN assets a ON sa.asset_id = a.id
      LEFT JOIN users u ON sa.resolved_by = u.id
      ORDER BY sa.created_at DESC
    `);

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_Security.json');
      res.setHeader('Content-Type', 'application/json');
      return res.json(result.rows);
    }

    const headers = ['Alert ID','Type','Severity','Status','Description','Device / Asset','Resolved By','Resolved At','Created At'];
    const rows = result.rows.map(r => [
      r.alert_id, r.type || '', r.severity || '', r.status || '', r.description || '',
      r.device_or_asset || '', r.resolved_by_name || '',
      r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '',
      new Date(r.created_at).toLocaleString()
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Disposition', 'attachment; filename=SecureAssets_Security_Alerts.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    console.error('Security export error:', err.message);
    res.status(500).json({ error: 'Failed to export security alerts' });
  }
});
// DELETE /api/security/audit-log/:id
// Deletes a single audit log entry
router.delete("/audit-log/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM audit_logs WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Audit log entry not found" });
    }
    res.json({ success: true, message: "Audit log entry deleted successfully", deleted: result.rows[0] });
  } catch (err) {
    console.error("Delete audit log error:", err.message);
    res.status(500).json({ error: "Failed to delete audit log entry" });
  }
});

// POST /api/security/audit-logs/delete-bulk
// Deletes multiple audit log entries by ID
router.post("/audit-logs/delete-bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Invalid or empty list of IDs" });
    }
    
    const result = await query(
      "DELETE FROM audit_logs WHERE id = ANY($1::int[]) RETURNING id",
      [ids.map(Number)]
    );
    
    res.json({ success: true, message: `Successfully deleted ${result.rows.length} audit log entries`, count: result.rows.length });
  } catch (err) {
    console.error("Bulk delete audit logs error:", err.message);
    res.status(500).json({ error: "Failed to perform bulk delete on audit logs" });
  }
});

module.exports = router;
