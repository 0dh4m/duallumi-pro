@echo off
title DualLumi PRO v3.0 - Open Web App
color 0B

echo Checking server status...
powershell -NoProfile -Command "(Get-Process python*, pythonw* -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter \"ProcessId = $($_.Id)\" -ErrorAction SilentlyContinue).CommandLine -like '*server.py*' }).Count" > "%TEMP%\dl_chk.tmp"
set /p CHK=<"%TEMP%\dl_chk.tmp"
del "%TEMP%\dl_chk.tmp" 2>nul

if "%CHK%"=="0" (
    echo Starting DualLumi server in background...
    wscript.exe "%~dp0Start_DualLumi_Background.vbs"
    timeout /t 2 >nul
)

echo Opening DualLumi PRO in browser...
start http://localhost:8080
exit
