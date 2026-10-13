# UPDATE 705 — Entry point unic pentru server

Versiune: **2.12.685**  
Data: **13 octombrie 2026**

## Scop

Eliminarea diferenței dintre runtime-ul testat și runtime-ul livrat în
instalațiile Windows/Linux.

## Modificări

- `server/app.js` este entry point-ul canonic al serverului;
- manifestele NPM pornesc direct entry point-ul canonic;
- smoke-ul modular, acceptanța de release și auditul comercial pornesc runtime-ul
  livrat;
- lansatoarele Demo JSON și Demo MSSQL folosesc același entry point;
- `server/src/server.js` este păstrat numai ca adaptor pentru automatizările vechi;
- adaptorul legacy nu mai creează listener sau handlere de proces proprii;
- `server/app.js` recunoaște direct `INFRAFLOW_PORT`, cu fallback la `PORT`;
- o suită dedicată verifică toate aceste invariabile.

## Compatibilitate

- serviciile Windows, Task Scheduler și systemd foloseau deja `server/app.js`;
- scurtăturile vechi către `server/src/server.js` continuă să funcționeze;
- nu se modifică schema bazei de date, setările, utilizatorii sau permisiunile;
- nu este necesară migrare de date.

## Validare

- sintaxă Node pentru ambele căi de pornire;
- 4/4 teste dedicate entry point;
- test release pe bază JSON izolată;
- smoke read-only complet: 69 verificări.
