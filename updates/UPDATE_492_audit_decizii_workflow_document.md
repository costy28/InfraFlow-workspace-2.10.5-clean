# UPDATE 492 — Audit decizii workflow în dosarul documentului

Versiune: `2.12.472`  
Data: 2026-08-04

## Ce s-a schimbat

- Deciziile reale din circuitul documentelor păstrează meta informații despre pasul procesat.
- Pentru aprobări/avizări se salvează pasul, statusul rezultat, următorul pas și următorul responsabil.
- Pentru respingeri se salvează pasul respins, comentariul obligatoriu și statusul final.
- Dosarul documentului afișează panoul „Istoric decizii / audit circuit”.
- MSSQL existent primește comentarii de audit mai clare, fără schimbare obligatorie de schemă.

## Fișiere principale

- `server/modules/documents/engine.js`
- `client/src/pages/modules/DocumentePage.jsx`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `version.json`

## Verificare

- `node --check server/modules/documents/engine.js`
- `npm run build`
- `npm run release:check -- --no-zip`

## Pachet

- `installer/output/InfraFlow-update-v2.12.472.zip`
