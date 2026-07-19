# UPDATE 356 — Task din acțiune contract

Versiune: `2.12.336`  
Data: `2026-07-19`

## Context

Planul rapid de acțiune arăta următorii pași recomandați, dar utilizatorul trebuia să iasă din context pentru a transforma recomandarea într-un task urmărit.

## Implementare

- `server/modules/contracts/routes.js`
  - adăugat helper `createContractTaskFromAction`;
  - adăugat helper `taskDeadlineForPriority`;
  - endpoint nou `POST /api/contracts/:id/tasks`;
  - task-ul preia titlul, descrierea, acțiunea recomandată, sursa și prioritatea;
  - deadline implicit: 1 zi pentru urgent, 3 zile pentru important, 7 zile pentru recomandat;
  - responsabilul este preluat din managerul contractului;
  - duplicatele sunt evitate prin `action_key` pentru task-uri încă deschise;
  - operațiunea este auditată.

- `client/src/pages/modules/ContractePage.jsx`
  - buton „Creează task” pe fiecare element din planul rapid de acțiune;
  - feedback clar dacă task-ul este creat sau reutilizat;
  - dosarul contractului și lista principală se reîncarcă după acțiune.

## Compatibilitate

- Nu necesită migrare DB.
- Funcționează cu `DB_MODE=json` și MSSQL.
- Nu modifică endpointurile existente; adaugă doar o rută nouă.

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check`
- `npm run test:smoke`
- `npm run audit:local`
