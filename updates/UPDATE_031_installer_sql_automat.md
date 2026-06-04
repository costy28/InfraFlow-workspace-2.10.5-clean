# UPDATE 031 — Installer server cu SQL automat
Data: 04 Iunie 2026
Versiune: 2.12.11

## Descriere
Stabilizare installer curat pentru prima instalare pe servere unde există doar SSMS sau librării SQL, dar nu există SQL Server Engine.

## Modificări
- Installerul de server verifică automat existența unui serviciu SQL Server Engine.
- Dacă există o instanță SQL Server, o pornește și continuă configurarea.
- Dacă nu există nicio instanță SQL Server, instalează automat SQL Server Express 2022 ca `.\SQLEXPRESS`.
- SQL Express poate fi folosit din pachet dacă `SQLEXPR_x64_ENU.exe` este inclus sau este descărcat automat de la Microsoft.
- Configurarea bazei `INFRAFLOW`, loginului `infraflow`, Task Scheduler și health check continuă după instalarea SQL.

## Fișiere modificate
- `installer/install-sqlexpress.ps1`
- `installer/infraflow-server-setup.iss`
- `installer/infraflow-client-setup.iss`
- `package.json`
- `version.json`
- `electron/package.json`
- `electron/package-lock.json`
