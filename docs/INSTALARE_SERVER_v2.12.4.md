# Instalare InfraFlow Server v2.12.4

## 1. Pregătire server
Rulați instalarea cu un cont Windows Administrator.

Instalați înainte SQL Server Express 2022 cu instanța implicită `SQLEXPRESS`:
https://www.microsoft.com/sql-server/sql-server-downloads

Verificați că serviciul `MSSQL$SQLEXPRESS` rulează:
```powershell
Get-Service -Name "MSSQL`$SQLEXPRESS"
```

## 2. Creare bază dedicată
În SSMS, deschideți și rulați `CREARE_BAZA_INFRAFLOW.sql` după înlocuirea textului `SCHIMBA_PAROLA`.

Scriptul creează:
- baza `INFRAFLOW`
- loginul SQL `infraflow`
- userul `infraflow`, cu rol `sysadmin`, necesar pentru migrări și accesul la bazele de integrare precum `autoMinder5`
- autentificarea mixtă Windows + SQL Server necesară loginului dedicat

După rularea scriptului, reporniți instanța SQL Express:
```powershell
Restart-Service -Name "MSSQL`$SQLEXPRESS" -Force
```

## 3. Instalare server
1. Rulați `InfraFlow-Server-Setup-v2.12.4.exe` ca Administrator.
2. Păstrați directorul implicit: `C:\Program Files (x86)\InfraFlow`.
3. Introduceți parola SQL pentru userul `infraflow` când este solicitată.
4. Așteptați configurarea dependențelor Node.js și a taskurilor Windows.
5. La final, deschideți `http://localhost:4180`.
6. Pentru acces din rețea folosiți `http://IP-SERVER:4180`.

Installerul creează:
- Task Scheduler `InfraFlow ERP` pentru pornirea serverului la boot.
- Launcher persistent: dacă SQL Express nu este încă pregătit la boot, serverul reîncearcă automat după 15 secunde.
- Task Scheduler `InfraFlow Backup MSSQL` pentru backup zilnic la ora 02:00.
- Backupuri în `C:\InfraFlow\backups`, cu retenție de 7 copii.

## 4. Verificare după instalare
```powershell
Invoke-RestMethod http://localhost:4180/api/system/health
Get-ScheduledTask -TaskName "InfraFlow ERP", "InfraFlow Backup MSSQL"
Get-ChildItem C:\InfraFlow\backups
```

Endpoint-ul de health trebuie să returneze `ok: true`, `mode: mssql`, `database: INFRAFLOW`.

## 5. Client desktop
Pe fiecare stație de lucru rulați `InfraFlow-Client-Setup-v2.12.4.exe`.

La prima pornire configurați URL-ul serverului:
```text
http://IP-SERVER:4180
```

## 6. Migrare de la instalări JSON vechi
Înainte de migrare faceți o copie a directorului InfraFlow. Apoi, din directorul aplicației:
```powershell
node .\scripts\migrate-json-to-mssql.js
```

Scriptul importă datele numai dacă `INFRAFLOW` este goală și păstrează directorul JSON sub forma `data_backup_YYYYMMDD-HHMMSS`.

## 7. Diagnostic rapid
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\check-sqlserver.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\configure-mssql-login.ps1
Get-Content .\logs\infraflow.err.log -Tail 100
Start-ScheduledTask -TaskName "InfraFlow ERP"
```

Pentru acces extern prin Cloudflare Tunnel, originea trebuie să indice spre `http://localhost:4180`.

## 8. Hotfix peste o instalare existentă
1. Rulați din nou `CREARE_BAZA_INFRAFLOW.sql` în SSMS, cu parola loginului `infraflow`.
2. Reporniți `MSSQL$SQLEXPRESS`.
3. Instalați `InfraFlow-Server-Setup-v2.12.4.exe` peste directorul existent.
4. După instalare sau reboot verificați:
```powershell
Start-ScheduledTask -TaskName "InfraFlow ERP"
Start-Sleep -Seconds 20
Invoke-RestMethod http://localhost:4180/api/system/health
Get-Content "C:\Program Files (x86)\InfraFlow\logs\infraflow.err.log" -Tail 80
```

În Mecanizare → Import Autominder completați și salvați:
```text
Server=.\SQLEXPRESS;Database=autoMinder5;User Id=infraflow;Password=PAROLA_SQL;Encrypt=False;TrustServerCertificate=True
```
