@echo off
:: Verifică dacă rulează ca Administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :start
) else (
    echo Repornire ca Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:start
title InfraFlow ERP
cd /d "%~dp0"
set PORT=4180
set INFRAFLOW_PORT=4180
set INFRAFLOW_DB_PROVIDER=json
set DB_MODE=json
set APP_KEY=infraflow-cheie-secreta-32char01
set NODE_ENV=production
node server\app.js
if %ERRORLEVEL% neq 0 (
    echo EROARE: Serverul nu a putut porni!
    pause
)
