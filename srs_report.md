# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
## Smart IT Asset Lifecycle & Security Compliance Management System

**Project Identification Code:** DEH-IT-2324-F-0057  
**Course Code:** HNDIT4052 - Programming Individual Project  
**Author:** W.G.C.D. Ravihara  
**Version:** 1.0.0  
**Date:** July 5, 2026  

---

## 1. INTRODUCTION

### 1.1 Purpose
This Software Requirements Specification (SRS) document details the functional, non-functional, database, and system interface requirements for the **Smart IT Asset Lifecycle & Security Compliance Management System**. The target audience comprises system architects, developers, security compliance auditors, and academic evaluators of the HNDIT individual project.

### 1.2 Scope
The system is designed to provide a centralized web-based solution for organizations to manage the lifecycle of IT hardware assets while actively monitoring their security posture. The scope includes:
1.  **IT Asset Inventory Control:** CRUD operations on device records, physical locations, purchase history, and maintenance lifecycles.
2.  **Asset Assignment System:** Tracking device ownership, employee assignments, and return/transfer logs.
3.  **Active EDR Telemetry Agent:** A background service for Windows client machines to collect hardware metrics (CPU, RAM, Disk, Network I/O) and key security configurations.
4.  **Compliance Verification Engine:** Real-time computation of system safety scores based on Windows Registry and PowerShell compliance indicators.
5.  **Remote Administration Console:** Dispatching remote reboot/shutdown commands directly to client machines using WebSocket connections.

### 1.3 Definitions, Acronyms, and Abbreviations
*   **EDR:** Endpoint Detection and Response.
*   **SRS:** Software Requirements Specification.
*   **JWT:** JSON Web Token (used for secure web authorization).
*   **RBAC:** Role-Based Access Control.
*   **API:** Application Programming Interface.
*   **WSS / WS:** WebSocket / WebSocket Secure protocol.
*   **AV / FW:** Antivirus / Firewall.
*   **USBSTOR:** Windows USB Storage Service handler registry path.

### 1.4 References
1.  IEEE Std 830-1998, *IEEE Recommended Practice for Software Requirements Specifications*.
2.  PostgreSQL 16 Global Development Documentation.
3.  React.js and Socket.io developer guidelines.

### 1.5 Overview
The rest of this document outlines the overall system description, detailed system features, external interfaces (User, Hardware, and Software), and the non-functional constraints that govern performance and reliability.

---

## 2. OVERALL DESCRIPTION

### 2.1 Product Perspective
The system functions as a self-contained monitoring and inventory management suite. It consists of three primary components:
1.  **Agent (Python Daemon):** Deployed on target endpoints to query local metrics and listen for instructions.
2.  **API Server (Node.js/Express):** Brokering database writes, computing risk scores, and managing the command queue.
3.  **Dashboard (React Client):** Displaying active devices, compliance indicators, and administrative actions.

```
+------------------+          HTTP / WSS          +------------------+
|   React Client   | <==========================> |  Express Server  |
|   (Dashboard)    |                              |    (Port 5000)   |
+------------------+                              +------------------+
                                                     ^            |
                                                     |            | pg-Pool
                                            Telemetry|            v
                                                Post |    +--------------+
                                                     |    |  PostgreSQL  |
                                                     |    |   Database   |
                                              +------+    +--------------+
                                              |
                                     +------------------+
                                     |   Python Agent   |
                                     | (Target Machine) |
                                     +------------------+
```

### 2.2 Product Functions
*   Secure Administrator login and authorization.
*   IT hardware registration and specification indexing.
*   Assigning assets to company departments and personnel.
*   Monitoring live CPU, RAM, disk, and network stats via WebSocket feeds.
*   Auditing OS configurations (Windows Defender, Firewall status, registry USB blocks, password age rules).
*   Flagging and alerting on blacklisted software processes.
*   Executing remote system shutdown and reboot commands.
*   Safely resetting logs while preserving connection parameters.

### 2.3 User Classes and Characteristics
1.  **Viewer User:** Read-only access to asset logs, compliance reports, and live graphs. No administrative modifications or remote triggers permitted.
2.  **System Administrator:** Full access to asset registry CRUD operations, employee assignments, and remote command executions.
3.  **Super Administrator:** Master access including database telemetry purges, server configuration logs, and backend maintenance controls.

### 2.4 Operating Environment
*   **Backend Server:** Node.js runtime environment (v18.x or higher) running on Windows Server or Linux.
*   **Database Engine:** PostgreSQL Database Server (v14.x or higher).
*   **Dashboard Browser:** Modern web browsers with WebSocket support (Google Chrome v90+, Mozilla Firefox v88+, Microsoft Edge v90+).
*   **Client Agent:** Windows 10/11 operating system with Python 3.10+ runtime (or the compiled standalone `.exe` service).

### 2.5 Design and Implementation Constraints
*   The remote system execution model is optimized for Windows hosts using PowerShell.
*   WebSocket links require persistent network connectivity between the target device and the Express API server.
*   Port 5000 (backend API) and Port 5173 (frontend server) must be open on local and internal routing interfaces.

---

## 3. SYSTEM FEATURES

### 3.1 User Authentication & Role-Based Access Control (RBAC)
*   **Description:** Enforces authentication and scopes page permissions.
*   **Functional Requirements:**
    *   **FR-1.1:** System must validate username and password credentials against hashed values stored in the database.
    *   **FR-1.2:** Backend must issue a secure, signed JWT token upon successful authentication.
    *   **FR-1.3:** Navigation sidebar links must dynamically show/hide features according to user role permissions.

### 3.2 Asset Registry & Inventory Control
*   **Description:** Manages the lifecycle of hardware assets from procurement to retirement.
*   **Functional Requirements:**
    *   **FR-2.1:** Users must be able to register new assets with attributes: ID, Category, Name, Serial Number, Cost, and Status.
    *   **FR-2.2:** System must enforce unique constraints on device serial numbers.
    *   **FR-2.3:** System must allow filtering assets by category (laptops, servers, workstations) and status (active, repair, retired).

### 3.3 Employee Assignment & Return Tracking
*   **Description:** Associates hardware inventory records with specific organization members.
*   **Functional Requirements:**
    *   **FR-3.1:** Admins must be able to assign an active asset to a registered employee using their email or ID.
    *   **FR-3.2:** System must log transaction dates, tracking historical asset allocations.
    *   **FR-3.3:** Returning or transferring an asset must update the status in the main asset database.

### 3.4 Active Telemetry Logging & Streaming
*   **Description:** Periodically reads system statistics and streams them to the dashboard.
*   **Functional Requirements:**
    *   **FR-4.1:** The EDR agent must collect CPU, RAM, Disk, and network bandwidth data.
    *   **FR-4.2:** Telemetry must be sent to the backend every 5 seconds.
    *   **FR-4.3:** Dashboards must use Socket.io to update graphs in real time without refreshing the page.

### 3.5 Compliance Scoring Engine
*   **Description:** Computes endpoint vulnerabilities based on security configurations.
*   **Functional Requirements:**
    *   **FR-5.1:** Antivirus (Windows Defender) state must be queried. Disabled state increases the risk score by 20%.
    *   **FR-5.2:** Firewall state must be checked. Disabled state increases the risk score by 20%.
    *   **FR-5.3:** Unrestricted USB storage access (Start registry key not equal to 4) increases the risk score by 15%.
    *   **FR-5.4:** The score must be recalculated on every telemetry POST and categorized:
        *   `Score < 40`: **LOW RISK** (Green)
        *   `40 <= Score < 70`: **MEDIUM RISK** (Orange)
        *   `Score >= 70`: **HIGH RISK** (Red)

### 3.6 Remote Execution Controls
*   **Description:** Allows administrators to execute power management commands on endpoints.
*   **Functional Requirements:**
    *   **FR-6.1:** Admins must be able to dispatch shutdown and reboot commands via the telemetry panel.
    *   **FR-6.2:** Commands must queue on the server and poll dynamically via client agents.
    *   **FR-6.3:** Agents must parse the payload and execute `shutdown /s /t 0` or `shutdown /r /t 0` on Windows machines.

---

## 4. EXTERNAL INTERFACE REQUIREMENTS

### 4.1 User Interfaces
*   **Dashboard Portal:** Single Page Application (SPA) styled with standard CSS, responsive layouts, sidebar navigation, real-time widgets, and modals.
*   **Settings Interface:** System parameters page providing options to generate custom `config.json` files and download `SecureAssetsAgent.exe`.

### 4.2 Software Interfaces
*   **PostgreSQL Client:** Node backend uses the `pg` driver to query the relational schema.
*   **OS System APIs:** Python daemon uses `winreg` and `subprocess` to interface with the host Windows OS.

### 4.3 Communications Interfaces
*   **REST API:** HTTP protocols handling authentication, configuration requests, and CRUD operations.
*   **WebSocket Protocol:** WS/WSS pipelines via Socket.io to stream real-time updates and push commands.

---

## 5. NON-FUNCTIONAL REQUIREMENTS

### 5.1 Performance Requirements
*   **Response Time:** Telemetry updates must reflect on the React dashboard in under 1 second from server receipt.
*   **Query Processing:** Database lookup times for asset queries must be under 300ms.
*   **Agent Resource Footprint:** The Python EDR agent must consume less than 3% CPU and 25MB RAM on the target machine.

### 5.2 Security Requirements
*   **Data Integrity:** Restrictive wipes must preserve the active EDR agent (`5CD3383BHL`) in the database.
*   **Endpoint Security:** Telemetry API endpoints must require secure JWT tokens in headers: `Authorization: Bearer <TOKEN>`.
*   **Credential Hashing:** User passwords must be salted and hashed using Bcrypt before database storage.

### 5.3 Reliability & Availability
*   **Server Recovery:** The backend must handle port binding conflicts (`EADDRINUSE`) and close connections gracefully.
*   **Agent Resilience:** The agent must automatically attempt to reconnect to the server when offline without crashing.

### 5.4 Maintainability & Portability
*   **Cross-Compatibility:** The web client must run consistently across major modern browsers.
*   **Configuration Decoupling:** Global endpoints and settings must be managed via `.env` and `config.json` parameters.
