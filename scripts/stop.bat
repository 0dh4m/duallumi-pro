@echo off
title Stop DualLumi PRO
echo [INFO] Terminating running DualLumi processes...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq DualLumi*" >nul 2>nul
taskkill /F /IM pythonw.exe /FI "WINDOWTITLE eq DualLumi*" >nul 2>nul
echo [OK] DualLumi processes stopped.
timeout /t 2 >nul
