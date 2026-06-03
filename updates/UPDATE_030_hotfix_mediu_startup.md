# UPDATE 030 — Hotfix pornire după UPDATE 029

Data: 03 Iunie 2026  
Versiune: 2.12.10

## Descriere

Hotfix pentru pornirea serverului după instalarea UPDATE 029:
- migrarea `015_mediu.sql` rulează DDL prin `EXEC(N'...')`, compatibil mai bine cu SQL Server vechi și runnerul care adaugă `select 1`;
- dacă schema relațională MSSQL nu se potrivește serverului, aplicația continuă automat pe `dbo.app_state`;
- updaterul suprascrie fișierele de migrare din pachet, necesar pentru hotfix-uri de migrare;
- păstrează funcționalitatea modulului Mediu complet.

## Fișiere modificate

- `db/migrations/015_mediu.sql`
- `server/core/db.js`
- `server/modules/system/routes.js`
- `package.json`
- `server/package.json`
- `client/package.json`
- `electron/package.json`
- `version.json`
