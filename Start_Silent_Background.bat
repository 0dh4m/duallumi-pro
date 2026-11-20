@echo off
title DualLumi PRO v3.0 - Silent Background Launcher
color 0A
echo ========================================================
echo        DualLumi PRO v3.0 - Silent Background Service
echo ========================================================
echo.
echo Launching DualLumi in the background without any console window...
wscript.exe "%~dp0Start_DualLumi_Background.vbs"

echo.
echo [OK] DualLumi PRO is now running silently in the background!
echo [OK] Smart schedules and sunrise alarms will trigger 24/7.
echo.
echo Opening web controller in browser...
timeout /t 2 >nul
start http://localhost:8080
exit
