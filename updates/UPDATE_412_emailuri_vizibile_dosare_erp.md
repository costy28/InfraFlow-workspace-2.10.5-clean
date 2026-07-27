# UPDATE 412 — Emailuri legate vizibile în dosare ERP

Versiune: `2.12.392`  
Data: `2026-07-27`

## Scop

Legăturile create din Inbox ERP trebuie să fie vizibile și din dosarele țintă, nu doar din lista de emailuri.

## Implementat

- Endpoint generic pentru citirea emailurilor legate de o țintă ERP:
  - contract;
  - document;
  - task.
- Dosarul contractului afișează card `Emailuri legate`.
- Dosarul documentului afișează card `Emailuri legate`, lângă task-urile documentului.
- Modalul de detalii task afișează emailurile legate.
- Pagina Task-uri suportă deep-link direct:
  - `/taskuri?task=ID`.

## Fișiere modificate

- `server/modules/messaging/routes.js`
- `client/src/pages/modules/ContractePage.jsx`
- `client/src/pages/modules/DocumentePage.jsx`
- `client/src/pages/modules/TasksPage.jsx`
- `CHANGELOG.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `AGENTS.md`
- `version.json`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `client/package.json`
- `client/package-lock.json`

## Verificări

- `node --check server/modules/messaging/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- build ZIP update
