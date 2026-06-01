# UPDATE 022 — Hotfix acces MSSQL Task Scheduler
Data: 01 Iunie 2026
Versiune: 2.12.2

## Problemă
Taskul Windows `InfraFlow ERP` rulează ca `NT AUTHORITY\SYSTEM`. Pe o instalare SQL Express nouă, contul nu avea login MSSQL și serverul nu putea crea sau deschide `InfraFlowDB`.

## Rezolvare
- Script nou: `scripts/windows/repair-mssql-system-access.ps1`
- Creează baza `InfraFlowDB` înainte de prima pornire
- Creează login și user MSSQL pentru `NT AUTHORITY\SYSTEM`
- Acordă rolul `db_owner` în `InfraFlowDB`
- Configurează ACL backup pentru serviciul `MSSQL$SQLEXPRESS`
- Rulează și când `.env` exista deja
