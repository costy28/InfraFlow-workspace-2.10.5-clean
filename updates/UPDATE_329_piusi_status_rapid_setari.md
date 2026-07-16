# UPDATE 329 — PIUSI status rapid în Setări

Versiune: `2.12.309`  
Data: `2026-07-16`

## Context

După optimizarea health-ului MSSQL și a verificării schemei SQL, încărcarea paginii Setări mai putea porni verificări PIUSI inutile. Pe instalări fără MDB disponibil sau cu căi externe lente, statusul și mapările PIUSI puteau întârzia încărcarea generală.

## Modificări

- `server/modules/integration/piusi.js`
  - `piusiStatus()` nu mai verifică implicit existența fișierului MDB;
  - răspunsul include `mdb_verificat` și `mdb_accesibil`;
  - verificarea fișierului se face explicit prin `GET /integration/piusi/status?check=1`.
- `client/src/pages/SetariPage.jsx`
  - încărcarea generală nu mai cere automat `/integration/piusi/mapari`;
  - butonul manual „Reîncarcă status și mapări PIUSI” verifică MDB-ul și încarcă mapările;
  - panoul explică faptul că MDB-ul nu este verificat la încărcarea rapidă.

## Verificări

- `node --check server/modules/integration/piusi.js`
- build frontend;
- audit local complet.
