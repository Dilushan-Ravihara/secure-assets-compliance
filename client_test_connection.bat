@echo off
:: ============================================================
:: SecureAssets EDR - Client Connectivity Diagnostic Utility
:: Run this on the CLIENT machine to test connection to Server
:: ============================================================

set SERVER_IP=10.89.201.74
set PORT=5000

echo.
echo  ================================================================
echo   SecureAssets EDR Client Connection Diagnostics
echo   Testing connection to Server: %SERVER_IP%:%PORT%
echo  ================================================================
echo.

echo  [1/2] Testing Network Ping to Server (%SERVER_IP%)...
ping -n 3 %SERVER_IP%

if %errorLevel% neq 0 (
    echo.
    echo  [ERR] PING FAILED! The client cannot reach the server IP.
    echo  [!] Check if both machines are on the SAME Wi-Fi/LAN network.
    echo  [!] Check if your network connection profile is set to "Private".
    goto end
)
echo  [+] Ping test succeeded!
echo.

echo  [2/2] Testing TCP Port %PORT% connection...
powershell -Command "
$t = New-Object System.Net.Sockets.TcpClient;
try {
    $t.Connect('%SERVER_IP%', %PORT%);
    Write-Host '[SUCCESS] TCP Port %PORT% is OPEN and reachable!' -ForegroundColor Green;
    $t.Close();
} catch {
    Write-Host '[-] CONNECTION FAILED to port %PORT%! Port is blocked or server is offline.' -ForegroundColor Red;
    Write-Host '[!] Ensure you ran Server_Enable_Firewall_Port.bat as Admin on the Server machine.' -ForegroundColor Yellow;
}
"

:end
echo.
pause
