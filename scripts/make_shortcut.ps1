$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\adamc\OneDrive\Desktop\DualLumi PRO.lnk")
$Shortcut.TargetPath = "C:\Users\adamc\OneDrive\Desktop\DualLumiControl\Launch_DualLumi_Desktop.bat"
$Shortcut.WorkingDirectory = "C:\Users\adamc\OneDrive\Desktop\DualLumiControl"
$Shortcut.Description = "DualLumi PRO - Advanced Desktop Lighting Controller"
$Shortcut.Save()
Write-Host "SUCCESS"

