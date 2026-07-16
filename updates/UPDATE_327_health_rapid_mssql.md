# UPDATE 327 — Health rapid MSSQL

Versiune: `2.12.307`  
Data: `2026-07-16`

## Context

După update, serverul poate fi pornit, dar unele verificări MSSQL lente pot bloca temporar firul Node.js. În această stare, clientul desktop poate interpreta greșit situația ca server indisponibil.

## Modificări

- `server/core/db.js`
  - `databaseHealth()` returnează implicit un răspuns rapid în MSSQL, fără query PowerShell sincron;
  - diagnosticul complet rămâne disponibil prin `databaseHealth({ quick: false })`;
  - răspunsul rapid marchează explicit `quick: true` și `connection.checked: false`.
- `client/src/pages/SetariPage.jsx`
  - statusul SQL rapid este afișat ca „Server activ — SQL neverificat rapid”;
  - utilizatorul este ghidat către „Testează conexiunea” pentru verificarea reală SQL Server.

## Verificări

- `node --check server/core/db.js`
- build frontend
- audit local complet
