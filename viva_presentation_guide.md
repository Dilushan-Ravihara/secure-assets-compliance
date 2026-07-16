# 🎓 VIVA PRESENTATION & DEPLOYMENT GUIDE
## Smart IT Asset Lifecycle & Security Compliance Management System

Follow this step-by-step guide to set up and demonstrate your project smoothly during the viva tomorrow.

---

## 💻 STEP 1: Set Up the Server Machine (Your Main Laptop)

This is the machine running the dashboard and the database.

### 1. Find Your Local IP Address
Open **Command Prompt** or **PowerShell** and run:
```cmd
ipconfig
```
Locate the **IPv4 Address** under your active connection (Wi-Fi or Ethernet). 
*(For example: `10.89.201.74`)*.

### 2. Open Server Port in Windows Firewall (Crucial for other devices to connect)
To allow other devices to connect, you must open Port 5000:
1. Search for **PowerShell** on your server machine.
2. Right-click it and select **"Run as Administrator"**.
3. Paste the following command and press **Enter**:
```powershell
New-NetFirewallRule -DisplayName "SecureAssets Port 5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
```

### 3. Start Backend & Frontend Servers
Make sure both servers are active.
*   **Backend Server:** Navigate to `backend` and run `npm run dev`.
*   **Frontend Server:** Navigate to `frontend` and run `npm run dev`.

---

## 🖥️ STEP 2: Deploy Agent on Other Devices (Client Machines)

To show the examiners how the agent connects in real-time:

### Method A: One-Click PowerShell (Recommended for Viva)
1. Ensure the target client device is connected to the **same Wi-Fi/Network** as your laptop.
2. Open **PowerShell** on the target device as **Administrator** (Right-click -> Run as Administrator).
3. Copy and run the following command (substitute the server IP if it changes):
```powershell
powershell -ExecutionPolicy Bypass -Command "iwr -useb http://10.89.201.74:5000/api/telemetry/agent/install | iex"
```
4. The script will automatically download the agent, set up the startup service, and start reporting telemetry data in under 5 seconds!

### Method B: Manual File Copy
If the client machine doesn't have internet access to fetch files from the server:
1. Copy the folder `agent/dist/` (which contains `SecureAssetsAgent.exe` and `config.json`) onto a USB drive.
2. Copy it to the target client device.
3. Open `config.json` and set the `SERVER_URL` to point to the server's IP:
   ```json
   {
     "SERVER_URL": "http://10.89.201.74:5000/device-data",
     "INTERVAL_SEC": 5,
     "TEST_MODE": false
   }
   ```
4. Double-click `SecureAssetsAgent.exe` to run it.

---

## 🌟 STEP 3: Viva Demonstration Flow (How to impress the examiners)

### 1. Show the Clean Dashboard
*   Log in using:
    *   **Email:** `superadmin@company.com`
    *   **Password:** `admin123`
*   Show them the **live system health gauges** and compliance scores.

### 2. Demonstrate Real-Time Telemetry
*   Open the **Live Device Health** page.
*   Open a CPU-intensive task or browser on the client machine.
*   Show the examiners how the **CPU LOAD chart** updates on the dashboard instantly (in under 5 seconds) via WebSockets.

### 3. Show Compliance Auditing
*   Turn off Windows Defender or the local firewall on the client device.
*   Show the examiners how the dashboard immediately registers a **High Risk Alert** and updates the risk rating to **High Risk (Red)**.

### 4. Trigger Remote Commands
*   Click the **Restart** or **Shutdown** button on the dashboard for the client device.
*   Show the examiners how the client machine executes the request and automatically shuts down or restarts within 5 seconds.

### 5. Show Geo-Satellite Tracking
*   Navigate to **Geo-Satellite Live Tracking**.
*   Show the active device map showing where the workstations are located.
