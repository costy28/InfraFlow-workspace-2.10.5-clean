# UPDATE 021 — Migrare completă pe MSSQL
Data: 01 Iunie 2026
Versiune: 2.12.1

## Descriere
SQL Server Express este baza implicită pentru instalările de producție. La pornire, InfraFlow creează automat `InfraFlowDB`, inițializează trackerul `dbo.schema_migrations` și expune `GET /api/system/health`.

Stocarea MSSQL principală este `dbo.app_state`. Proiecția relațională istorică rămâne opt-in prin `MSSQL_RELATIONAL=1` până la uniformizarea cheilor legacy `INT`/text/UUID.

## Operațional
- Diagnostic SQL Server: `scripts/windows/check-sqlserver.ps1`
- Migrare instalări JSON existente: `node scripts/migrate-json-to-mssql.js`
- Backup MSSQL zilnic la 02:00, cu retenție de 7 copii
- Task Scheduler: `InfraFlow Backup MSSQL`

## Fișiere principale
- `server/core/db.js`
- `server/core/migrations.js`
- `server/app.js`
- `installer/setup-db.ps1`
- `installer/setup-task.ps1`
- `scripts/windows/backup-mssql.ps1`
- `scripts/windows/schedule-backup.ps1`
