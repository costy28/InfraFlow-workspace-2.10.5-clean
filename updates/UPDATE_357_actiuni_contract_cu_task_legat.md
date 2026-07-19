# UPDATE 357 — Acțiuni contract cu task legat

Versiune: `2.12.337`  
Data: `2026-07-19`

## Context

După ce planul rapid de acțiune a primit buton de creare task, aceeași recomandare putea rămâne afișată ca și cum nu fusese transformată deja în lucru operațional. Pentru utilizator, asta putea crea impresia de duplicare sau lipsă de feedback.

## Implementare

- `server/modules/contracts/routes.js`
  - adăugat helper `attachOpenTaskToAction`;
  - planul rapid marchează acțiunile care au deja task deschis;
  - corelarea se face prin `action_key`;
  - pentru compatibilitate, task-urile vechi generate din alerte sunt corelate prin `alert_code`;
  - pentru acțiunea agregată de task-uri restante este legat primul task restant.

- `client/src/pages/modules/ContractePage.jsx`
  - acțiunile cu task deschis afișează badge `task deschis`;
  - se afișează titlul task-ului, responsabilul și termenul;
  - butonul `Creează task` este ascuns când există deja task deschis.

## Compatibilitate

- Nu necesită migrare DB.
- Funcționează cu `DB_MODE=json` și MSSQL.
- Nu modifică forma task-urilor existente; doar adaugă context calculat în `action_plan`.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check`
- `npm run test:smoke`
- `npm run audit:local`
