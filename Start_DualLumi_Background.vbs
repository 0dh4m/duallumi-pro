Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strCurDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurDir

' Launch server silently via pythonw (no black CMD console window!)
WshShell.Run "pythonw backend\server.py", 0, False
