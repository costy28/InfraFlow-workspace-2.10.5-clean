# UPDATE 355 — Plan rapid de acțiune contract

Versiune: `2.12.335`  
Data: `2026-07-19`

## Context

După introducerea checklist-ului de completitudine, cockpit-ul contractului arăta ce lipsește, dar utilizatorul încă trebuia să decidă manual ordinea lucrurilor de făcut.

## Implementare

- `server/modules/contracts/routes.js`
  - adăugat helper `contractActionItem`;
  - adăugat helper `contractActionPlan`;
  - planul combină alerte, task-uri restante, tichete deschise și elementele lipsă din checklist;
  - acțiunile sunt prioritizate: urgent, important, recomandat;
  - cockpit-ul expune `action_plan`, `actions_total` și `actions_critical`.

- `client/src/pages/modules/ContractePage.jsx`
  - adăugat helper UI `actionTone`;
  - adăugat KPI „Acțiuni urgente” în cockpit;
  - adăugat card „Plan rapid de acțiune” în dosarul contractului;
  - fiecare acțiune afișează sursa, prioritatea, descrierea și pasul recomandat.

## Compatibilitate

- Nu necesită migrare DB.
- Funcționează cu `DB_MODE=json` și MSSQL, fiind calculat din datele existente.
- Nu schimbă payloadurile existente; doar adaugă câmpuri noi în cockpit.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check`
- `npm run test:smoke`
- `npm run audit:local`
