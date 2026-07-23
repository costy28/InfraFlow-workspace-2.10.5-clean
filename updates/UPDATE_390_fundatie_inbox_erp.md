# UPDATE 390 — Fundație Inbox ERP

Versiune: `2.12.370`
Data: `2026-07-23`

## Ce s-a schimbat

- Modulul `Mesaje` are acum două zone:
  - `Chat intern`;
  - `Inbox ERP`.
- Backend-ul expune categorii email organizaționale:
  - `GET /api/messaging/email/categories`.
- Backend-ul expune inbox intern filtrabil:
  - `GET /api/messaging/email/inbox`.
- Backend-ul permite înregistrarea unui email intern:
  - `POST /api/messaging/email/inbox`.
- Backend-ul permite reclasificarea/statusul unui email intern:
  - `PATCH /api/messaging/email/inbox/:id`.

## Model intern pregătit

Emailurile pot avea:

- categorie;
- importanță: `low`, `normal`, `high`, `urgent`;
- status: `unread`, `read`, `archived`;
- atașamente declarative;
- sursă ERP: tip, id, etichetă și URL intern relativ.

## Ce NU face încă

- Nu se conectează încă la IMAP/OAuth/Microsoft 365/Google Workspace.
- Nu citește încă emailuri reale automat.
- Nu convertește încă emailul în task/document; acesta este pasul logic următor.

## Fișiere afectate

- `server/modules/messaging/routes.js`
- `client/src/pages/modules/MessagingPage.jsx`
- `scripts/smoke-modules-readonly.js`
- `AGENTS.md`
- `CHANGELOG.md`
- `version.json`
