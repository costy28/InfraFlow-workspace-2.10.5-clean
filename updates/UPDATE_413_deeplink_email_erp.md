# UPDATE 413 — Deep-link direct către emailuri ERP

Versiune: `2.12.393`  
Data: `2026-07-28`

## Scop

Emailurile legate în dosarele ERP trebuie să poată fi deschise direct, nu doar să trimită utilizatorul generic în modulul Mesaje.

## Implementat

- Pagina `Mesaje` acceptă parametrul:
  - `/mesaje?email=ID`.
- Dacă există parametrul `email`, aplicația:
  - deschide automat tabul `Inbox ERP`;
  - caută în toate direcțiile de email, nu doar inbox inbound;
  - evidențiază emailul găsit;
  - derulează lista până la email;
  - marchează emailul citit dacă era necitit.
- Cardurile de emailuri legate din dosare trimit direct la emailul asociat:
  - Contracte;
  - Documente;
  - Task-uri.

## Fișiere modificate

- `client/src/pages/modules/MessagingPage.jsx`
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
