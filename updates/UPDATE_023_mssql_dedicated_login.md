# UPDATE 023 — MSSQL izolat pentru InfraFlow
Data: 01 Iunie 2026
Versiune: 2.12.3

## Descriere
InfraFlow folosește exclusiv baza dedicată `INFRAFLOW` și loginul SQL dedicat `infraflow`. Loginul nu primește roluri de server și este mapat numai în baza aplicației.

## Configurare
- Baza și loginul se creează manual în SSMS cu `scripts/windows/CREARE_BAZA_INFRAFLOW.sql`
- Scriptul activează autentificarea mixtă Windows + SQL Server; instanța `SQLEXPRESS` se repornește după rulare
- Parola este solicitată interactiv de `scripts/windows/configure-mssql-login.ps1`
- Credentialele sunt salvate în `runtime/mssql.env`, cu ACL numai pentru `SYSTEM` și `Administrators`
- Taskul Windows folosește SQL Authentication, nu identitatea Windows `NT AUTHORITY\SYSTEM`

## Compatibilitate
Modulele legacy interoghează tabele relaționale numai dacă `MSSQL_RELATIONAL=1`. Implicit folosesc `dbo.app_state`.
