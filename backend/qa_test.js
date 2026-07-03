// backend/qa_test.js
// Automated QA checkup suite for database, schema, and API services

const { Pool } = require("pg");
const http = require("http");
require("dotenv").config();

// Color helpers
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "secureassets_db",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "",
});

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
            rawBody: data
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: null,
            rawBody: data
          });
        }
      });
    });

    req.on("error", (err) => { reject(err); });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runQA() {
  console.log(cyan("\n============================================="));
  console.log(cyan("   🔐 SECUREASSETS AUTOMATED QA CHECKUP  "));
  console.log(cyan("============================================="));

  let dbConnectionOk = false;
  let client;

  // 1. PostgreSQL Connection Test
  try {
    client = await pool.connect();
    console.log(`[${green("PASS")}] Database connection established successfully.`);
    dbConnectionOk = true;
  } catch (err) {
    console.log(`[${red("FAIL")}] Database connection failed: ${err.message}`);
  }

  if (!dbConnectionOk) {
    console.log(red("\nDatabase is offline. Aborting further database tests."));
    process.exit(1);
  }

  // 2. Schema Table Audit
  const tables = [
    "users", "employees", "assets", "security_alerts", 
    "device_telemetry", "maintenance_logs", "compliance_policies",
    "network_lockdowns", "audit_logs", "cve_vulnerabilities"
  ];

  console.log(yellow("\n--- Database Schema Table Check ---"));
  for (const table of tables) {
    try {
      const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`[${green("PASS")}] Table '${cyan(table)}' exists. Count: ${res.rows[0].count}`);
    } catch (err) {
      console.log(`[${red("FAIL")}] Table '${table}' check failed: ${err.message}`);
    }
  }

  client.release();

  // 3. API Service Check (hitting locally running port 5000)
  const port = process.env.PORT || 5000;
  console.log(yellow(`\n--- Local Express API Endpoints Check (Port: ${port}) ---`));

  // Health check
  try {
    const health = await makeRequest({
      hostname: "localhost",
      port: port,
      path: "/health",
      method: "GET"
    });
    if (health.statusCode === 200 && health.body && health.body.status === "ok") {
      console.log(`[${green("PASS")}] GET /health operational.`);
    } else {
      console.log(`[${red("FAIL")}] GET /health failed status: ${health.statusCode}`);
    }
  } catch (err) {
    console.log(`[${red("FAIL")}] GET /health connection error: ${err.message}`);
  }

  // Seed demo users
  try {
    const seed = await makeRequest({
      hostname: "localhost",
      port: port,
      path: "/api/auth/seed-demo",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {});
    if (seed.statusCode === 200) {
      console.log(`[${green("PASS")}] POST /api/auth/seed-demo successfully triggered users check.`);
    } else {
      console.log(`[${red("FAIL")}] POST /api/auth/seed-demo status: ${seed.statusCode}`);
    }
  } catch (err) {
    console.log(`[${red("FAIL")}] POST /api/auth/seed-demo connection error: ${err.message}`);
  }

  // Authenticate (Login Admin)
  let token = "";
  try {
    const login = await makeRequest({
      hostname: "localhost",
      port: port,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      email: "admin@company.com",
      password: "admin123"
    });

    if (login.statusCode === 200 && login.body && login.body.token) {
      token = login.body.token;
      console.log(`[${green("PASS")}] POST /api/auth/login successful. JWT Token acquired.`);
    } else {
      console.log(`[${red("FAIL")}] POST /api/auth/login failed: ${login.body ? login.body.error : "Unknown error"}`);
    }
  } catch (err) {
    console.log(`[${red("FAIL")}] POST /api/auth/login connection error: ${err.message}`);
  }

  // Authorized endpoint checks
  if (token) {
    const endpoints = [
      { name: "Assets List", path: "/api/assets", method: "GET" },
      { name: "Employees List", path: "/api/employees", method: "GET" },
      { name: "Security Alerts", path: "/api/security/alerts", method: "GET" },
      { name: "Dashboard Stats", path: "/api/dashboard/stats", method: "GET" },
      { name: "Maintenance Logs", path: "/api/maintenance", method: "GET" },
      { name: "Latest Telemetry", path: "/api/telemetry/latest", method: "GET" },
      { name: "Asset CSV Export", path: "/api/assets/export?format=csv", method: "GET" },
      { name: "Security CSV Export", path: "/api/security/export?format=csv", method: "GET" },
      { name: "Maintenance CSV Export", path: "/api/maintenance/export?format=csv", method: "GET" },
      { name: "Telemetry CSV Export", path: "/api/telemetry/export?format=csv", method: "GET" }
    ];

    console.log(yellow("\n--- Authenticated Route Auditing ---"));
    for (const ep of endpoints) {
      try {
        const res = await makeRequest({
          hostname: "localhost",
          port: port,
          path: ep.path,
          method: ep.method,
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (res.statusCode === 200) {
          console.log(`[${green("PASS")}] ${ep.method} ${ep.path} returned 200 OK.`);
        } else {
          console.log(`[${red("FAIL")}] ${ep.method} ${ep.path} failed with code ${res.statusCode}.`);
        }
      } catch (err) {
        console.log(`[${red("FAIL")}] ${ep.method} ${ep.path} connection error: ${err.message}`);
      }
    }
    // Fetch a sample employee and available asset from database directly to run allocation test
    let testEmpId = null;
    let testAssetDbId = null;
    try {
      const dbClient = await pool.connect();
      const empRes = await dbClient.query("SELECT id FROM employees LIMIT 1");
      const assetRes = await dbClient.query("SELECT id FROM assets WHERE status = 'available' LIMIT 1");
      dbClient.release();

      if (empRes.rows.length > 0) testEmpId = empRes.rows[0].id;
      if (assetRes.rows.length > 0) testAssetDbId = assetRes.rows[0].id;
    } catch (dbErr) {
      console.log(`[${red("FAIL")}] DB lookup for allocation testing failed: ${dbErr.message}`);
    }

    if (testEmpId && testAssetDbId) {
      console.log(yellow("\n--- Allocation API Endpoint Check ---"));
      
      // Test Allocation
      try {
        const allocRes = await makeRequest({
          hostname: "localhost",
          port: port,
          path: `/api/employees/${testEmpId}/allocate`,
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }, { assetDbId: testAssetDbId });

        if (allocRes.statusCode === 200) {
          console.log(`[${green("PASS")}] POST /api/employees/:id/allocate returned 200 OK.`);
        } else {
          console.log(`[${red("FAIL")}] POST /api/employees/:id/allocate failed with code ${allocRes.statusCode}.`);
        }
      } catch (err) {
        console.log(`[${red("FAIL")}] POST /api/employees/:id/allocate connection error: ${err.message}`);
      }

      // Test Deallocation
      try {
        const deallocRes = await makeRequest({
          hostname: "localhost",
          port: port,
          path: `/api/employees/${testEmpId}/deallocate`,
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }, { assetDbId: testAssetDbId });

        if (deallocRes.statusCode === 200) {
          console.log(`[${green("PASS")}] POST /api/employees/:id/deallocate returned 200 OK.`);
        } else {
          console.log(`[${red("FAIL")}] POST /api/employees/:id/deallocate failed with code ${deallocRes.statusCode}.`);
        }
      } catch (err) {
        console.log(`[${red("FAIL")}] POST /api/employees/:id/deallocate connection error: ${err.message}`);
      }
    } else {
      console.log(yellow("\n[SKIP] Allocation endpoints check bypassed (no available test employee or asset in DB)."));
    }
  }

  console.log(cyan("\n============================================="));
  console.log(cyan("            QA VERIFICATION COMPLETE         "));
  console.log(cyan("=============================================\n"));
  
  pool.end();
}

runQA();
