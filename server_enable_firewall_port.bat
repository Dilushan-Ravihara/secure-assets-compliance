@echo off
:: ============================================================
:: SecureAssets EDR - Open Port 5000 on Windows Firewall
:: Run this on the SERVER machine as Administrator
:: ============================================================

echo.
echo  ================================================================
echo   SecureAssets Firewall Configurator (Server Port 5000)
echo  ================================================================
echo.

:: Check Admin Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERR] Please run this script as Administrator!
    echo  Right-click this file and choose "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo  [*] Setting up Windows Defender Firewall Rule for Port 5000...
powershell -Command "Remove-NetFirewallRule -DisplayName 'SecureAssets Port 5000' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'SecureAssets Port 5000' -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow"

if %errorLevel% equ 0 (
    echo.
    echo  [SUCCESS] Port 5000 has been successfully opened!
    echo  [*] Other devices on the same Wi-Fi/network can now connect to your server.
) else (
    echo.
    echo  [ERR] Failed to open Port 5000. Please check your firewall settings manually.
)

echo.
pause
