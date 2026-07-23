# UPDATE 391 — Task din email Inbox ERP

Versiune: `2.12.371`
Data: `2026-07-23`

## Ce s-a schimbat

- Catalogul surselor de task include acum `Email ERP`.
- În `Mesaje → Inbox ERP`, fiecare email are acțiunea `Creează task`.
- Modalul de task precompletează:
  - titlul;
  - descrierea;
  - prioritatea;
  - responsabilul implicit;
  - sursa task-ului.
- Task-ul creat primește:
  - `source_type=email`;
  - `source_id=<id email>`;
  - `source_label=Email: <subiect>`;
  - `source_url=/mesaje`.
- Crearea folosește endpoint-ul existent `/api/tasks`, deci respectă aceleași reguli de delegare ca task-urile manuale.
- După creare, emailul este marcat ca citit când endpoint-ul permite actualizarea.

## Validare

- Smoke suite verifică sursa `email` în `/api/tasks/source-types`.
- Build-ul frontend validează modalul și noul flux UI.

## Fișiere afectate

- `server/modules/tasks/routes.js`
- `client/src/pages/modules/MessagingPage.jsx`
- `scripts/smoke-modules-readonly.js`
- `AGENTS.md`
- `CHANGELOG.md`
- `version.json`
