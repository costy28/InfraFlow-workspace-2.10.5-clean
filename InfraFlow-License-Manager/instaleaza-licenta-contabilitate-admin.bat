@echo off
setlocal

set "NEW_LICENSE=%~dp0clienti\licenta-publiserv-accounting-2026-06-13.iflic"
set "TARGET=C:\Program Files (x86)\InfraFlow\licenta.iflic"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Porneste acest fisier cu Run as administrator.
  pause
  exit /b 1
)

if not exist "%NEW_LICENSE%" (
  echo Nu exista licenta noua:
  echo %NEW_LICENSE%
  pause
  exit /b 1
)

if exist "%TARGET%" (
  copy /Y "%TARGET%" "C:\Program Files (x86)\InfraFlow\licenta.backup-contabilitate.iflic" >nul
)

copy /Y "%NEW_LICENSE%" "%TARGET%" >nul
if not "%errorlevel%"=="0" (
  echo Nu am putut copia licenta in Program Files.
  pause
  exit /b 1
)

echo Licenta cu modulul Contabilitate a fost instalata.
echo Reporneste serverul InfraFlow ca sa fie reincarcata licenta.
pause
