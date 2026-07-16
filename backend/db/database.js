// backend/db/database.js
// PostgreSQL connection pool + schema initializer

const { Pool } = require("pg");
require("dotenv").config();

// Connection pool for Postgres. We read details from .env, otherwise use defaults.
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "secureassets_db",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "",
  max: 20, // max 20 connections in the pool
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail if connection takes more than 5s
});

// Log any sudden database errors in the pool
pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err.message);
});

// Helper to check if the database is running and reachable
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected successfully");
    client.release();
    return true;
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    return false;
  }
}

// Creates tables and seeds initial data if they aren't already set up
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); // use a transaction to avoid half-created setups

    // ── USERS ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        email       VARCHAR(150) UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        role        VARCHAR(50) NOT NULL DEFAULT 'viewer',
        department  VARCHAR(100),
        is_active   BOOLEAN DEFAULT true,
        two_factor_secret VARCHAR(100),
        is_2fa_enabled BOOLEAN DEFAULT false,
        last_login  TIMESTAMP,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── EMPLOYEES ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id             SERIAL PRIMARY KEY,
        employee_id    VARCHAR(50) UNIQUE NOT NULL,
        name           VARCHAR(150) NOT NULL,
        email          VARCHAR(150) UNIQUE,
        phone          VARCHAR(30),
        department     VARCHAR(100),
        designation    VARCHAR(100),
        location       VARCHAR(100),
        is_active      BOOLEAN DEFAULT true,
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── ASSETS ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id              SERIAL PRIMARY KEY,
        asset_id        VARCHAR(50) UNIQUE NOT NULL,
        serial_number   VARCHAR(100) UNIQUE,
        brand           VARCHAR(100),
        model           VARCHAR(100),
        category        VARCHAR(100),
        status          VARCHAR(50) DEFAULT 'available',
        condition       VARCHAR(50) DEFAULT 'good',
        location        VARCHAR(150),
        notes           TEXT,
        assigned_to     INT REFERENCES employees(id) ON DELETE SET NULL,
        created_by      INT REFERENCES users(id),
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── SECURITY ALERTS ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS security_alerts (
        id          SERIAL PRIMARY KEY,
        alert_id    VARCHAR(50) UNIQUE NOT NULL,
        device_id   VARCHAR(100),
        asset_id    INT REFERENCES assets(id) ON DELETE SET NULL,
        type        VARCHAR(100) NOT NULL,
        severity    VARCHAR(30) NOT NULL,
        description TEXT,
        status      VARCHAR(50) DEFAULT 'open',
        resolved_by INT REFERENCES users(id),
        resolved_at TIMESTAMP,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── DEVICE NOTES ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_notes (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(100) NOT NULL,
        note TEXT NOT NULL,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── DEVICE TELEMETRY ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_telemetry (
        id           SERIAL PRIMARY KEY,
        device_id    VARCHAR(100) NOT NULL,
        device_name  VARCHAR(100),
        serial_number VARCHAR(100),
        ip_address   VARCHAR(45),
        os           TEXT,
        cpu          DECIMAL(5,2),
        ram          DECIMAL(5,2),
        disk         DECIMAL(5,2),
        net_sent_mb  DECIMAL(10,2),
        net_recv_mb  DECIMAL(10,2),
        proc_count   INT,
        antivirus    BOOLEAN DEFAULT true,
        firewall     BOOLEAN DEFAULT true,
        os_outdated  BOOLEAN DEFAULT false,
        usb_restricted BOOLEAN DEFAULT true,
        password_policy_compliant BOOLEAN DEFAULT true,
        unauthorized_software_found BOOLEAN DEFAULT false,
        risk_score   INT DEFAULT 0,
        risk_level   VARCHAR(20) DEFAULT 'LOW',
        status       VARCHAR(20) DEFAULT 'ONLINE',
        latitude     DECIMAL(9,6),
        longitude    DECIMAL(9,6),
        recorded_at  TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_device ON device_telemetry(device_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_time   ON device_telemetry(recorded_at DESC);
    `);



    // ── MAINTENANCE LOGS ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_logs (
        id           SERIAL PRIMARY KEY,
        ticket_id    VARCHAR(50) UNIQUE NOT NULL,
        asset_id     INT REFERENCES assets(id) ON DELETE CASCADE,
        title        VARCHAR(200) NOT NULL,
        description  TEXT,
        priority     VARCHAR(30) DEFAULT 'medium',
        status       VARCHAR(50) DEFAULT 'pending',
        assigned_to  INT REFERENCES employees(id) ON DELETE SET NULL,
        cost         DECIMAL(12,2),
        completed_at TIMESTAMP,
        created_by   INT REFERENCES users(id),
        created_at   TIMESTAMP DEFAULT NOW(),
        updated_at   TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── COMPLIANCE POLICIES ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_policies (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(200) NOT NULL,
        description TEXT,
        category    VARCHAR(100),
        is_active   BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── NETWORK LOCKDOWNS ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS network_lockdowns (
        id          SERIAL PRIMARY KEY,
        zone        VARCHAR(100) UNIQUE NOT NULL,
        status      VARCHAR(50) DEFAULT 'nominal',
        updated_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── AUDIT LOGS ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          SERIAL PRIMARY KEY,
        user_id     INT REFERENCES users(id),
        action      VARCHAR(200) NOT NULL,
        entity      VARCHAR(100),
        entity_id   VARCHAR(100),
        details     JSONB,
        ip_address  VARCHAR(45),
        created_at  TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);
    `);

    // ── CVE VULNERABILITIES ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS cve_vulnerabilities (
        id          SERIAL PRIMARY KEY,
        cve_id      VARCHAR(50) UNIQUE NOT NULL,
        title       VARCHAR(200) NOT NULL,
        os_name     VARCHAR(100) NOT NULL,
        os_version  VARCHAR(100) NOT NULL,
        severity    VARCHAR(30) NOT NULL,
        description TEXT NOT NULL,
        mitigation  TEXT NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed some mock CVE vulnerabilities if we don't have any yet
    const cveCheck = await client.query("SELECT COUNT(*) FROM cve_vulnerabilities");
    if (parseInt(cveCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO cve_vulnerabilities (cve_id, title, os_name, os_version, severity, description, mitigation) VALUES
        ('CVE-2023-38606', 'Kernel State Corruption Vulnerability', 'macOS', 'Sequoia (15.x) or older', 'CRITICAL', 'Allows an application to modify sensitive kernel states. Exploited in the wild.', 'Apply macOS Sequoia 15.1 update or disable third-party kernel extensions.'),
        ('CVE-2024-21626', 'runc Container Escape via File Descriptor Leak', 'Linux', 'Ubuntu 22.04 LTS or older', 'HIGH', 'Vulnerability in runc allows container breakout to host filesystem via file descriptor leak.', 'Update runc package to version 1.1.12+ or use AppArmor to restrict container accesses.'),
        ('CVE-2023-24955', 'Remote Code Execution in SharePoint Server', 'Windows', 'Windows 11 (22H2) or older', 'HIGH', 'Enables authenticated attackers to execute arbitrary code remotely on target systems.', 'Install official Microsoft cumulative updates (KB5025965) and restrict administrative ports.'),
        ('CVE-2024-3400', 'Palo Alto GlobalProtect Command Injection', 'Linux', 'Ubuntu 20.04 LTS or older', 'CRITICAL', 'Command injection vulnerability in the GlobalProtect gateway feature allows unauthenticated execution.', 'Enable Threat Prevention Signatures or disable telemetry sharing immediately.'),
        ('CVE-2024-3094', 'XZ Utils Backdoor RCE', 'Linux', 'Debian Bookworm or older', 'CRITICAL', 'Backdoor embedded in XZ liblzma compression library allows sshd authentication bypass.', 'Downgrade xz-utils to 5.4.6 or upgrade to clean upstream patches.'),
        ('CVE-2021-27561', 'FreeRTOS TCP/IP Stack Vulnerability', 'FreeRTOS', '10.4.3 or older', 'CRITICAL', 'An integer overflow vulnerability in FreeRTOS TCP/IP stack allows remote code execution via malformed packets.', 'Upgrade FreeRTOS kernel to 10.4.4+ or apply standard socket buffer bounds checking.'),
        ('CVE-2024-88888', 'Remote Device Control Bypass Vulnerability', 'Windows/Linux/macOS', 'All Versions', 'CRITICAL', 'Allows unauthorized remote control and remote command execution on targeted endpoints due to incorrect access controls in default remote access services.', 'Enforce strict VPN policies, disable non-essential remote desktop ports (e.g. RDP 3389, SSH 22, VNC 5900) or deploy Multi-Factor Authentication for remote sessions.')
      `);
    } else {
      await client.query(`
        INSERT INTO cve_vulnerabilities (cve_id, title, os_name, os_version, severity, description, mitigation)
        VALUES 
          ('CVE-2021-27561', 'FreeRTOS TCP/IP Stack Vulnerability', 'FreeRTOS', '10.4.3 or older', 'CRITICAL', 'An integer overflow vulnerability in FreeRTOS TCP/IP stack allows remote code execution via malformed packets.', 'Upgrade FreeRTOS kernel to 10.4.4+ or apply standard socket buffer bounds checking.'),
          ('CVE-2024-88888', 'Remote Device Control Bypass Vulnerability', 'Windows/Linux/macOS', 'All Versions', 'CRITICAL', 'Allows unauthorized remote control and remote command execution on targeted endpoints due to incorrect access controls in default remote access services.', 'Enforce strict VPN policies, disable non-essential remote desktop ports (e.g. RDP 3389, SSH 22, VNC 5900) or deploy Multi-Factor Authentication for remote sessions.')
        ON CONFLICT (cve_id) DO NOTHING
      `);
    }

    // Seed test assets so the user has some initial data to play with
    await client.query(`
      INSERT INTO assets (asset_id, serial_number, brand, model, category, status, condition, location)
      VALUES 
        ('AS1001', 'SN-AS1001-TEST', 'Apple', 'MacBook Pro M3', 'Laptop', 'in_use', 'good', 'Colombo Head Office'),
        ('AS1051', 'SN-AS1051-TEST', 'Dell', 'XPS 15 Developer Edition', 'Laptop', 'available', 'good', 'Kandy Lab')
      ON CONFLICT (asset_id) DO NOTHING;
    `);


    await client.query("COMMIT"); // Save all changes
    console.log("✅ All database tables initialized");

    // Run migrations to ensure columns exist on existing databases
    try {
      await client.query("ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100)").catch(() => {});
      await client.query("ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6)").catch(() => {});
      await client.query("ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6)").catch(() => {});
      await client.query("ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS usb_restricted BOOLEAN DEFAULT true").catch(() => {});
      await client.query("ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS password_policy_compliant BOOLEAN DEFAULT true").catch(() => {});
      await client.query("ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS unauthorized_software_found BOOLEAN DEFAULT false").catch(() => {});
    } catch (migErr) {
      console.warn("⚠️ Non-critical migration warning:", migErr.message);
    }
  } catch (err) {
    await client.query("ROLLBACK"); // Undo changes if something failed
    console.error("❌ Database initialization error:", err.message);
    throw err;
  } finally {
    client.release(); // release the client back to pool
  }
}

// Simple query helper so we don't have to call pool.query every time
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query, testConnection, initializeDatabase };
