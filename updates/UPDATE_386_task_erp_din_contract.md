# UPDATE 386 — Task ERP din dosar contract

Versiune: `2.12.366`  
Data: 2026-07-23

## Ce s-a schimbat

- Dosarul contractului are acțiune rapidă `+ Task ERP`.
- Utilizatorul poate crea un task operațional real direct din contract, cu:
  - titlu;
  - descriere;
  - responsabil;
  - scadență;
  - prioritate.
- Task-ul este salvat în modulul general `Task Management`, nu doar în lista internă de alerte contract.
- Task-ul primește automat:
  - `source_type=contract`;
  - `source_id`;
  - `source_label`;
  - `source_url=/contracte?contract=...`.
- Responsabilul primește notificare internă.
- Cockpit-ul contractului afișează task-urile ERP împreună cu task-urile interne de contract.
- Lista `GET /api/contracts/tasks` include și task-urile ERP legate de contracte.

## Fișiere modificate

- `server/modules/contracts/routes.js`
- `client/src/pages/modules/ContractePage.jsx`
- `CHANGELOG.md`
- `version.json`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `package.json`
- `package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `server/package.json`
- `server/package-lock.json`

## Verificare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- pachet ZIP update generat cu scriptul Windows de update.
