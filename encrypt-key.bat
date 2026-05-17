@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\key-manager.ps1" -Encrypt
pause
