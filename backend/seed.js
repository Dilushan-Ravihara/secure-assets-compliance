const { query } = require("./db/database");

async function seedData() {
  console.log("Seeding temporary data...");

  try {
    // Insert 10 employees
    for (let i = 1; i <= 10; i++) {
      await query(`
        INSERT INTO employees (employee_id, name, email, department, location)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (employee_id) DO NOTHING;
      `, [`EMP-${1000 + i}`, `Employee ${i}`, `emp${i}@company.com`, ['IT', 'HR', 'Finance', 'Engineering'][i % 4], ['Colombo', 'Kandy', 'Galle'][i % 3]]);
    }

    // Fetch employee IDs
    const empRes = await query(`SELECT id FROM employees LIMIT 10`);
    const empIds = empRes.rows.map(row => row.id);

    // Insert 20 assets
    for (let i = 1; i <= 20; i++) {
      const assetId = `AST-${2000 + i}`;
      const brand = ['Dell', 'HP', 'Lenovo', 'Apple'][i % 4];
      const model = ['Latitude', 'EliteBook', 'ThinkPad', 'MacBook'][i % 4];
      const category = ['Laptop', 'Desktop', 'Server', 'Monitor'][i % 4];
      const status = ['in_use', 'available', 'repair'][i % 3];
      const condition = ['good', 'fair', 'poor'][i % 3];
      const purchaseCost = Math.floor(Math.random() * 2000) + 500;
      const location = ['Colombo', 'Kandy', 'Galle'][i % 3];
      const assignedTo = empIds[i % empIds.length];

      // purchase date between 1 and 4 years ago
      const purchaseDate = new Date(Date.now() - (1 + Math.floor(Math.random() * 3)) * 365 * 24 * 60 * 60 * 1000);

      await query(`
        INSERT INTO assets (asset_id, serial_number, brand, model, category, status, condition, purchase_cost, purchase_date, location, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (asset_id) DO NOTHING;
      `, [assetId, `SN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`, brand, model, category, status, condition, purchaseCost, purchaseDate, location, assignedTo]);

      // Seed baseline telemetry for the asset
      const telCheck = await query(`SELECT COUNT(*) FROM device_telemetry WHERE device_id = $1`, [assetId]);
      if (parseInt(telCheck.rows[0].count) === 0) {
        const riskScore = Math.floor(Math.random() * 40); // 0-40 low risk
        const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
        const lat = 6.9271 + (Math.random() * 0.06 - 0.03);
        const lon = 79.8612 + (Math.random() * 0.06 - 0.03);
        const ip = `192.168.10.${100 + i}`;
        const os = brand === 'Apple' ? 'macOS Sequoia 15.0' : ['Windows 11 Pro', 'Windows 10 Enterprise', 'Ubuntu 22.04 LTS'][i % 3];
        const deviceName = `${brand} ${model}`;
        
        await query(`
          INSERT INTO device_telemetry
            (device_id, device_name, ip_address, os, cpu, ram, disk,
             net_sent_mb, net_recv_mb, proc_count, antivirus, firewall,
             os_outdated, usb_restricted, password_policy_compliant, unauthorized_software_found,
             risk_score, risk_level, status, recorded_at, latitude, longitude)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, true, true, false, $13, $14, 'ONLINE', NOW(), $15, $16)
        `, [
          assetId,
          deviceName,
          ip,
          os,
          Math.floor(10 + Math.random() * 30), // cpu
          Math.floor(25 + Math.random() * 30), // ram
          Math.floor(20 + Math.random() * 50), // disk
          parseFloat((Math.random() * 5).toFixed(2)), // net_sent_mb
          parseFloat((Math.random() * 25).toFixed(2)), // net_recv_mb
          Math.floor(30 + Math.random() * 50), // proc_count
          brand !== 'Apple', // antivirus
          true, // firewall
          riskScore,
          riskLevel,
          lat,
          lon
        ]);
      }
    }

    // Insert Maintenance Logs
    const assetRes = await query(`SELECT id FROM assets LIMIT 10`);
    const assetIds = assetRes.rows.map(row => row.id);

    for (let i = 1; i <= 5; i++) {
      await query(`
        INSERT INTO maintenance_logs (ticket_id, asset_id, title, description, status, priority, cost)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (ticket_id) DO NOTHING;
      `, [
        `TKT-${3000 + i}`,
        assetIds[i % assetIds.length],
        ['Hardware Replacement', 'Software Update', 'Network Repair'][i % 3],
        `Issue description ${i}`,
        ['pending', 'in_progress', 'completed'][i % 3],
        ['low', 'medium', 'high', 'critical'][i % 4],
        Math.floor(Math.random() * 500)
      ]);
    }

    // Insert Security Alerts
    for (let i = 1; i <= 8; i++) {
      await query(`
        INSERT INTO security_alerts (alert_id, asset_id, device_id, type, severity, description, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (alert_id) DO NOTHING;
      `, [
        `INC-${4000 + i}`,
        assetIds[i % assetIds.length],
        `DEV-${5000 + i}`,
        ['Malware Detected', 'Unauthorized Access', 'Data Leak', 'DDoS Attack'][i % 4],
        ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][i % 4],
        `Security incident details ${i}`,
        ['open', 'investigating', 'resolved'][i % 3]
      ]);
    }

    // Insert Compliance Policies
    const policies = [
      { name: 'Endpoint Antivirus Active', description: 'Ensure all devices have active EDR/AV protection', category: 'Endpoint Security', is_active: true },
      { name: 'OS Patch Management', description: 'Verify operating systems are within 14 days of latest patch', category: 'Patch Management', is_active: true },
      { name: 'Unauthorized Software Check', description: 'Scan for blacklisted applications or portable executables', category: 'Software Auditing', is_active: true },
      { name: 'Password Rotation Policy', description: 'Enforce 90-day password changes and 2FA authentication', category: 'Identity Access Management', is_active: true },
      { name: 'USB Storage Restriction', description: 'Block unauthorized USB mass storage devices', category: 'Data Loss Prevention', is_active: true },
      { name: 'Firewall Ingress Rules', description: 'Ensure default deny incoming traffic on all workstations', category: 'Network Security', is_active: true }
    ];

    for (const policy of policies) {
      await query(`
        INSERT INTO compliance_policies (name, description, category, is_active)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING;
      `, [policy.name, policy.description, policy.category, policy.is_active]);
    }

    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding error:", err);
    process.exit(1);
  }
}

seedData();
