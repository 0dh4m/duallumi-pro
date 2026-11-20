@echo off
title Install DualLumi AutoStart on Boot
color 0B
echo ========================================================
echo     Install DualLumi PRO AutoStart on Windows Boot
echo ========================================================
echo.
echo Setting up automatic startup shortcut...

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup\DualLumi_Background.lnk')); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"' + [System.IO.Path]::Combine('%~dp0', 'Start_DualLumi_Background.vbs') + '\"'; $s.WorkingDirectory = '%~dp0'; $s.Save()"

echo.
echo [OK] Successfully installed!
echo DualLumi PRO will now start silently in the background whenever Windows boots up!
echo Your alarms and schedules will always work automatically.
echo.
echo If you ever want to remove it, simply run Uninstall_AutoStart.bat.
echo.
pause
