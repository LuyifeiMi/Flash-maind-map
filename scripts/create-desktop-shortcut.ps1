$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'FlashMap.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'launch-desktop.ps1') + '"'
$shortcut.WorkingDirectory = $projectPath
$shortcut.Description = 'FlashMap - local mind maps and study cards'
$shortcut.IconLocation = (Join-Path $projectPath 'public\flashmap.ico') + ',0'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output "Created desktop shortcut: $shortcutPath"
