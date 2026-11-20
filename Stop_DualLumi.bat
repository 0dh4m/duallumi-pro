@echo off
title Stop DualLumi Background Service
color 0C
echo ========================================================
echo        Stop DualLumi PRO Background Service
echo ========================================================
echo.
echo Stopping running DualLumi server processes...

powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo.
echo [OK] DualLumi PRO background processes have been terminated.
echo.
timeout /t 3
exit
