@echo off
:: ============================================================
:: SecureAssets EDR Agent - Windows Auto-Start Installer
:: ============================================================
:: Run this as Administrator to register the agent as a
:: Windows Scheduled Task that starts automatically on boot.
:: ============================================================

setlocal enabledelayedexpansion

:: ── Check Administrator Privileges ──────────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  [ERR] Please run this script as Administrator!
    echo  Right-click install_service.bat and choose "Run as administrator"
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0
set EXE_PATH=%SCRIPT_DIR%dist\SecureAssetsAgent.exe
set AGENT_PY=%SCRIPT_DIR%agent.py
set CONFIG_PATH=%SCRIPT_DIR%config.json
set TASK_NAME=SecureAssetsAgent

echo.
echo  ================================================================
echo   SecureAssets EDR Agent - Auto-Start Service Installer
echo  ================================================================
echo.

:: ── Step 1: Determine what to run ───────────────────────────
if exist "%EXE_PATH%" (
    echo  [*] Found compiled agent: %EXE_PATH%
    set "RUN_CMD=\"%EXE_PATH%\""
    set "AGENT_LABEL=SecureAssetsAgent.exe"
) else (
    echo  [*] Compiled .exe not found, using Python script fallback.
    echo  [*] Script Path: %AGENT_PY%
    set "RUN_CMD=pythonw.exe \"%AGENT_PY%\""
    set "AGENT_LABEL=agent.py (Python)"
)

:: ── Step 2: Set up config.json if it doesn't exist ──────────
if not exist "%CONFIG_PATH%" (
    echo  [*] config.json not found. Creating default config...
    echo  [!] IMPORTANT: Edit config.json and set your server IP!
    (
        echo {
        echo   "SERVER_URL": "http://YOUR_SERVER_IP:5000/device-data",
        echo   "INTERVAL_SEC": 5
        echo }
    ) > "%CONFIG_PATH%"
    echo  [*] Created: %CONFIG_PATH%
    echo.
    echo  ================================================================
    echo   ACTION REQUIRED: Edit config.json and replace YOUR_SERVER_IP
    echo   with the actual IP address of the SecureAssets server!
    echo  ================================================================
    echo.
    notepad "%CONFIG_PATH%"
)

:: ── Step 3: Remove existing task (clean re-install) ─────────
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorLevel% equ 0 (
    echo  [*] Removing existing scheduled task for clean re-install...
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
)

:: ── Step 4: Register the Scheduled Task ─────────────────────
echo  [*] Registering %AGENT_LABEL% as a Windows Startup Task...
schtasks /create /tn "%TASK_NAME%" /tr %RUN_CMD% /sc onstart /ru SYSTEM /rl HIGHEST /f

if %errorLevel% equ 0 (
    echo.
    echo  [SUCCESS] SecureAssets EDR Agent registered as Windows Startup Task!
    echo  [*]  Task Name  : %TASK_NAME%
    echo  [*]  Runs As    : SYSTEM (Silent background)
    echo  [*]  Trigger    : On every Windows startup
    echo.
    
    :: ── Step 5: Start the agent right now (no need to reboot) ──
    echo  [*] Starting agent now (no reboot required)...
    schtasks /run /tn "%TASK_NAME%"
    
    if %errorLevel% equ 0 (
        echo  [SUCCESS] Agent is now running in the background!
        echo  [*] Check the SecureAssets dashboard to verify this device appears.
    ) else (
        echo  [WARN] Could not start the task immediately. It will start on next boot.
    )
) else (
    echo.
    echo  [ERR] Failed to create Scheduled Task. 
    echo  [ERR] Make sure you ran this as Administrator.
)

echo.
echo  ── Useful Commands ──────────────────────────────────────
echo  Check task status  : schtasks /query /tn "%TASK_NAME%"
echo  Start manually     : schtasks /run /tn "%TASK_NAME%"
echo  Stop the agent     : schtasks /end /tn "%TASK_NAME%"
echo  Remove the task    : schtasks /delete /tn "%TASK_NAME%" /f
echo  ─────────────────────────────────────────────────────────
echo.
pause
