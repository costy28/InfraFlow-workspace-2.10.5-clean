# UPDATE 359 — Închidere controlată contract

Versiune: `2.12.339`  
Data: `2026-07-19`

## Context

Contract Management avea cockpit, checklist, plan rapid de acțiune și task-uri, dar contractul nu avea încă o etapă finală controlată. Pentru un ERP comercial, închiderea contractului trebuie să fie verificabilă, nu doar o schimbare simplă de status.

## Implementare

- `server/modules/contracts/routes.js`
  - adăugat helper `contractCloseReadiness`;
  - cockpit-ul expune `close_readiness`, `can_close` și numărul de blocaje;
  - blocaje la închidere:
    - contract deja închis sau anulat;
    - câmpuri obligatorii lipsă;
    - task-uri deschise;
    - tichete deschise;
    - alerte critice active;
  - atenționări non-blocante:
    - lipsă documente sursă;
    - lipsă consumuri;
    - consum peste valoarea contractată;
  - endpoint nou `POST /api/contracts/:id/close`;
  - închiderea forțată cere motiv explicit și salvează blocajele existente;
  - operațiunea este auditată.

- `client/src/pages/modules/ContractePage.jsx`
  - buton `Închide contract` în dosarul contractului;
  - card `Închidere contract` cu stare, blocaje și atenționări;
  - blocajele sunt afișate clar înainte de forțare;
  - dacă există blocaje, utilizatorul poate confirma închiderea forțată cu motiv auditat.

## Compatibilitate

- Nu necesită migrare DB.
- Funcționează cu `DB_MODE=json` și MSSQL.
- Nu modifică endpointurile existente.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check`
- `npm run test:smoke`
- `npm run audit:local`
