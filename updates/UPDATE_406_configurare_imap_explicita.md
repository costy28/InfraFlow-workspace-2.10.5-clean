# UPDATE 406 — Configurare IMAP explicită

Versiune: `2.12.386`
Data: `2026-07-26`

## Context

După introducerea sincronizării manuale prin IMAP, recepția emailurilor funcționa prin derivarea automată a hostului IMAP din setările SMTP. Pentru utilizare comercială, acest lucru este prea implicit: operatorul trebuie să vadă clar diferența dintre trimitere SMTP și primire IMAP.

## Ce s-a schimbat

- Setările generale au primit secțiune separată `Primire email / IMAP`.
- Se pot configura explicit:
  - server IMAP;
  - port IMAP;
  - utilizator IMAP;
  - parolă IMAP;
  - SSL/TLS IMAP.
- Parola IMAP se salvează criptat și nu este afișată niciodată în frontend.
- `publicSettings()` trimite doar flagurile `smtp_password_set` și `imap_password_set`, fără valorile criptate.
- A fost adăugat endpointul `POST /api/settings/email/imap/test`.
- Testul IMAP verifică accesul la Inbox fără să importe emailuri în registrul ERP.
- Sincronizarea Inbox păstrează fallback-ul existent: dacă IMAP nu este completat explicit, încearcă derivarea din SMTP pentru Gmail/Microsoft 365/Yahoo.

## Fișiere modificate

- `server/modules/messaging/imap.js`
- `server/modules/system/settings-routes.js`
- `server/modules/system/routes.js`
- `client/src/pages/SetariPage.jsx`
- `CHANGELOG.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `AGENTS.md`
- `package.json`
- `package-lock.json`
- `version.json`

## Verificări

- `node --check server/modules/messaging/imap.js`
- `node --check server/modules/system/settings-routes.js`
- `node --check server/modules/system/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
- `scripts/windows/build-update-zip.ps1 -SkipClientBuild`
