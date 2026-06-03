# UPDATE 026 — Installer curat + restore MSSQL
Data: 02 Iunie 2026
Versiune: 2.12.6

## Descriere

Installer server complet pentru reinstalare de la zero pe instanțe SQL
existente, inclusiv SQL Server 2008 `.\CIEL`.

## Modificări

- creare automată bază `INFRAFLOW` și login SQL dedicat;
- parolă SQL generată automat și salvată protejat;
- compatibilitate SQL Server 2008 pentru rolurile `db_owner` și `sysadmin`;
- validare obligatorie a pornirii serverului la finalul installerului;
- script explicit de resetare exclusiv pentru baza `INFRAFLOW`;
- restore MSSQL `.bak` cu backup de siguranță înainte de restaurare;
- script administrativ `restore-mssql.ps1`.
