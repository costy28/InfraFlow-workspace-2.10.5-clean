# UPDATE 028 — Detectare automată profil SQL Server
Data: 02 Iunie 2026
Versiune: 2.12.8

## Descriere

Installerul detectează automat instanța, versiunea și ediția SQL Server
existente și salvează profilul de compatibilitate potrivit.

## Comportament

- SQL Server 2008–2014: profil `legacy`, tabel `dbo.app_state`
  compatibil și fără funcția `ISJSON`.
- SQL Server 2016+: profil `modern`, păstrând modul relațional
  dezactivat implicit până la validarea separată.
- Instanțele existente precum `.\CIEL` și `.\SQLEXPRESS` sunt
  detectate automat.
- Valorile corupte pentru `DB_SERVER` sunt refuzate explicit.
- Configurația este salvată în `.env`, `runtime\mssql.env`
  și launcherul Task Scheduler.
- Dacă utilizatorul Windows nu are drepturi SQL suficiente,
  bootstrap-ul solicită automat credentialele administratorului SQL.

## Fișiere principale

- `scripts/windows/detect-sqlserver-capabilities.ps1`
- `scripts/windows/resolve-sqlserver.ps1`
- `scripts/windows/configure-mssql-login.ps1`
- `scripts/windows/repair-sql-instance.ps1`
- `installer/setup-db.ps1`
- `installer/setup-task.ps1`
- `server/core/db.js`
