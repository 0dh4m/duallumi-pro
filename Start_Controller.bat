@echo off
title DualLumi PRO v3.0 - Smart Lighting Controller
color 0B
echo ========================================================
echo       DualLumi PRO v3.0 - Unified BLE Controller
echo ========================================================
echo.
echo Choose how you want to run DualLumi:
echo.
echo  [1] Run in Background (RECOMMENDED)
echo      - Runs silently even after closing console and browser.
echo      - Schedules and alarms trigger 100%% automatically!
echo.
echo  [2] Run with Live Console Logs
echo.
echo  [3] Stop Background Service
echo.
echo  [4] Scan BLE Devices
echo.
set /p choice="Enter choice (1, 2, 3, or 4) [Default: 1]: "

if "%choice%"=="2" goto console
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto scan
goto background

:background
echo.
echo Launching DualLumi PRO silently in background...
wscript.exe "%~dp0Start_DualLumi_Background.vbs"
timeout /t 2 >nul
start http://localhost:8080
exit

:console
echo.
echo Launching DualLumi PRO with live console output...
start http://localhost:8080
python backend\server.py
pause
exit

:stop
call "%~dp0Stop_DualLumi.bat"
pause
exit

:scan
call "%~dp0Scan_Devices.bat"
goto background
