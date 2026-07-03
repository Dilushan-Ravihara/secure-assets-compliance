@echo off
:: Batch script to build SecureAssets EDR Agent executable (.exe)

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: Detect python executable
set PYTHON_EXE=python
where py >nul 2>nul && set PYTHON_EXE=py
where python >nul 2>nul && set PYTHON_EXE=python

if exist "%LocalAppData%\Python\pythoncore-3.14-64\python.exe" (
    set PYTHON_EXE="%LocalAppData%\Python\pythoncore-3.14-64\python.exe"
) else if exist "%LocalAppData%\Python\bin\python.exe" (
    set PYTHON_EXE="%LocalAppData%\Python\bin\python.exe"
)

echo [*] Using Python executable: %PYTHON_EXE%

echo [*] Checking Python dependencies...
%PYTHON_EXE% -m pip install psutil requests pyinstaller

if %errorLevel% neq 0 (
    echo [ERR] Failed to install Python dependencies. Please check if Python and pip are installed.
    pause
    exit /b
)

echo [*] Compiling agent.py using PyInstaller...
%PYTHON_EXE% -m PyInstaller --clean --onefile --noconsole --name="SecureAssetsAgent" agent.py

if %errorLevel% equ 0 (
    echo [SUCCESS] SecureAssetsAgent.exe built successfully!
    echo [*] Executable is located in: %SCRIPT_DIR%dist\SecureAssetsAgent.exe
    echo [*] You can distribute this executable to other Windows devices.
    echo [*] To configure it, place a config.json in the same folder as the .exe with:
    echo     { "SERVER_URL": "http://YOUR_SERVER_IP:5000/device-data" }
    
    :: Copy to backend downloads folder if exists
    if exist "..\backend" (
        mkdir "..\backend\downloads" 2>nul
        copy "dist\SecureAssetsAgent.exe" "..\backend\downloads\SecureAssetsAgent.exe" >nul
        echo [*] Copied to backend downloads folder.
      if exist "dist\SecureAssetsAgent.exe" (
        copy "dist\SecureAssetsAgent.exe" "..\backend\downloads\SecureAssetsAgent.exe" >nul
      )
    )
) else (
    echo [ERR] PyInstaller compilation failed.
)
pause
