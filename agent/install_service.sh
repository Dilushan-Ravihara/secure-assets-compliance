#!/bin/bash
# Shell script to register SecureAssets EDR Agent as a systemd service on Linux
# Run this with sudo!

if [ "$EUID" -ne 0 ]; then
  echo "[ERR] Please run as root (use sudo)!"
  exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
AGENT_PATH="$SCRIPT_DIR/agent.py"
SERVICE_FILE="/etc/systemd/system/secureassets-agent.service"

echo "[*] Registering SecureAssets EDR Agent as a systemd service..."
echo "[*] Agent script path: $AGENT_PATH"

# Check if python3 is installed
if ! command -v python3 &> /dev/null; then
    echo "[ERR] Python3 is not installed. Please install it first."
    exit 1
fi

# Create systemd service unit file
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=SecureAssets EDR Telemetry Agent
After=network.target

[Service]
Type=simple
ExecStart=$(which python3) -u "$AGENT_PATH"
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=secureassets-agent

[Install]
WantedBy=multi-user.target
EOF

echo "[*] Reloading systemd daemon..."
systemctl daemon-reload

echo "[*] Enabling secureassets-agent service to start on boot..."
systemctl enable secureassets-agent.service

echo "[*] Starting service now..."
systemctl start secureassets-agent.service

if systemctl is-active --quiet secureassets-agent.service; then
    echo "[SUCCESS] SecureAssets EDR Agent service successfully installed and running!"
    echo "[*] Use 'sudo systemctl status secureassets-agent.service' to check status."
else
    echo "[ERR] Failed to start service. Please check logs using journalctl."
fi
