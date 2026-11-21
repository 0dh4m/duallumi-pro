@echo off
title Uninstall DualLumi AutoStart
color 0E
echo ========================================================
echo     Uninstall DualLumi PRO AutoStart on Boot
echo ========================================================
echo.

powershell -Command "$p = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup\DualLumi_Background.lnk'); if (Test-Path $p) { Remove-Item -Force $p; Write-Host '[OK] AutoStart shortcut removed successfully.' } else { Write-Host 'No AutoStart shortcut found.' }"

echo.
pause
