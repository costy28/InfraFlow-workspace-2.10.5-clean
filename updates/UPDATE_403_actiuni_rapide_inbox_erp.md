# UPDATE 403 — Acțiuni rapide Inbox ERP

Versiune: `2.12.383`  
Data: `2026-07-25`

## Context

Inbox ERP avea statusuri interne pentru emailuri, dar utilizatorul nu avea acțiuni rapide în listă pentru operarea zilnică.

## Implementat

- `client/src/pages/modules/MessagingPage.jsx`
  - buton `Marchează citit` pentru emailurile necitite;
  - buton `Marchează necitit` pentru emailurile citite;
  - buton `Arhivează` pentru emailurile active;
  - buton `Readuce în inbox` pentru emailurile arhivate;
  - badge vizibil `arhivat`.
- `server/modules/messaging/routes.js`
  - normalizează statusul primit prin PATCH înainte de salvare;
  - păstrează auditul existent `messaging_email_inbox_update`.

## Beneficiu

Inbox ERP devine mai apropiat de o aplicație reală de email: utilizatorul poate curăța rapid lista, separa ce e rezolvat și reveni la emailurile arhivate când are nevoie.

## Verificare

- `node --check server/modules/messaging/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
