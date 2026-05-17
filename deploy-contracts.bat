@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-contracts.ps1"
pause
