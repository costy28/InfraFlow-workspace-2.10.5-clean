# UPDATE 414 — Modal detalii email ERP

Versiune: `2.12.394`  
Data: `2026-07-28`

## Scop

Inbox ERP trebuie să permită citirea completă a emailului, nu doar afișarea unui preview în listă.

## Implementat

- Emailurile din listă pot fi deschise într-un modal de detalii.
- Deep-linkul `/mesaje?email=ID` deschide automat modalul emailului țintă.
- Modalul afișează:
  - subiect;
  - expeditor;
  - destinatari;
  - CC;
  - data;
  - direcția emailului;
  - status;
  - categorie;
  - importanță;
  - corp complet;
  - atașamente;
  - regula automată aplicată;
  - legături ERP.
- Din modal se pot lansa rapid:
  - răspuns;
  - forward;
  - legare ERP;
  - creare task;
  - creare document;
  - arhivare / readucere în inbox.
- Statusul actualizat din modal se reflectă și în detaliu, nu doar în listă.

## Fișiere modificate

- `client/src/pages/modules/MessagingPage.jsx`
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

- `npm run build`
- `node --check server/modules/messaging/routes.js`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- build ZIP update
