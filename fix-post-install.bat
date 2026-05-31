@echo off
title InfraFlow - Configurare post-instalare
cd /d "C:\Program Files (x86)\InfraFlow"

echo.
echo ================================================
echo  InfraFlow - Configurare post-instalare
echo ================================================
echo.

:: 1. npm install
echo [1/4] Instalez dependentele Node.js...
cd server
call npm install --omit=dev --prefer-offline
cd ..
echo OK

:: 2. Copiaza client/dist in public/
echo [2/4] Configurez fisierele client...
if not exist "public" mkdir public
xcopy /E /Y /Q "client\dist\*" "public\"
echo OK

:: 3. Creaza app-db.json cu user admin
echo [3/4] Creez baza de date initiala...
if not exist "data" mkdir data
if not exist "data\app-db.json" (
  echo {"users":[{"id":"admin-1","username":"admin","password":"admin123","name":"Administrator","email":"admin@infraflow.ro","role":"superadmin","active":true}],"devices":[],"workstationRequests":[],"core":{"users":[],"departments":[],"settings":{"company_name":"","modules_enabled":[],"customRoles":[]}},"hr":{"employees":[],"timesheets":[],"leaveRequests":[],"authorizations":[],"tures":[],"schedules":[]},"fleet":{"assets":[],"tripLogs":[],"fcEntries":[]},"mechanization":{"workOrders":[],"fuelings":[],"repairs":[],"revisions":[]},"gestiune":{"materials":[],"suppliers":[],"nir":[],"bonConsum":[],"stockMovements":[]},"inventory":{"materials":[],"movements":[],"stockOperations":[],"departmentStocks":[],"departmentConsumptions":[]},"production":{"recipes":[],"batches":[]},"controlling":{"costCenters":[]},"messaging":{"channels":[],"messages":[]}} > "data\app-db.json"
  echo Baza de date creata!
) else (
  echo Baza de date exista deja - nu suprascriu.
)

:: 4. Creaza .env
echo [4/4] Configurez .env...
if not exist ".env" (
  echo PORT=4180 > .env
  echo INFRAFLOW_PORT=4180 >> .env
  echo DB_MODE=json >> .env
  echo NODE_ENV=production >> .env
  echo APP_KEY=infraflow-cheie-secreta-32char01 >> .env
  echo .env creat!
) else (
  echo .env exista deja.
)

:: 5. Porneste Task Scheduler
echo.
echo [5/5] Pornesc InfraFlow...
powershell -NonInteractive -Command "Start-ScheduledTask -TaskName 'InfraFlow ERP' 2>$null; Start-Sleep 3"

:: Verifica
ping -n 4 127.0.0.1 > nul
powershell -NonInteractive -Command "try { Invoke-WebRequest http://localhost:4180 -TimeoutSec 5 -UseBasicParsing | Out-Null; Write-Host 'InfraFlow pornit cu succes!' } catch { Write-Host 'Serverul inca porneste...' }"

echo.
echo ================================================
echo  Gata! Deschide: http://localhost:4180
echo  Username: admin
echo  Parola:   admin123
echo ================================================
echo.
pause
