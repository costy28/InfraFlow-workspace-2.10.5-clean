# UPDATE 324 — Centre cost generice și legături Controlling

Versiune: `2.12.304`  
Data: `2026-07-15`

## Context

Modulul Controlling încă păstra seed-uri istorice de la clientul pilot Publiserv. Centrele respective erau reactivate automat în JSON mode, iar în MSSQL editarea/dezactivarea nu ajungea în tabelul real.

## Modificări

- Eliminat seed-ul `db/seeds/cost_centers_publiserv.sql` din pachet.
- Adăugată migrarea `066_controlling_generic_cost_centers.sql`:
  - dezactivează centrele Publiserv istorice;
  - marchează motivul anulării;
  - dezactivează legăturile automate vechi;
  - curăță `fleet.assets.cost_center_id` pentru centrele dezactivate;
  - extinde asocierea obiectelor cu tipul `department`.
- Backend Controlling:
  - nu mai re-seedează centrele Publiserv la încărcarea listei;
  - aplică dezactivarea legacy și în JSON mode;
  - suport MSSQL pentru editare/dezactivare centru;
  - suport MSSQL pentru asociere centru cu obiect;
  - endpoint nou `/api/controlling/cost-centers/link-options`.
- Frontend Controlling:
  - modalul de asociere obiect permite acum:
    - departament;
    - utilaj;
    - vehicul;
    - lucrare/proiect.

## Verificări

- `node --check server/modules/controlling/routes.js`
- Build client și audit local după finalizarea update-ului.
