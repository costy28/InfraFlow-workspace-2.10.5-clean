@echo off
title InfraFlow ERP
cd /d "%~dp0"
if exist "%~dp0start-server.bat" (
    call "%~dp0start-server.bat"
    exit /b %ERRORLEVEL%
)
echo EROARE: Lipseste start-server.bat. Rulati installerul server sau repair-autostart.ps1.
pause
exit /b 1
