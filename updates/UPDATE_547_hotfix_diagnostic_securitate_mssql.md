# UPDATE 547 — Hotfix diagnostic securitate în MSSQL

Versiune: 2.12.527  
Data: 2026-09-03

## Problema

În Setări → Sistem → Securitate, diagnosticul putea afișa eroarea:

`DEFAULT_MSSQL_CONNECTION_STRING is not defined`

Problema apărea în instalările care rulează cu SQL Server Express/MSSQL, când helper-ele de diagnostic aveau nevoie de fallback-ul implicit de conexiune.

## Cauză

Constanta `DEFAULT_MSSQL_CONNECTION_STRING` există în `server/core/db.js`, dar nu era importată în modulele de sistem care construiesc diagnosticul MSSQL.

## Rezolvare

- `server/modules/system/service.js` importă fallback-ul MSSQL oficial din `core/db`.
- `server/modules/system/routes.js` importă același fallback pentru helper-ele legacy MSSQL.
- A fost verificat explicit scenariul `DB_MODE=mssql`.

## Impact

- Panoul Securitate se poate încărca din nou în instalările MSSQL.
- Nu se expun parole, tokenuri sau connection string-uri în client.
- Nu necesită migrare SQL nouă.

## Verificare recomandată

1. Aplică update-ul.
2. Intră în Setări → Sistem → Securitate.
3. Apasă „Reverifică”.
4. Confirmă că dispare eroarea și apare diagnosticul de securitate.
