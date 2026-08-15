# auto-sync.ps1
# Watches this project folder for file changes and automatically
# commits + pushes to GitHub, so your local PC and GitHub always match.
#
# HOW TO USE:
# 1. Save this file inside your Preket project root folder
#    (same folder where you see the .git folder).
# 2. Open PowerShell in that folder (in Cursor: Terminal > New Terminal,
#    make sure it's PowerShell not bash).
# 3. Run:  powershell -ExecutionPolicy Bypass -File .\auto-sync.ps1
# 4. Leave this terminal window open while you work with Cursor.
#    Every time you save a file, it will wait a short pause (in case
#    you're still editing), then commit + push automatically.
# 5. To stop watching, just close this terminal window or press Ctrl+C.

$projectPath = (Get-Location).Path
$debounceSeconds = 20   # waits this long after the LAST change before syncing
$lastChangeTime = $null
$pendingSync = $false

Write-Host "Watching folder: $projectPath"
Write-Host "Auto-sync active. Waiting for file changes..."
Write-Host "(Press Ctrl+C to stop)"
Write-Host ""

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $projectPath
$watcher.IncludeSubdirectories = $true
$watcher.Filter = "*.*"
$watcher.EnableRaisingEvents = $true

$action = {
    $path = $Event.SourceEventArgs.FullPath
    # Ignore .git internals and common noisy folders
    if ($path -match '\\\.git\\' -or $path -match '\\node_modules\\' -or $path -match '\\\.next\\') {
        return
    }
    $global:lastChangeTime = Get-Date
    $global:pendingSync = $true
}

Register-ObjectEvent $watcher "Changed" -Action $action | Out-Null
Register-ObjectEvent $watcher "Created" -Action $action | Out-Null
Register-ObjectEvent $watcher "Deleted" -Action $action | Out-Null
Register-ObjectEvent $watcher "Renamed" -Action $action | Out-Null

while ($true) {
    Start-Sleep -Seconds 2

    if ($pendingSync -and $lastChangeTime -ne $null) {
        $secondsSinceChange = (Get-Date) - $lastChangeTime
        if ($secondsSinceChange.TotalSeconds -ge $debounceSeconds) {
            $status = git status --short
            if ($status) {
                $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                Write-Host "[$timestamp] Changes detected, syncing to GitHub..."
                git add -A
                git commit -m "auto-sync: $timestamp" | Out-Null
                git push origin master
                Write-Host "[$timestamp] Synced."
                Write-Host ""
            }
            $pendingSync = $false
        }
    }
}
