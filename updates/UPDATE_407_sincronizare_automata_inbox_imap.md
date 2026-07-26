# UPDATE 407 — Sincronizare automată Inbox IMAP

Versiune: `2.12.387`
Data: `2026-07-26`

## Context

Inbox ERP putea primi emailuri reale prin IMAP, dar sincronizarea era manuală. Pentru utilizare zilnică, operatorul nu trebuie să țină minte să apese periodic `Sincronizează inbox`.

## Ce s-a schimbat

- A fost adăugat serviciu comun de sincronizare IMAP:
  - folosit de ruta manuală;
  - folosit de schedulerul automat.
- Setările generale includ:
  - activare/dezactivare sincronizare automată;
  - interval în minute;
  - limită de emailuri verificate per rulare.
- Autosync-ul este dezactivat implicit.
- Schedulerul verifică la fiecare 5 minute dacă sincronizarea este activă și dacă a venit timpul configurat.
- Schedulerul nu rulează sincronizări suprapuse.
- Statusul ultimei sincronizări automate se păstrează în `messaging.emailSync`.
- Ruta manuală `/api/messaging/email/sync` folosește aceeași logică de import ca rularea automată.

## Fișiere modificate

- `server/modules/messaging/email-sync.js`
- `server/modules/messaging/routes.js`
- `server/scheduler.js`
- `server/modules/system/routes.js`
- `client/src/pages/SetariPage.jsx`
- `CHANGELOG.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `AGENTS.md`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `version.json`

## Verificări

- `node --check server/modules/messaging/email-sync.js`
- `node --check server/modules/messaging/routes.js`
- `node --check server/scheduler.js`
- `node --check server/modules/system/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- `scripts/windows/build-update-zip.ps1 -SkipClientBuild`
