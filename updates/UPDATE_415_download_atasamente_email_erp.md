# UPDATE 415 — Download atașamente email ERP

Versiune: `2.12.395`  
Data: 2026-07-28

## Ce s-a schimbat

- Atașamentele emailurilor pot fi descărcate direct din modalul de detalii Inbox ERP.
- Backend-ul expune endpoint protejat pentru descărcare:
  - `GET /api/messaging/email/inbox/:id/attachments/:index`
- Atașamentele trimise, salvate în draft sau adăugate manual/API păstrează conținutul intern, dar răspunsurile JSON publice trimit doar metadata.
- Pentru emailurile importate unde există doar informația că emailul are atașamente, interfața afișează clar `doar metadata`.

## Fișiere modificate

- `server/modules/messaging/routes.js`
- `client/src/pages/modules/MessagingPage.jsx`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Verificări

- `node --check server\modules\messaging\routes.js`
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `scripts\windows\build-update-zip.ps1 -SkipClientBuild`
- `npm run release:check`
- `git diff --check`
