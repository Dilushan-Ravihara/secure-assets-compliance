# SecureAssets Enterprise — Compliance & EDR Dashboard

An enterprise-grade Endpoint Detection and Response (EDR) and security compliance monitoring platform. The system consists of a lightweight Windows monitoring agent, an Express.js backend with PostgreSQL, and a high-performance React dashboard.

## 🚀 Key Features

*   **Real-time Telemetry:** Live streaming of CPU, RAM, disk usage, active process count, and network throughput via WebSockets.
*   **Compliance Monitoring:** Auto-evaluates system compliance metrics (Windows Defender status, firewall state, active USB storage blockages, password age policies, and detection of blacklisted software).
*   **Dynamic Risk Score:** Instant risk factor profiling (LOW, MED, HIGH) based on active compliance alerts.
*   **Remote Actions Console:** Trigger remote operations like **Restart** and **Shutdown** directly from the dashboard.
*   **Interactive Analytics:** Real-time sparkline metrics, historical trend charts, and device health status feeds.

---

## 📁 Repository Structure

```
├── agent/                # EDR monitoring agent (Python)
│   ├── agent.py          # Lightweight device telemetry collector & executor
│   ├── config.json       # Agent configuration containing server target URL
│   ├── build_exe.bat     # PyInstaller batch script to compile agent into standalone .exe
│   └── install_service.bat # Installs the agent as a silent Windows auto-start Scheduled Task
├── backend/              # Node.js backend API server
│   ├── server.js         # Core Express server & Socket.io implementation
│   ├── db/               # PostgreSQL database connection pool and schema
│   ├── routes/           # REST endpoints (telemetry, assets, auth, etc.)
│   └── downloads/        # Storage folder for compiled agent binaries
└── frontend/             # Dashboard user interface (React + Vite)
    ├── src/pages/        # UI dashboards (Live Device Health, Compliance, Asset Registry)
    └── src/services/     # API & WebSocket client connections
```

---

## 🛠️ Installation & Setup

### 1. Backend Server Setup
1.  Navigate to `/backend`:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure your environment variables in `.env`:
    ```env
    PORT=5000
    DATABASE_URL=postgresql://username:password@localhost:5432/secure_assets
    JWT_SECRET=your_jwt_secret_key
    ```
4.  Run the server:
    ```bash
    npm run dev
    ```

### 2. Frontend Dashboard Setup
1.  Navigate to `/frontend`:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
4.  Open http://localhost:5173 to access the dashboard.

### 3. Agent Setup (Target Device)
1.  Build the agent into a single binary on a Windows target (optional, pre-built version is copied to `/backend/downloads`):
    ```bash
    cd agent
    build_exe.bat
    ```
2.  Deploy both `SecureAssetsAgent.exe` and `config.json` to the target machine in the same folder.
3.  Configure the `SERVER_URL` in `config.json` to point to the backend server's LAN IP address:
    ```json
    {
      "SERVER_URL": "http://SERVER_IP:5000/device-data",
      "INTERVAL_SEC": 5,
      "TEST_MODE": false
    }
    ```
4.  Launch the agent. To register it to start silently on boot, run `install_service.bat` as an Administrator.

---

## 🛡️ License

This project is proprietary and confidential. External distribution is prohibited.
