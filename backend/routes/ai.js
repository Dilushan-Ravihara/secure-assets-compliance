// backend/routes/ai.js
const express = require("express");
const { query } = require("../db/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// GET /api/ai/predictions
// Analyzes the latest telemetry of active devices to generate recommendations, fleet health score, etc.
router.get("/predictions", async (req, res) => {
  try {
    // Get the latest telemetry for all active devices
    const telemetryRes = await query(`
      SELECT DISTINCT ON (device_id) *
      FROM device_telemetry
      ORDER BY device_id, recorded_at DESC
    `);
    
    const devices = telemetryRes.rows;
    
    let totalRisk = 0;
    let onlineCount = 0;
    let criticalCount = 0;
    let warningCount = 0;
    const recommendations = [];
    
    // We determine if a device is online using the 35 seconds threshold
    const OFFLINE_MS = 35000;
    const now = Date.now();
    
    devices.forEach(dev => {
      const isOnline = (now - new Date(dev.recorded_at).getTime()) < OFFLINE_MS && dev.status !== 'OFFLINE';
      if (isOnline) {
        onlineCount++;
        totalRisk += dev.risk_score;
        
        // Generate AI-driven recommendations based on actual device telemetry metrics
        if (dev.disk > 80) {
          recommendations.push({
            title: `Expand Storage / Defragment Disk on ${dev.device_id}`,
            severity: dev.disk > 90 ? 'Critical' : 'Warning',
            desc: `Disk space on ${dev.device_name || dev.device_id} is at ${dev.disk}%. Clean up temporary files or upgrade capacity.`,
            asset_code: dev.device_id,
            impact: 'System degradation, failing write operations, log truncation, and OS paging files choke.',
            mitigation: '1. Run Windows Disk Cleanup (cleanmgr.exe) or command line "rm -rf /tmp/*".\n2. Locate large unneeded log file directories.\n3. Expand VM virtual disk capacity in hypervisor or install larger storage media.'
          });
        }
        
        if (dev.cpu > 80) {
          recommendations.push({
            title: `CPU Throttle Check on ${dev.device_id}`,
            severity: dev.cpu > 90 ? 'Critical' : 'Warning',
            desc: `High processor utilization (${dev.cpu}%) detected on ${dev.device_name || dev.device_id}. Inspect rogue system tasks.`,
            asset_code: dev.device_id,
            impact: 'Severe application lag, kernel locking, temperature spikes, and thermal throttling bottleneck.',
            mitigation: '1. Launch task manager or run "top" to check process threads.\n2. Terminate unresponsive parent PID processes.\n3. Validate processor core fan speed and reapply hardware thermal paste.'
          });
        }
        
        if (dev.ram > 80) {
          recommendations.push({
            title: `Memory Optimization for ${dev.device_id}`,
            severity: dev.ram > 90 ? 'Critical' : 'Warning',
            desc: `Memory footprint is at ${dev.ram}%. Consider RAM upgrade or closing background telemetry processes.`,
            asset_code: dev.device_id,
            impact: 'Out of memory crashes, OS swap space thrashing, and database connection timeouts.',
            mitigation: '1. Identify memory leaks in application heap size settings.\n2. Stop unused heavy background services.\n3. Upgrade physical RAM capacity or adjust pagefile paging parameters.'
          });
        }
        
        if (!dev.antivirus) {
          recommendations.push({
            title: `Activate Antivirus Guard on ${dev.device_id}`,
            severity: 'Critical',
            desc: `Antivirus protection is inactive on ${dev.device_name || dev.device_id}. Immediate malware risk.`,
            asset_code: dev.device_id,
            impact: 'Ransomware deployment, credential harvesting, Trojan backdoors, and data extraction vulnerabilities.',
            mitigation: '1. Enable Windows Defender via Settings panel.\n2. Start EDR background daemon: cmd "net start WinDefend".\n3. Execute custom full scan to clean cached local downloads.'
          });
        }
        
        if (!dev.firewall) {
          recommendations.push({
            title: `Configure Network Firewall on ${dev.device_id}`,
            severity: 'Warning',
            desc: `Local firewall is turned off on ${dev.device_name || dev.device_id}. Vulnerable to unsolicited traffic.`,
            asset_code: dev.device_id,
            impact: 'Port scanning exploits, unauthorized network ingress pathways, and pivot point vulnerability.',
            mitigation: '1. Restore default firewall rules profile.\n2. Start firewall cmd "netsh advfirewall set allprofiles state on".\n3. Block ingress requests on administrative database ports (1433, 5432).'
          });
        }
        
        if (dev.os_outdated) {
          recommendations.push({
            title: `System Software Update on ${dev.device_id}`,
            severity: 'Warning',
            desc: `Operating System software patches are out of date on ${dev.device_name || dev.device_id}. Apply updates.`,
            asset_code: dev.device_id,
            impact: 'Active exploitation of known OS kernel vulnerability CVEs, privilege escalations, and audit failure.',
            mitigation: '1. Connect to corporate WSUS update server.\n2. Execute patch installs: cmd "UsoClient StartScan".\n3. Schedule mandatory reboot during off-peak maintenance hours.'
          });
        }

        // Always add dynamic, high-detail Info recommendations for each active device
        recommendations.push({
          title: `Credential Rotation Audit on ${dev.device_id}`,
          severity: 'Info',
          desc: `Check local user accounts rotation rules on ${dev.device_name || dev.device_id}. Require 90-day password changes.`,
          asset_code: dev.device_id,
          impact: 'Brute-force exposure and legacy user credentials reuse across corporate platforms.',
          mitigation: '1. Configure Local Group Policy Object password aging settings.\n2. Enforce complexity constraints (uppercase, special character, min 12 chars).\n3. Enable account lockout policies after 5 invalid attempts.'
        });

        recommendations.push({
          title: `Inactive NIC Deactivation on ${dev.device_id}`,
          severity: 'Info',
          desc: `Inspect inactive network adapters list on ${dev.device_name || dev.device_id}. Turn off unused virtual adapters.`,
          asset_code: dev.device_id,
          impact: 'Unmonitored network pathways bypassing main firewall perimeter routing rules.',
          mitigation: '1. Open adapter settings (ncpa.cpl).\n2. Right-click and disable inactive adapters (e.g. Host-Only interfaces).\n3. Audit network routes list via cmd "route print".'
        });
        
        if (dev.risk_score >= 70) {
          criticalCount++;
        } else if (dev.risk_score >= 40) {
          warningCount++;
        }
      }
    });
    
    // Default recommendations if no dynamic ones are found
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Proactive Security Audits",
        severity: "Info",
        desc: "All installed systems are performing nominally. Schedule standard weekly security audits.",
        asset_code: "N/A",
        impact: "None currently identified.",
        mitigation: "Continue routine log reviews and schedule automated compliance sweeps twice a week."
      });
    }
    
    // Calculate Fleet Health Score
    // If no online devices, baseline to 100%
    const avgRisk = onlineCount > 0 ? (totalRisk / onlineCount) : 0;
    const fleetHealth = Math.max(0, Math.round(100 - avgRisk));
    
    res.json({
      fleetHealth,
      onlineCount,
      totalCount: devices.length,
      predictedFailures: criticalCount,
      warningDevices: warningCount,
      optimalDevices: Math.max(0, onlineCount - criticalCount - warningCount),
      recommendations
    });
    
  } catch (err) {
    console.error("AI Predictions error:", err.message);
    res.status(500).json({ error: "Failed to generate AI predictions" });
  }
});

// GET /api/ai/degradation/:deviceId
// Returns historical and predicted degradation values
router.get("/degradation/:deviceId", async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    // Get historical telemetry data for this device
    const historyRes = await query(`
      SELECT cpu, ram, disk, risk_score, recorded_at
      FROM device_telemetry
      WHERE device_id = $1
      ORDER BY recorded_at DESC
      LIMIT 10
    `, [deviceId]);
    
    const history = historyRes.rows.reverse();
    
    // If no history, return basic mock curve
    if (history.length === 0) {
      return res.json({
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun (Pred)', 'Jul (Pred)', 'Aug (Pred)'],
        values: [100, 100, 100, 100, 100, 100, 100, 100]
      });
    }
    
    // We will generate an 8-step data curve: 5 actual / recent data points + 3 predicted points
    const healthValues = history.map(h => {
      const score = Math.max(0, 100 - h.risk_score);
      return Math.round(score);
    });
    
    // Keep at most last 5 values for the historic side
    const actuals = healthValues.slice(-5);
    while (actuals.length < 5) {
      // pad with first value if history is short
      actuals.unshift(actuals[0] || 100);
    }
    
    // Generate prediction steps (3 steps) projecting degradation based on latest trend
    const lastVal = actuals[actuals.length - 1];
    const secondLastVal = actuals[actuals.length - 2] || lastVal;
    
    // calculate a basic rate of change
    const delta = lastVal - secondLastVal;
    const rate = delta < 0 ? delta : -2; // default slight degradation
    
    const pred1 = Math.max(10, Math.round(lastVal + rate));
    const pred2 = Math.max(10, Math.round(pred1 + rate * 1.5));
    const pred3 = Math.max(5, Math.round(pred2 + rate * 2));
    
    const allValues = [...actuals, pred1, pred2, pred3];
    
    // Generate label months
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIdx = new Date().getMonth();
    
    const labels = [];
    for (let i = -4; i <= 3; i++) {
      const idx = (currentMonthIdx + i + 12) % 12;
      const isPred = i > 0;
      labels.push(months[idx] + (isPred ? ' (Pred)' : ''));
    }
    
    res.json({
      labels,
      values: allValues
    });
    
  } catch (err) {
    console.error("Degradation error:", err.message);
    res.status(500).json({ error: "Failed to generate degradation forecast" });
  }
});

module.exports = router;
