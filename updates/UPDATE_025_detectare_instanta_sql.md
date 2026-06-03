# UPDATE 025 — Detectare automată instanță SQL Server
Data: 02 Iunie 2026
Versiune: 2.12.5

## Descriere

Installerul nu mai presupune că SQL Server rulează obligatoriu pe instanța
`.\SQLEXPRESS`. Detectează serviciile SQL disponibile și preferă instanța care
conține deja baza `INFRAFLOW`, inclusiv instalațiile existente pe `.\CIEL`.

Task-ul de pornire citește instanța salvată în `runtime\mssql.env`. Pentru
serverele deja instalate este inclus scriptul `repair-sql-instance.ps1`, care
repară configurația și repornește InfraFlow fără ștergerea bazei de date.

## Fișiere principale modificate

- `installer/setup-db.ps1`
- `installer/setup-task.ps1`
- `scripts/windows/check-sqlserver.ps1`
- `scripts/windows/configure-mssql-login.ps1`
- `scripts/windows/resolve-sqlserver.ps1`
- `scripts/windows/repair-sql-instance.ps1`
