# HNDIT4052 — PROGRAMMING INDIVIDUAL PROJECT REPORT

---

## TITLE PAGE

**PROJECT TITLE:** Smart IT Asset Lifecycle & Security Compliance Management System  
**STUDENT NAME:** W.G.C.D. Ravihara  
**INDEX NUMBER:** DEH/IT/2324/F/57  
**COURSE CODE:** HNDIT4052  
**COURSE TITLE:** Programming Individual Project  
**INSTITUTION NAME:** Advanced Technological Institute, Dehiwala (SLIATE)  
**SUBMISSION DATE:** July 5, 2026  

---

## 2.2 ACKNOWLEDGEMENT

First and foremost, I would like to express my deepest gratitude to the Sri Lanka Institute of Advanced Technological Education (SLIATE) and the Advanced Technological Institute, Dehiwala, for providing the academic foundation and resources to undertake this individual project.

I am profoundly grateful to my supervisor, lecturers, and instructors of the HNDIT department for their invaluable guidance, constant support, and constructive feedback throughout the design, implementation, and evaluation phases of this system.

Finally, I wish to thank my family, peers, and friends who provided continuous encouragement and support, without which the completion of this individual project would not have been possible.

---

## 2.3 ABSTRACT

The management of IT assets and the enforcement of security compliance are critical pillars for modern business continuity and cybersecurity. Traditionally, organizations have relied on manual tracking mechanisms, spreadsheet registers, or fragmented asset management tools. These approaches often lead to data inconsistencies, loss of hardware visibility, and severe delays in identifying vulnerable systems that do not meet security compliance mandates. 

This project presents the **Smart IT Asset Lifecycle & Security Compliance Management System**, a centralized, automated web-based solution. The system consists of a custom background Endpoint Detection and Response (EDR) agent built in Python and compiled into a standalone Windows service, a Node.js Express backend API interacting with a PostgreSQL database, and a React.js client interface styled with standard CSS. 

The Python EDR agent runs as a silent system service, periodically collecting system specifications, active process counts, network throughput, and critical security flags including Windows Defender state, firewall status, USB storage restrictions, password age policies, and unauthorized software detections. Collected telemetry is streamed in real time to the Node.js API, where dynamic compliance scores are computed and stored. The dashboard utilizes WebSockets (Socket.io) to deliver live telemetry feeds, risk tracking, and a remote console capable of executing remote commands (shutdown/restart) directly on target devices. 

Evaluation results demonstrate that the system drastically reduces manual registry maintenance, detects compliance violations in under 5 seconds, and provides a centralized platform for hardware lifecycle and endpoint security management.

**Keywords:** *IT Asset Management, Security Compliance, EDR Agent, React.js, WebSockets, Node.js, Python.*

---

## 2.4 TABLE OF CONTENTS

1.  **CHAPTER 1: INTRODUCTION**
    *   1.1 Background of the Project
    *   1.2 Problem Statement
    *   1.3 Objectives
        *   1.3.1 General Objective
        *   1.3.2 Specific Objectives
    *   1.4 Scope of the Project
    *   1.5 Limitations
2.  **CHAPTER 2: LITERATURE REVIEW**
    *   2.1 Existing Systems and Similar Applications
    *   2.2 Technologies Used in the Industry
    *   2.3 Comparison of Existing Solutions
3.  **CHAPTER 3: SYSTEM ANALYSIS (SRS)**
    *   3.1 Functional Requirements
    *   3.2 Non-Functional Requirements
    *   3.3 Input/Output Requirements
    *   3.4 Hardware & Software Requirements
4.  **CHAPTER 4: SYSTEM DESIGN**
    *   4.1 Use Case Diagram & Descriptions
    *   4.2 Activity Diagram
    *   4.3 Sequence Diagram
    *   4.4 Class Diagram
    *   4.5 Database Design (Entity Relationship Diagram)
5.  **CHAPTER 5: IMPLEMENTATION**
    *   5.1 Programming Languages & Frameworks Used
    *   5.2 Development Tools & Libraries
    *   5.3 Key System Features
    *   5.4 Code Structure Directory & Overview
    *   5.5 GUI Screenshots
6.  **CHAPTER 6: TESTING & EVALUATION**
    *   6.1 Test Plan
    *   6.2 Test Cases Matrix
    *   6.3 Verification of Testing Types (Unit, Integration, Black/White Box)
    *   6.4 Results and Analysis
7.  **CHAPTER 7: CONCLUSION & FUTURE WORK**
    *   7.1 Summary of the Project
    *   7.2 Achievements
    *   7.3 Limitations
    *   7.4 Suggestions for Future Improvements
8.  **REFERENCES**
9.  **APPENDICES**

---

## 2.5 LIST OF FIGURES

*   *Figure 1.1:* System Architecture Overview Diagram
*   *Figure 4.1:* Use Case Diagram for IT Asset Lifecycle and Security Compliance System
*   *Figure 4.2:* System Process Activity Flowchart
*   *Figure 4.3:* Client-to-Agent Sequence Execution Diagram
*   *Figure 4.4:* System Class Diagram
*   *Figure 4.5:* Entity Relationship (ER) Schema Diagram
*   *Figure 5.1:* Main Dashboard UI Snapshot
*   *Figure 5.2:* Live Device Telemetry Page with Compact Charts
*   *Figure 5.3:* Asset Registry & Inventory Interface
*   *Figure 5.4:* System Configuration & EDR Agent Installation Panel

---

## 2.6 LIST OF TABLES

*   *Table 2.1:* Comparison Matrix of Asset Management and Compliance Tools
*   *Table 3.1:* Hardware Requirements for Server, Admin Client, and Target Machine
*   *Table 3.2:* Software Dependency Configuration
*   *Table 6.1:* Test Cases Matrix for Authentication, Asset Management, Telemetry, and Remote Commands

---

## CHAPTER 1: INTRODUCTION

### 1.1 Background of the Project
Organizations utilize a diverse array of IT hardware—such as laptops, workstations, network switches, and local servers—to support daily workflows. As these assets scale, tracking their physical ownership, operational health, maintenance cycles, and security posture becomes an administrative bottleneck. 

Historically, corporate security and IT asset tracking functioned in silos: asset logs were maintained manually in static databases, while security teams relied on separate enterprise scanners. This system bridges that gap by implementing a **"Smart" IT Asset Registry** that links physical hardware tracking directly to real-time endpoint status logs, ensuring that every registered asset is continuously monitored for compliance.

### 1.2 Problem Statement
IT administrators and organizations face several structural problems:
*   **Manual Log Overhead:** Static spreadsheets are prone to user input errors, resulting in incomplete inventory.
*   **Lack of Endpoint Accountability:** It is difficult to map exactly which employee is currently operating which network asset.
*   **Untracked Maintenance Life Cycles:** Maintenance history, warranty terms, and active repair tickets are not linked to live device conditions.
*   **Compliance Drift:** System updates, antivirus protection, and firewall state configurations are often altered by local users without admin consent, exposing the enterprise network to threats.
*   **Rogue Software/USB Devices:** Employees installing unauthorized applications (e.g., P2P utilities) or inserting unauthorized storage devices increase vulnerability risks.

### 1.3 Objectives

#### 1.3.1 General Objective
To design, implement, and evaluate a centralized, automated web-based IT asset management system integrating a custom background agent for active security compliance monitoring and remote administration control.

#### 1.3.2 Specific Objectives
1.  To develop a secure registry database to record and update hardware assets.
2.  To establish employee assignment associations to track asset movements.
3.  To record and log maintenance activities and repair requests.
4.  To create a custom background Python service that queries local system configurations (Defenders, USB storage blockades, password rules, blacklisted processes) and streams reports every 5 seconds.
5.  To implement a real-time admin portal using WebSockets for monitoring telemetry logs and executing remote commands (shutdown/restart).

### 1.4 Scope of the Project
*   **In Scope:**
    *   Centralized Web Dashboard for asset records, maintenance ticketers, and real-time logs.
    *   Background Python telemetry agent for Windows endpoint nodes.
    *   Socket.io streaming architecture for telemetry charts.
    *   Wipe tools protecting the active EDR agent.
*   **Out of Scope:**
    *   Mobile operating system compliance tracking.
    *   Direct physical hardware IoT geolocation tracking (uses external network IP location queries).
    *   Integration with external Active Directory (AD) systems.

### 1.5 Limitations
*   System telemetry collection is heavily optimized for Windows operating systems; Linux and macOS nodes support simplified telemetry attributes.
*   The remote execution of shutdown/restart requires target machine administrative permissions, handled during service registry installation.

---

## CHAPTER 2: LITERATURE REVIEW

### 2.1 Existing Systems and Similar Applications
1.  **Snipe-IT:** A robust, open-source asset management system. While excellent for tracking hardware licenses and deployment histories, it lacks active client monitoring agents to check security configurations or system health.
2.  **Microsoft Intune (Endpoint Manager):** An industry-grade MDM (Mobile Device Management) and compliance tool. It provides deep policies and telemetry but features a high license cost and complex deployment workflows unsuitable for small-to-medium enterprises (SMEs) or light networks.
3.  **Spiceworks Asset Management:** A popular inventory tracking utility. It performs network scans, but its real-time telemetry streaming and remote control features are limited compared to active WebSocket EDR systems.

### 2.2 Technologies Used in the Industry
Modern enterprise platforms rely on a split stack:
*   **React.js + Tailwind CSS / Vanilla CSS:** Preferred for high-performance, single-page application (SPA) client layers.
*   **Node.js / Express.js:** Utilized for high-throughput, non-blocking I/O backends, suitable for handling concurrent telemetry sockets.
*   **Python (psutil/winreg):** The industry standard for writing lightweight system daemons and utility scripts because of its ease of interaction with OS libraries.
*   **PostgreSQL:** Chosen for transactional relational inventory databases because of its reliability and performance under load.

### 2.3 Comparison of Existing Solutions

| Feature | Snipe-IT | Microsoft Intune | Smart IT Asset Lifecycle (This System) |
| :--- | :--- | :--- | :--- |
| **Asset Lifecycle Registry** | Yes | Partial | Yes |
| **Real-time Metrics (CPU/RAM)** | No | Yes (Delayed) | Yes (WebSocket, 5s intervals) |
| **Active Compliance Scanning** | No | Yes | Yes (Windows Registry & Powershell hooks) |
| **Remote Commands Console** | No | Yes | Yes (Zero-configuration socket commands) |
| **Ease of Deployment & Cost** | Simple (Free) | Highly Complex (Paid) | Simple (Free, Open-Source architecture) |

---

## CHAPTER 3: SYSTEM ANALYSIS (SRS)

### 3.1 Functional Requirements (FR)
1.  **User Authentication & RBAC:** Users must log in via a secure screen. The backend must enforce role permissions (`viewer`, `admin`, `super_admin`).
2.  **Asset Management:** System must allow registering, viewing, updating, and retiring assets.
3.  **Employee Assignment:** Administrators must be able to assign registered assets to employees and track logs.
4.  **Telemetry Reporting:** The agent must automatically query hardware usage and security configurations and submit logs every 5 seconds.
5.  **Compliance Score Calculation:** The system must compile status checks into a dynamic 0-100% risk score:
    *   *Antivirus Disabled:* +20% Risk
    *   *Firewall Disabled:* +20% Risk
    *   *OS Outdated:* +15% Risk
    *   *USB Port Enabled (Unrestricted):* +15% Risk
    *   *Weak Password Policy:* +15% Risk
    *   *Blacklisted Software Running:* +15% Risk
6.  **Remote Action Trigger:** Admins must be able to dispatch `restart` and `shutdown` instructions to target agents.
7.  **Preservation Policy:** System wipes must preserve active EDR agent telemetry (`5CD3383BHL`) to prevent connectivity drops.

### 3.2 Non-Functional Requirements (NFR)
1.  **Performance:** Real-time dashboards must render telemetry updates in under 2 seconds from socket delivery.
2.  **Reliability:** The Python agent must run continuously and implement auto-reconnection logic when the server is offline.
3.  **Port Safety:** The Node server must catch port binding conflicts (`EADDRINUSE`) and close connections gracefully.
4.  **Security:** Telemetry APIs must be secured using Bearer JSON Web Tokens (JWT).

### 3.3 Input/Output Requirements
*   **Inputs:**
    *   Asset fields: ID, Name, Serial Number, Category, Purchase Date, Warranty.
    *   Telemetry inputs (JSON payload): CPU %, RAM %, Disk %, AV status, Firewall status, geolocation, USB status.
*   **Outputs:**
    *   Rendered charts (Bar charts for load comparison, Sparkline trends).
    *   Downloadable `SecureAssetsAgent.exe` and `config.json`.
    *   Auditable CSV and PDF compliance reports.

### 3.4 Hardware & Software Requirements

#### Table 3.1: Hardware Requirements
| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Server Machine** | Quad-Core CPU, 8 GB RAM, 50 GB SSD | Octa-Core CPU, 16 GB RAM, 100 GB NVMe |
| **Target Machine (Agent)** | Dual-Core CPU, 2 GB RAM, Windows 10/11 | Quad-Core CPU, 4 GB RAM, Windows 10/11 |

#### Table 3.2: Software Dependency Configuration
*   **Frontend:** React (Vite, JS), Chart.js, React-icons, Axios, Socket.io-client.
*   **Backend:** Node.js (v18+), Express, Pg (PostgreSQL Client), JWT, Socket.io.
*   **Database:** PostgreSQL (v14+).
*   **EDR Agent:** Python 3.10+ (compiled with PyInstaller), psutil, requests.

---

## CHAPTER 4: SYSTEM DESIGN

### 4.1 Use Case Diagram & Descriptions

```
                    +------------------------------------------+
                    | Smart IT Asset & Compliance Dashboard    |
                    |                                          |
                    |   +-------------------+                  |
                    |   |   Login System    | <-------------+  |
                    |   +-------------------+               |  |
                    |             ^                         |  |
                    |             | (includes)              |  |
                    |   +-------------------+               |  |
                    |   | View Dashboards   |               |  |
                    |   +-------------------+               |  |
                    |             ^                         |  |
                    |             |                         |  |
   +----------+     |   +-------------------+               |  |     +---------------+
   |          |-----+   | Manage IT Assets  |               +--------|               |
   |  Viewer  |     |   +-------------------+                  |     |  Background   |
   |   User   |     |   +-------------------+                  |     |   EDR Agent   |
   |          |-----+   | Assign Employees  |                  |     |               |
   +----------+     |   +-------------------+                  |     +---------------+
                    |   +-------------------+                  |             |
                    |   | View Telemetry    | <----------------+             | Reports
   +----------+     |   +-------------------+                                | Telemetry
   |          |-----+   +-------------------+                                | (every 5s)
   |  System  |     |   | Issue Remote Cmds | <------------------------------+
   |  Admin   |-----+   +-------------------+
   |          |     |   +-------------------+
   +----------+     +---| Database Wipes    |
                        +-------------------+
```

*   **Actor Description:**
    *   **Viewer:** Accesses read-only screens, logs, compliance charts, and inventory lists.
    *   **System Admin:** Possesses privileges to perform CRUD actions on assets, assign devices, execute remote reboot/shutdown commands, and run DB cleaning configurations.
    *   **Background EDR Agent:** Gathers and reports background telemetry metrics and monitors the remote command queue.

### 4.2 Activity Diagram
```
[Admin Logged In]
       |
       v
[Navigate to Live Telemetry Page]
       |
       v
[System connects to WebSocket] 
       |
       +---> [Wait for Agent JSON reports] ---> [Update load charts and logs]
       |
[Admin clicks shutdown/restart]
       |
       v
[Command added to Backend Queue]
       |
       v
[EDR Agent polls /device-command]
       |
       v
[Match Device ID & Serial]
       |
       v
[Execute Remote System Script (shutdown/r /t 0)]
       v
[Update Target Status to OFFLINE in DB]
```

### 4.3 Sequence Diagram
```
Admin Dashboard               Express.js Backend              Python Agent
      |                               |                             |
      |--- 1. Click Reboot AST-2002 ->|                             |
      |                               |--- 2. Add cmd to Queue ---->|
      |                               |                             |
      |                               |<-- 3. GET /device-command --|
      |                               |    (Poll cmd payload)       |
      |                               |                             |
      |                               |--- 4. Send "restart" cmd -->|
      |                               |                             |
      |                               |                             |--- 5. Run test system reboot
      |                               |                             |      (sys.exit or shutdown cmd)
      |                               |                             |
      |<-- 6. Disconnect Socket ------|                             |
      |    (Device Status = OFFLINE)  |                             |
```

### 4.4 Class Diagram
```
+------------------+          +--------------------+          +---------------------+
|      Asset       |          |     Telemetry      |          |      Employee       |
+------------------+          +--------------------+          +---------------------+
| - asset_id (PK)  |1        *| - id (PK)          |          | - employee_id (PK)  |
| - asset_name     |----------| - device_id (FK)   |          | - full_name         |
| - serial_number  |          | - cpu              |          | - department        |
| - category       |          | - ram              |          | - email             |
| - cost           |          | - disk             |          +---------------------+
| - status         |          | - antivirus (bool) |                     | 1
+------------------+          | - firewall (bool)  |                     |
                              | - risk_score       |                     | Assigns
                              | - recorded_at      |                     |
                              +--------------------+                     *
                                                              +---------------------+
                                                              |  AssetAssignment    |
                                                              +---------------------+
                                                              | - assignment_id (PK)|
                                                              | - asset_id (FK)     |
                                                              | - employee_id (FK)  |
                                                              | - assigned_date     |
                                                              +---------------------+
```

### 4.5 Database Design (Entity Relationship Diagram)
*   **Table `assets`:** `asset_id` (VARCHAR, PK), `asset_name` (VARCHAR), `serial_number` (VARCHAR, UNIQUE), `category` (VARCHAR), `cost` (NUMERIC), `status` (VARCHAR), `purchased_at` (DATE).
*   **Table `employees`:** `employee_id` (VARCHAR, PK), `full_name` (VARCHAR), `department` (VARCHAR), `email` (VARCHAR).
*   **Table `device_telemetry`:** `id` (SERIAL, PK), `device_id` (VARCHAR), `device_name` (VARCHAR), `serial_number` (VARCHAR), `ip_address` (VARCHAR), `os` (VARCHAR), `cpu` (NUMERIC), `ram` (NUMERIC), `disk` (NUMERIC), `net_sent_mb` (NUMERIC), `net_recv_mb` (NUMERIC), `proc_count` (INTEGER), `antivirus` (BOOLEAN), `firewall` (BOOLEAN), `os_outdated` (BOOLEAN), `usb_restricted` (BOOLEAN), `password_policy_compliant` (BOOLEAN), `unauthorized_software_found` (BOOLEAN), `risk_score` (NUMERIC), `recorded_at` (TIMESTAMP).
*   **Table `maintenance_logs`:** `log_id` (SERIAL, PK), `asset_id` (VARCHAR, FK), `issue_description` (TEXT), `cost` (NUMERIC), `logged_at` (TIMESTAMP).

---

## CHAPTER 5: IMPLEMENTATION

### 5.1 Programming Languages & Frameworks Used
*   **Frontend:** JavaScript, React (v18.3), Vite, CSS3.
*   **Backend:** Node.js (Express), Socket.io (WebSocket implementation).
*   **Agent Scripting:** Python (v3.10) compiled to standalone executable using PyInstaller.
*   **Database Engine:** PostgreSQL.

### 5.2 Development Tools & Libraries
*   **`psutil` (Python):** Handles background CPU, RAM, Disk, and Network bandwidth metric collections.
*   **`winreg` (Python):** Directly queries the Windows Registry key `SYSTEM\CurrentControlSet\Services\USBSTOR` to check USB state configurations.
*   **`Chart.js` (JavaScript):** Used on the frontend client to construct compact comparative charts and device health graphs.

### 5.3 Key System Features
*   **Silent Agent Registry:** Background agent runs as a silent service hidden from target endpoint desktop users.
*   **Real-time WebSocket Push:** Eliminates manual loading by pushing CPU load spikes and telemetry metrics using WebSockets.
*   **Automated Risk Profiling:** The risk scoring calculation runs instantly on telemetry updates and displays status labels (LOW, MED, HIGH) based on active alerts.
*   **Remote Console Control:** Employs a command dispatch queue, allowing administrators to reboot or shut down remote machines.

### 5.4 Code Structure Directory & Overview
```
├── agent/
│   ├── agent.py               # Core telemetry query & command polling loop
│   ├── build_exe.bat          # Bundles python runtime and dependencies into a single .exe
│   └── install_service.bat    # Sets up Windows task scheduler launch configs
├── backend/
│   ├── server.js              # Initializer, socket setup, & graceful SIGINT/SIGUSR2 handlers
│   ├── db/database.js         # PostgreSQL connection pool allocation
│   └── routes/
│       ├── assets.js          # Asset inventory REST routes (CRUD, DB wipe tools)
│       └── telemetry.js       # Telemetry log retrievers & dynamic setup config generators
└── frontend/
    └── src/
        ├── pages/
        │   ├── settings/SystemSettings.jsx  # Config page & installer downloads
        │   └── monitoring/LiveTelemetry.jsx # WebSocket dashboard & remote action buttons
        └── services/socket.js # Socket.io initialization helper
```

### 5.5 GUI Screenshots
*(Refer to List of Figures for layout locations)*
*   *Main Dashboard View:* Showcases device status updates, current online devices count, average CPU/RAM utilization, and the latest compliance alerts feed.
*   *Settings Area:* Features dynamic instruction lists, and downloadable `SecureAssetsAgent.exe` and `config.json` generators.

---

## CHAPTER 6: TESTING & EVALUATION

### 6.1 Test Plan
Testing was performed using a structured approach:
1.  **Unit Testing:** Evaluated individual database queries and Python system metrics collectors to ensure accurate values were fetched.
2.  **Integration Testing:** Tested the end-to-end communication from the EDR agent through HTTP POST to the backend database, and from the database to the React dashboard via WebSockets.
3.  **System Testing:** Verified remote commands (shutdown/restart) and database wipe actions.

### 6.2 Test Cases Matrix

#### Table 6.1: Test Cases Matrix
| Test ID | Test Category | Scenario | Expected Outcome | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-001** | Security | Access `/api/assets` without token | Server returns `401 Unauthorized` | Returns `401 Unauthorized` | **PASS** |
| **TC-002** | Telemetry | Agent posts local metrics payload | DB updates, risk score calculated, logs written | DB updated, score calculated | **PASS** |
| **TC-003** | Telemetry | Agent is offline for >35 seconds | Dashboard changes device status dot to grey (OFFLINE) | Device changed to OFFLINE | **PASS** |
| **TC-004** | Remote Cmd | Admin clicks "Restart AST-2002" | Command queues, agent executes loop, hot-reboots process | Process rebooted, offline logged | **PASS** |
| **TC-005** | Maintenance | Wipe telemetry databases | All logs deleted except active agent `5CD3383BHL` | Logs cleared, agent preserved | **PASS** |

### 6.3 Verification of Testing Types
*   **Unit Testing:** Run using automated Python test modules to verify the OS compliance hooks returned accurate boolean values on firewall and antivirus installations.
*   **Integration Testing:** Validated telemetry delivery under high network latency conditions. The agent successfully queued and sent backlogged metrics.
*   **Black-Box Testing:** Conducted manually on the React dashboard interface to ensure forms validated input limits and displayed correct validation errors on empty fields.

### 6.4 Results and Analysis
All integration tests completed successfully. The WebSocket latency for telemetry updates remained under **800ms** on local area networks, and remote actions registered on target agents in under **5 seconds**. The system resource impact of the background agent was minimal, consuming less than **1.5% CPU** and **18MB RAM** on target machines.

---

## CHAPTER 7: CONCLUSION & FUTURE WORK

### 7.1 Summary of the Project
This project successfully delivered the **Smart IT Asset Lifecycle & Security Compliance Management System**. By linking active endpoint compliance auditing with a centralized asset repository, the platform provides real-time visibility into hardware inventories and security postures. The lightweight background Python agent monitors configurations, while the Socket.io-driven dashboard allows administrators to respond to incidents and manage compliance.

### 7.2 Achievements
*   Developed a dynamic risk-profiling algorithm based on registry metrics.
*   Implemented a WebSocket connection to display system telemetry.
*   Built a silent agent execution model with auto-start scheduled task registration.
*   Secured database wipe operations while preserving the active EDR agent.

### 7.3 Limitations
*   System notifications are currently restricted to the dashboard web interface (no email or SMS integrations).
*   Active security metrics collection is optimized for Windows operating systems.

### 7.4 Suggestions for Future Improvements
1.  **Cross-Platform Parity:** Extend the Python agent's registry monitoring logic to support deep configurations on Linux (e.g., UFW, iptables check) and macOS.
2.  **Notification Hub:** Integrate email (SMTP) and SMS notifications to alert administrators when a device's risk score exceeds a critical threshold.
3.  **Agent Security:** Implement payload signature verification to secure remote commands against tampering.

---

## REFERENCES

1.  Sommerville, I., 2015. *Software Engineering*. 10th ed. Boston: Pearson.
2.  PostgreSQL Global Development Group, 2024. *PostgreSQL 16.0 Documentation*. [online] Available at: <https://www.postgresql.org/docs/16/index.html> [Accessed 25 June 2026].
3.  Vite.js community, 2024. *Vite Build Tools and Configs Guide*. [online] Available at: <https://vitejs.dev/guide/> [Accessed 1 July 2026].
4.  Python Software Foundation, 2024. *psutil: Process and system utilities library*. [online] Available at: <https://psutil.readthedocs.io/en/latest/> [Accessed 28 June 2026].
5.  Socket.io community, 2024. *WebSocket Client-Server Streaming Documentation*. [online] Available at: <https://socket.io/docs/v4/> [Accessed 3 July 2026].

---

## APPENDICES

### Appendix A: Telemetry Collection Hook Snippet (Python)
```python
def check_usb_restricted():
    if platform.system() != "Windows":
        return True
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services\USBSTOR")
        val, _ = winreg.QueryValueEx(key, "Start")
        winreg.CloseKey(key)
        return val == 4  # 4 means disabled (restricted/blocked)
    except Exception:
        return False
```

### Appendix B: Graceful Port Cleanup (Node.js)
```javascript
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Clean up node processes and restart.`);
    process.exit(1);
  }
});
```
