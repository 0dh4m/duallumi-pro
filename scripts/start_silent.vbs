Set WshShell = CreateObject("WScript.Shell")
Dim scriptDir
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir & "\.."
WshShell.Run "pythonw duallumi_native.py", 0, False
Set WshShell = Nothing
