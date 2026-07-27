# UPDATE 408 — Status sincronizare Inbox IMAP

Versiune: `2.12.388`
Data: `2026-07-26`

## Context

Sincronizarea automată IMAP era funcțională, dar operatorul nu vedea clar ultima rulare, următoarea rulare sau eventualele erori. Pentru o aplicație comercială, funcțiile automate trebuie să fie transparente și ușor de diagnosticat.

## Ce s-a schimbat

- Backend-ul expune statusul sincronizării prin `GET /api/messaging/email/sync/status`.
- Statusul include:
  - dacă autosync este activ;
  - intervalul configurat;
  - limita de emailuri per rulare;
  - ultima sincronizare manuală;
  - ultima sincronizare automată;
  - următoarea rulare automată estimată;
  - ultima eroare autosync.
- `Mesaje → Inbox ERP` afișează status compact de sincronizare.
- `Setări → General → Sincronizare automată Inbox` afișează statusul tehnic pentru admin.
- După salvarea setărilor generale, statusul autosync se reîncarcă automat.

## Fișiere modificate

- `server/modules/messaging/email-sync.js`
- `server/modules/messaging/routes.js`
- `client/src/pages/modules/MessagingPage.jsx`
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
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- `scripts/windows/build-update-zip.ps1 -SkipClientBuild`
