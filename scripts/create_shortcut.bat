@echo off
title Create DualLumi Desktop Shortcut
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0make_shortcut.ps1"
echo [OK] Shortcut created successfully on Desktop: DualLumi PRO.lnk
timeout /t 2 >nul
