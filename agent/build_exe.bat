@echo off
:: ============================================================
:: SecureAssets EDR Agent - Windows EXE Builder
:: ============================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: Detect python executable
set PYTHON_EXE=py
where py >nul 2>nul || (
    where python >nul 2>nul && set PYTHON_EXE=python || (
        echo [ERR] Python not found. Please install Python 3.
        pause & exit /b 1
    )
)

echo.
echo  ================================================================
echo   SecureAssets EDR Agent - EXE Builder
echo   Python: %PYTHON_EXE%
echo  ================================================================
echo.

:: Install required dependencies
echo [*] Installing Python dependencies...
%PYTHON_EXE% -m pip install psutil requests pyinstaller --quiet

if %errorLevel% neq 0 (
    echo [ERR] Failed to install dependencies.
    pause & exit /b 1
)

:: Build the executable
::   --onefile     = single standalone .exe
::   --console     = keep console window so you can see agent output and errors
::   --name        = output exe name
echo [*] Compiling agent.py with PyInstaller...
%PYTHON_EXE% -m PyInstaller --clean --onefile --console --name="SecureAssetsAgent" agent.py

if %errorLevel% neq 0 (
    echo [ERR] PyInstaller build failed.
    pause & exit /b 1
)

echo [SUCCESS] SecureAssetsAgent.exe built!

:: Auto-copy config.json to dist/ next to the exe
if exist "config.json" (
    copy /Y "config.json" "dist\config.json" >nul
    echo [*] Copied config.json to dist\
) else (
    echo [WARN] config.json not found - creating default...
    (
        echo {
        echo   "SERVER_URL": "http://192.168.8.132:5000/device-data",
        echo   "INTERVAL_SEC": 5,
        echo   "TEST_MODE": false
        echo }
    ) > "dist\config.json"
    echo [*] Created default dist\config.json - edit SERVER_URL if needed.
)

:: Copy to backend downloads folder for dashboard download button
if exist "..\backend" (
    mkdir "..\backend\downloads" 2>nul
    copy /Y "dist\SecureAssetsAgent.exe" "..\backend\downloads\SecureAssetsAgent.exe" >nul
    copy /Y "dist\config.json" "..\backend\downloads\config.json" >nul
    echo [*] Copied exe and config to backend\downloads\ for dashboard download.
)

echo.
echo  ================================================================
echo   Build complete!
echo   EXE location : %SCRIPT_DIR%dist\SecureAssetsAgent.exe
echo   Config       : %SCRIPT_DIR%dist\config.json
echo.
echo   To deploy on another machine:
echo     1. Copy BOTH files: SecureAssetsAgent.exe + config.json
echo     2. Keep them in the SAME FOLDER
echo     3. Double-click SecureAssetsAgent.exe to run
echo   ================================================================
echo.
pause
