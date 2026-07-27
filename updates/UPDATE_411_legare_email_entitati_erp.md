# UPDATE 411 — Legare email de entități ERP

Versiune: `2.12.391`  
Data: `2026-07-27`

## Scop

Inbox ERP devine un punct real de intrare în aplicație: emailurile pot fi legate de contracte, documente și task-uri, nu rămân mesaje izolate.

## Implementat

- Registru generic pentru legături email: `messaging.emailLinks`.
- Legăturile se anulează controlat prin `cancelled_at`, `cancelled_by`, `cancelled_reason`; nu se șterg fizic.
- API pentru ținte ERP selectabile:
  - contracte;
  - documente;
  - task-uri.
- API pentru adăugarea unei legături pe email.
- API pentru anularea unei legături de pe email.
- Emailurile expun:
  - `links`;
  - `links_count`;
  - `linked`.
- Inbox ERP are filtre noi:
  - cu legături ERP;
  - fără legături;
  - după tip legătură: contract, document, task.
- UI Inbox afișează legăturile pe email, cu acțiune rapidă `deschide`.
- UI Inbox include acțiunea `Leagă de...`.
- Task-urile create din email se leagă automat înapoi de email.
- Documentele create din email se leagă automat înapoi de email.

## Fișiere modificate

- `server/modules/messaging/routes.js`
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

- `node --check server/modules/messaging/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- build ZIP update

