# UPDATE 561 — Audit roluri/permisiuni și filtre securitate

Versiune: `2.12.541`  
Data: `2026-09-07`

## Scop

După jurnalul de autentificări, administratorul are nevoie de o vedere rapidă asupra schimbărilor care pot afecta securitatea: roluri, permisiuni, utilizatori, stații, sesiuni și setări sensibile.

## Implementat

- Diagnostic server-side `securityJournal` construit din auditul existent.
- Clasificare evenimente pe categorii:
  - autentificări;
  - roluri și permisiuni;
  - utilizatori;
  - stații și sesiuni;
  - setări sensibile.
- Filtre rapide în `Setări → Securitate`, cu contoare per categorie.
- Contor pentru evenimentele din ultimele 24h.
- Sanitizare detalii audit: parolele și token-urile nu sunt afișate în jurnal.

## Fișiere modificate

- `server/modules/system/service.js`
- `client/src/pages/SetariPage.jsx`
- `version.json`
- `package.json`
- `client/package.json`
- `server/package.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/IMBUNATATIRI_PRIORITARE_COMERCIAL.md`
- `docs/AUDIT_COMPLET_2026-09-05.md`

## Verificări

- `node --check server/modules/system/service.js`
- test local pentru `buildSecurityAccessDiagnostic()`
- `npm run build`

## Pas următor recomandat

Audit vizibil pentru stații/dispozitive: registru complet, autorizare/revocare mai clară, ultimul utilizator, IP mascat și stare de risc.
