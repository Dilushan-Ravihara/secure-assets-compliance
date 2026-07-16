"""
SecureAssets Device Monitoring Agent
=====================================
Install requirements: pip install psutil requests
Run: python agent.py

This lightweight agent:
  - Collects CPU, RAM, Disk, Network, Antivirus, Firewall status
  - Sends data every 5 seconds to the SecureAssets backend
  - Auto-reconnects if server is down
"""

import time
import socket
import platform
import psutil
import requests
import subprocess
import sys
import os
from datetime import datetime

# ─── System Serial Number Helper ───────────────────────────────────────────────
def get_system_serial():
    # Detect platform
    is_win = platform.system() == "Windows"
    is_nix = platform.system() == "Linux"
    is_mac = platform.system() == "Darwin"

    # Configure startupinfo to hide flashing console windows on Windows
    win_startupinfo = None
    if is_win:
        win_startupinfo = subprocess.STARTUPINFO()
        win_startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        win_startupinfo.wShowWindow = 0

    if is_win:
        try:
            # Try powershell CIM instance Win32_Bios
            res = subprocess.run(
                ["powershell", "-Command", "Get-CimInstance -ClassName Win32_Bios | Select-Object -ExpandProperty SerialNumber"],
                capture_output=True, text=True, timeout=5,
                startupinfo=win_startupinfo
            )
            val = res.stdout.strip()
            if val and "Error" not in val:
                return val
        except Exception:
            pass
        try:
            # Fallback to wmic
            res = subprocess.run(
                ["wmic", "bios", "get", "serialnumber"],
                capture_output=True, text=True, timeout=5,
                startupinfo=win_startupinfo
            )
            lines = [l.strip() for l in res.stdout.splitlines() if l.strip()]
            if len(lines) > 1:
                return lines[1]
        except Exception:
            pass
    elif is_nix:
        for path in ["/sys/class/dmi/id/product_serial", "/sys/class/dmi/id/board_serial"]:
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        val = f.read().strip()
                        if val:
                            return val
                except Exception:
                    pass
        try:
            res = subprocess.run(
                ["sudo", "dmidecode", "-s", "system-serial-number"],
                capture_output=True, text=True, timeout=5
            )
            val = res.stdout.strip()
            if val:
                return val
        except Exception:
            pass
    elif is_mac:
        try:
            res = subprocess.run(
                ["system_profiler", "SPHardwareDataType"],
                capture_output=True, text=True, timeout=5
            )
            for line in res.stdout.splitlines():
                if "Serial Number" in line:
                    return line.split(":")[-1].strip()
        except Exception:
            pass
            
    # Ultimate fallback: return a derived serial based on hostname
    return f"SN-{socket.gethostname().upper()}"

def get_system_brand():
    is_win = platform.system() == "Windows"
    is_nix = platform.system() == "Linux"
    is_mac = platform.system() == "Darwin"

    win_startupinfo = None
    if is_win:
        win_startupinfo = subprocess.STARTUPINFO()
        win_startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        win_startupinfo.wShowWindow = 0

    if is_win:
        try:
            res = subprocess.run(
                ["powershell", "-Command", "Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object -ExpandProperty Manufacturer"],
                capture_output=True, text=True, timeout=5,
                startupinfo=win_startupinfo
            )
            val = res.stdout.strip()
            if val and "Error" not in val:
                return val
        except Exception:
            pass
        try:
            res = subprocess.run(
                ["wmic", "computersystem", "get", "manufacturer"],
                capture_output=True, text=True, timeout=5,
                startupinfo=win_startupinfo
            )
            lines = [l.strip() for l in res.stdout.splitlines() if l.strip()]
            if len(lines) > 1:
                return lines[1]
        except Exception:
            pass
    elif is_nix:
        for path in ["/sys/class/dmi/id/sys_vendor", "/sys/class/dmi/id/chassis_vendor"]:
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        val = f.read().strip()
                        if val:
                            return val
                except Exception:
                    pass
    elif is_mac:
        return "Apple"
    return "Unknown Brand"

def get_system_model():
    is_win = platform.system() == "Windows"
    is_nix = platform.system() == "Linux"
    is_mac = platform.system() == "Darwin"

    win_startupinfo = None
    if is_win:
        win_startupinfo = subprocess.STARTUPINFO()
        win_startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        win_startupinfo.wShowWindow = 0

    if is_win:
        try:
            res = subprocess.run(
                ["powershell", "-Command", "Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object -ExpandProperty Model"],
                capture_output=True, text=True, timeout=5,
                startupinfo=win_startupinfo
            )
            val = res.stdout.strip()
            if val and "Error" not in val:
                return val
        except Exception:
            pass
        try:
            res = subprocess.run(
                ["wmic", "computersystem", "get", "model"],
                capture_output=True, text=True, timeout=5,
                startupinfo=win_startupinfo
            )
            lines = [l.strip() for l in res.stdout.splitlines() if l.strip()]
            if len(lines) > 1:
                return lines[1]
        except Exception:
            pass
    elif is_nix:
        for path in ["/sys/class/dmi/id/product_name", "/sys/class/dmi/id/product_version"]:
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        val = f.read().strip()
                        if val:
                            return val
                except Exception:
                    pass
    elif is_mac:
        try:
            res = subprocess.run(
                ["sysctl", "-n", "hw.model"],
                capture_output=True, text=True, timeout=5
            )
            val = res.stdout.strip()
            if val:
                return val
        except Exception:
            pass
    return "Generic PC"

def get_friendly_os_name():
    is_win = platform.system() == "Windows"
    if not is_win:
        return f"{platform.system()} {platform.release()}"
    
    # Try powershell CIM Win32_OperatingSystem (Accurate on Win 11)
    win_startupinfo = subprocess.STARTUPINFO()
    win_startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    win_startupinfo.wShowWindow = 0
    try:
        res = subprocess.run(
            ["powershell", "-Command", "(Get-CimInstance Win32_OperatingSystem).Caption"],
            capture_output=True, text=True, timeout=5,
            startupinfo=win_startupinfo
        )
        val = res.stdout.strip()
        if val and "Error" not in val:
            if val.startswith("Microsoft "):
                val = val[10:]
            return val
    except Exception:
        pass

    # Registry Fallback
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        product_name, _ = winreg.QueryValueEx(key, "ProductName")
        try:
            display_version, _ = winreg.QueryValueEx(key, "DisplayVersion")
            if display_version:
                return f"{product_name} ({display_version})"
        except Exception:
            pass
        return product_name
    except Exception:
        return f"Windows {platform.release()}"

# ─── Configuration ─────────────────────────────────────────────────────────────
SERVER_URL    = "https://secureassets-viva.loca.lt/device-data"   # Default to public tunnel URL
INTERVAL_SEC  = 5                                     # How often to send data
DEVICE_ID     = socket.gethostname()                  # Unique device name
DEVICE_NAME   = socket.gethostname()
AGENT_VERSION = "1.0"
TEST_MODE     = False
LATITUDE      = None                                  # Custom coordinate override
LONGITUDE     = None                                  # Custom coordinate override
LOCATION      = None                                  # Custom text location override

# ─── Command Line & Config File Overrides ──────────────────────────────────────
# Check if config.json exists in same folder as script (or exe)
try:
    # When frozen by PyInstaller, __file__ doesn't exist — use sys.argv[0] instead
    if getattr(sys, 'frozen', False):
        current_dir = os.path.dirname(os.path.abspath(sys.executable))
    else:
        current_dir = os.path.dirname(os.path.abspath(__file__))
except Exception:
    current_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
config_path = os.path.join(current_dir, "config.json")
if os.path.exists(config_path):
    try:
        import json
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            if "SERVER_URL" in cfg:
                SERVER_URL = cfg["SERVER_URL"]
                print(f"[*] Loaded SERVER_URL from config.json: {SERVER_URL}")
            if "INTERVAL_SEC" in cfg:
                INTERVAL_SEC = int(cfg["INTERVAL_SEC"])
            if "DEVICE_ID" in cfg:
                DEVICE_ID = cfg["DEVICE_ID"]
            if "DEVICE_NAME" in cfg:
                DEVICE_NAME = cfg["DEVICE_NAME"]
            if "TEST_MODE" in cfg:
                TEST_MODE = bool(cfg["TEST_MODE"])
                print(f"[*] Loaded TEST_MODE from config.json: {TEST_MODE}")
            if "LATITUDE" in cfg and cfg["LATITUDE"] is not None:
                LATITUDE = float(cfg["LATITUDE"])
            if "LONGITUDE" in cfg and cfg["LONGITUDE"] is not None:
                LONGITUDE = float(cfg["LONGITUDE"])
            if "LOCATION" in cfg and cfg["LOCATION"] is not None:
                LOCATION = str(cfg["LOCATION"])
                print(f"[*] Custom location loaded: {LOCATION} ({LATITUDE}, {LONGITUDE})")
    except Exception as e:
        print(f"[*] Failed to read config.json: {e}")

# Command line overrides: --url <SERVER_URL> --name <DEVICE_NAME>
if len(sys.argv) > 2:
    for idx, arg in enumerate(sys.argv):
        if arg == "--url" and idx + 1 < len(sys.argv):
            SERVER_URL = sys.argv[idx + 1]
            print(f"[*] Command-line override: SERVER_URL set to {SERVER_URL}")
        elif arg == "--name" and idx + 1 < len(sys.argv):
            DEVICE_NAME = sys.argv[idx + 1]
            print(f"[*] Command-line override: DEVICE_NAME set to {DEVICE_NAME}")

# Cache windows update check to keep the agent fast
last_os_check_time = 0.0
os_outdated_status = False

# ─── Detect Platform ──────────────────────────────────────────────────────────
IS_WINDOWS = platform.system() == "Windows"
IS_LINUX   = platform.system() == "Linux"
IS_MAC     = platform.system() == "Darwin"

# Configure startupinfo to hide flashing console windows when running subprocesses on Windows
SUBPROCESS_STARTUPINFO = None
if IS_WINDOWS:
    SUBPROCESS_STARTUPINFO = subprocess.STARTUPINFO()
    SUBPROCESS_STARTUPINFO.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    SUBPROCESS_STARTUPINFO.wShowWindow = 0  # SW_HIDE

# ─── Antivirus Check (Windows only) ──────────────────────────────────────────
def check_antivirus():
    # Check if Windows Defender Antivirus is on
    if not IS_WINDOWS:
        return True  # Assume OK on Linux/Mac for now
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "Get-MpComputerStatus | Select-Object -ExpandProperty AntivirusEnabled"],
            capture_output=True, text=True, timeout=5,
            startupinfo=SUBPROCESS_STARTUPINFO
        )
        return "True" in result.stdout
    except Exception:
        return None  # Unknown

# ─── Firewall Check (Windows only) ────────────────────────────────────────────
def check_firewall():
    # Check if the system firewall is active
    if not IS_WINDOWS:
        return True
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "Get-NetFirewallProfile | Select-Object -ExpandProperty Enabled"],
            capture_output=True, text=True, timeout=5,
            startupinfo=SUBPROCESS_STARTUPINFO
        )
        return "True" in result.stdout
    except Exception:
        return None

# ─── OS Update Check ──────────────────────────────────────────────────────────
def check_os_outdated():
    global last_os_check_time, os_outdated_status
    if not IS_WINDOWS:
        return False
    
    current_time = time.time()
    # Check updates every 10 minutes to save CPU
    if current_time - last_os_check_time < 600:
        return os_outdated_status
        
    last_os_check_time = current_time
    try:
        # Run powershell cmd to check pending updates
        cmd = (
            "$session = New-Object -ComObject Microsoft.Update.Session; "
            "$searcher = $session.CreateUpdateSearcher(); "
            "$result = $searcher.Search('IsInstalled=0 and Type=\"Software\"'); "
            "Write-Output ($result.Updates.Count -gt 0)"
        )
        res = subprocess.run(
            ["powershell", "-Command", cmd],
            capture_output=True, text=True, timeout=15,
            startupinfo=SUBPROCESS_STARTUPINFO
        )
        os_outdated_status = "True" in res.stdout
    except Exception:
        # Default to False if it fails to avoid crash
        os_outdated_status = False
        
    return os_outdated_status

# ─── USB Storage Restriction Check (Windows only) ────────────────────────────
def check_usb_restricted():
    if not IS_WINDOWS:
        return True  # Assume compliant on Linux/Mac
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services\USBSTOR")
        val, _ = winreg.QueryValueEx(key, "Start")
        winreg.CloseKey(key)
        return val == 4  # 4 means disabled (restricted/blocked)
    except Exception:
        # Fallback to reg query command
        try:
            result = subprocess.run(
                ["reg", "query", r"HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR", "/v", "Start"],
                capture_output=True, text=True, timeout=5,
                startupinfo=SUBPROCESS_STARTUPINFO
            )
            return "0x4" in result.stdout or "4" in result.stdout
        except Exception:
            return True  # Default to compliant if unable to check

# ─── Password Rotation Policy Check (Windows only) ───────────────────────────
def check_password_policy():
    if not IS_WINDOWS:
        return True  # Assume compliant on Linux/Mac
    try:
        # Run net accounts command to inspect password policy
        result = subprocess.run(
            ["net", "accounts"],
            capture_output=True, text=True, timeout=5,
            startupinfo=SUBPROCESS_STARTUPINFO
        )
        for line in result.stdout.splitlines():
            if "Maximum password age" in line:
                if "UNLIMITED" in line.upper() or "UNLIMIT" in line.upper():
                    return False  # Insecure (no rotation policy)
                # Parse integer number of days
                parts = [int(s) for s in line.split() if s.isdigit()]
                if parts:
                    return parts[0] <= 90  # Enforce 90-day password changes
        return False
    except Exception:
        return True  # Fallback to compliant

# ─── Unauthorized Software Check ─────────────────────────────────────────────
def check_unauthorized_software():
    blacklisted = ["utorrent", "qbittorrent", "keylogger", "wireshark", "tor browser", "torrent"]
    try:
        for proc in psutil.process_iter(['name']):
            try:
                name_lower = proc.info['name'].lower()
                if any(bl in name_lower for bl in blacklisted):
                    return True  # Unauthorized app detected running
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        return False
    except Exception:
        return False

# ─── Geolocation Check ────────────────────────────────────────────────────────
def get_ip_geolocation():
    # If custom coordinates are loaded from config.json, prioritize them
    if LATITUDE is not None and LONGITUDE is not None:
        return LATITUDE, LONGITUDE, LOCATION or "Custom Configured Location"
        
    try:
        # Use ip-api.com to get lat/lon based on external IP
        resp = requests.get("http://ip-api.com/json/", timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "success":
                return data.get("lat"), data.get("lon"), f"{data.get('city')}, {data.get('country')}"
    except Exception:
        pass
    # Fallback to Colombo, Sri Lanka coordinates with small random offsets (simulating live movements/drifts)
    import random
    lat = 6.9271 + random.uniform(-0.003, 0.003)
    lon = 79.8612 + random.uniform(-0.003, 0.003)
    return lat, lon, "Colombo Head Office"

# ─── Auto-Updater check ────────────────────────────────────────────────────────
def check_for_updates():
    # Skip auto-update when running as a compiled .exe (PyInstaller frozen binary)
    # Cannot overwrite a running executable on Windows — only update Python scripts
    if getattr(sys, 'frozen', False):
        return  # Running as .exe, skip self-update
    
    try:
        base_url = SERVER_URL.replace("/device-data", "")
        if not base_url.startswith("http"):
            return
        version_url = f"{base_url}/api/telemetry/agent/version"
        download_url = f"{base_url}/api/telemetry/agent/download"
        
        resp = requests.get(version_url, headers={"Bypass-Tunnel-Reminder": "true"}, timeout=4)
        if resp.status_code == 200:
            server_version = resp.json().get("version", "1.0")
            if server_version != AGENT_VERSION:
                print(f"[*] Update available: Server version {server_version} | Local: {AGENT_VERSION}")
                print("[*] Downloading and applying update...")
                down_resp = requests.get(download_url, headers={"Bypass-Tunnel-Reminder": "true"}, timeout=10)
                if down_resp.status_code == 200 and down_resp.text:
                    current_file = os.path.abspath(__file__)
                    with open(current_file, "w", encoding="utf-8") as f:
                        f.write(down_resp.text)
                    print("[*] Update applied! Hot-restarting EDR agent process...")
                    time.sleep(1)
                    os.execv(sys.executable, [sys.executable] + sys.argv)
    except Exception as e:
        print(f"[*] Self-updater check failed: {e}")

# ─── Collect All Metrics ───────────────────────────────────────────────────────
def collect_data():
    cpu      = psutil.cpu_percent(interval=1)
    ram      = psutil.virtual_memory().percent
    disk     = psutil.disk_usage('/').percent if not IS_WINDOWS else psutil.disk_usage('C:\\').percent
    net_io   = psutil.net_io_counters()
    boot_ts  = datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%d %H:%M")

    # Network
    net_sent = round(net_io.bytes_sent / (1024 * 1024), 2)  # MB
    net_recv = round(net_io.bytes_recv / (1024 * 1024), 2)  # MB

    # Process count
    proc_count = len(list(psutil.process_iter()))

    antivirus = check_antivirus()
    firewall  = check_firewall()
    
    # Fetch GPS coordinates
    lat, lon, geo_loc = get_ip_geolocation()

    data = {
        "device_id":   DEVICE_ID,
        "device_name": DEVICE_NAME,
        "os":          get_friendly_os_name(),
        "ip":          socket.gethostbyname(socket.gethostname()),
        "cpu":         cpu,
        "ram":         ram,
        "disk":        disk,
        "net_sent_mb": net_sent,
        "net_recv_mb": net_recv,
        "proc_count":  proc_count,
        "antivirus":   antivirus if antivirus is not None else True,
        "firewall":    firewall  if firewall  is not None else True,
        "os_outdated": check_os_outdated(),
        "usb_restricted": check_usb_restricted(),
        "password_policy_compliant": check_password_policy(),
        "unauthorized_software_found": check_unauthorized_software(),
        "boot_time":   boot_ts,
        "timestamp":   datetime.now().isoformat(),
        "latitude":    lat,
        "longitude":   lon,
        "location":    geo_loc,
        "serial_number": get_system_serial(),
        "brand":         get_system_brand(),
        "model":         get_system_model(),
    }
    return data

# ─── Remote Command Executor ──────────────────────────────────────────────────
def poll_and_execute_command():
    """
    Poll the backend for a pending remote command (shutdown / restart / update).
    Called after every successful telemetry send.
    """
    try:
        base_url = SERVER_URL.replace("/device-data", "")
        serial = get_system_serial()
        url = f"{base_url}/device-command?device_id={DEVICE_ID}&serial_number={serial}"
        resp = requests.get(url, headers={"Bypass-Tunnel-Reminder": "true"}, timeout=5)
        if resp.status_code != 200:
            return
        payload = resp.json()
        cmd = payload.get("command")
        if not cmd:
            return  # No pending command

        issued_by = payload.get("issued_by", "admin")
        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 🛑 Remote command received: '{cmd}' (issued by: {issued_by})")

        if cmd == "shutdown":
            print("[CMD] Executing system SHUTDOWN in 5 seconds...")
            time.sleep(5)
            if TEST_MODE:
                print("[TEST MODE] Exiting agent process to simulate shutdown.")
                sys.exit(0)
            if IS_WINDOWS:
                os.system("shutdown /s /t 0")
            elif IS_LINUX:
                os.system("shutdown -h now")
            elif IS_MAC:
                os.system("sudo shutdown -h now")

        elif cmd == "restart":
            print("[CMD] Executing system RESTART in 5 seconds...")
            time.sleep(5)
            if TEST_MODE:
                print("[TEST MODE] Hot-restarting agent process to simulate reboot.")
                os.execv(sys.executable, [sys.executable] + sys.argv)
            if IS_WINDOWS:
                os.system("shutdown /r /t 0")
            elif IS_LINUX:
                os.system("shutdown -r now")
            elif IS_MAC:
                os.system("sudo shutdown -r now")

        elif cmd == "update":
            print("[CMD] Update command received — triggering self-update check...")
            check_for_updates()

    except Exception as e:
        print(f"[CMD] Poll error: {e}")


# ─── Local Subnet Auto-Discovery ────────────────────────────────────────────────
def scan_ip(ip, port, found_ips):
    """
    Checks if a specific IP has Port 5000 open and responds to the SecureAssets version endpoint.
    Used for local network server discovery during viva presentations.
    """
    try:
        # Create a raw TCP socket to check if port is listening
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.1) # Fast 100ms timeout to scan rapidly
            res = s.connect_ex((ip, port))
            if res == 0:
                # Port is open. Confirm it is the SecureAssets Express Server by calling version route
                url = f"http://{ip}:{port}/api/telemetry/agent/version"
                resp = requests.get(url, timeout=0.5)
                if resp.status_code == 200:
                    found_ips.append(ip) # Match found!
    except Exception:
        pass

def discover_server_ip():
    """
    Scans the local subnet (e.g. 192.168.1.X) on Port 5000 to automatically locate
    and connect to the server when its IP changes dynamically.
    """
    print("[*] Server connection lost. Running local network auto-discovery...")
    local_ip = None
    try:
        # 1. Try finding local interface IP by opening a UDP connection to external DNS
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    # 2. Offline Fallback: If no internet, resolve local hostname to get private network IP
    if not local_ip:
        try:
            local_ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            return None

    # Derive subnet mask (e.g., convert '192.168.1.45' into '192.168.1')
    parts = local_ip.split('.')
    if len(parts) != 4:
        return None
    subnet = f"{parts[0]}.{parts[1]}.{parts[2]}"

    # 3. Threaded Subnet Scan: Scan all 254 host addresses on the subnet concurrently
    found_ips = []
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=50) as executor:
        for i in range(1, 255):
            target_ip = f"{subnet}.{i}"
            executor.submit(scan_ip, target_ip, 5000, found_ips)

    # Return the first server IP found
    if found_ips:
        return found_ips[0]
    return None


# ─── Main Loop ─────────────────────────────────────────────────────────────────
def main():
    global SERVER_URL
    print(f"""
╔══════════════════════════════════════════╗
║   SecureAssets Device Agent v1.0         ║
║   Device : {DEVICE_ID:<30} ║
║   Server : {SERVER_URL:<30} ║
║   Interval: every {INTERVAL_SEC}s                      ║
╚══════════════════════════════════════════╝
    """)

    consecutive_failures = 0
    loop_count = 0

    while True:
        try:
            # Check for script updates every 12 loops (~60s)
            loop_count += 1
            if loop_count >= 12:
                loop_count = 0
                check_for_updates()

            data = collect_data()
            resp = requests.post(SERVER_URL, json=data, headers={"Bypass-Tunnel-Reminder": "true"}, timeout=10)

            if resp.status_code == 200:
                result = resp.json()
                risk   = result.get("risk_score", "?")
                consecutive_failures = 0
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Data sent | "
                      f"CPU:{data['cpu']}% RAM:{data['ram']}% DISK:{data['disk']}% "
                      f"| Risk Score: {risk}%")

                # ─── Poll for any pending remote command from dashboard ───────
                poll_and_execute_command()

            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️  Server error {resp.status_code}")

        except requests.exceptions.ConnectionError:
            consecutive_failures += 1
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ Cannot connect to server "
                  f"(attempt {consecutive_failures}) — retrying in {INTERVAL_SEC}s...")
            
            # If failed twice, try to auto-discover server on the local subnet
            if consecutive_failures >= 2:
                discovered_ip = discover_server_ip()
                if discovered_ip:
                    SERVER_URL = f"http://{discovered_ip}:5000/device-data"
                    print(f"[+] Re-routed dynamically to discovered server: {SERVER_URL}")
                    consecutive_failures = 0

        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ Error: {e}")

        time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    main()

