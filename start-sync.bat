@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File .\auto-sync.ps1
pause
