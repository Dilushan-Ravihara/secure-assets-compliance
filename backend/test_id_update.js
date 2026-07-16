const { Pool } = require('pg');
require('dotenv').config({ path: 'c:/Users/Dilushan/Desktop/Project/backend/.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'secureassets_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'dilu2003'
});

async function run() {
  console.log("Creating test asset 'TEST-RENAME-01'...");
  await pool.query("INSERT INTO assets (asset_id, serial_number, brand, model, category, status) VALUES ('TEST-RENAME-01', 'SN-RENAME-999', 'Dell', 'Precision', 'Laptop', 'in_use') ON CONFLICT DO NOTHING;");
  
  console.log("Creating mock telemetry for 'TEST-RENAME-01'...");
  await pool.query("INSERT INTO device_telemetry (device_id, device_name, serial_number, status) VALUES ('TEST-RENAME-01', 'Dell Precision', 'SN-RENAME-999', 'ONLINE');");
  
  console.log("Updating asset ID to 'TEST-RENAME-NEW' via queries...");
  const oldId = 'TEST-RENAME-01';
  const newId = 'TEST-RENAME-NEW';
  
  // 1. Update dependent tables
  await pool.query("UPDATE device_telemetry SET device_id = $1 WHERE device_id = $2", [newId, oldId]);
  
  // 2. Update assets table
  await pool.query("UPDATE assets SET asset_id = $1 WHERE asset_id = $2", [newId, oldId]);
  
  console.log("Verifying updates in database...");
  const assetRes = await pool.query("SELECT * FROM assets WHERE asset_id = 'TEST-RENAME-NEW';");
  console.log("Assets count with new ID:", assetRes.rows.length);
  
  const telemetryRes = await pool.query("SELECT * FROM device_telemetry WHERE device_id = 'TEST-RENAME-NEW';");
  console.log("Telemetry count with new ID:", telemetryRes.rows.length);
  
  // Cleanup
  await pool.query("DELETE FROM device_telemetry WHERE device_id IN ('TEST-RENAME-01', 'TEST-RENAME-NEW');");
  await pool.query("DELETE FROM assets WHERE asset_id IN ('TEST-RENAME-01', 'TEST-RENAME-NEW');");
  
  console.log("Cleanup complete!");
  process.exit(0);
}

run().catch(console.error);
