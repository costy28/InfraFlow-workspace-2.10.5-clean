# UPDATE 344 — Cockpit dosar contract

Versiune: `2.12.324`  
Data: `2026-07-18`

## Ce s-a schimbat

- Detaliile contractului includ un cockpit operațional agregat.
- Cockpit-ul centralizează alerte, task-uri, tichete, documente, consumuri și termene.
- Backend-ul include `cockpit` în `GET /api/contracts/:id`.
- Modalul „Dosar contract” afișează KPI-uri rapide, task-uri și tichete legate.
- Contractul devine punctul principal de adevăr pentru urmărirea operațională.

## Fișiere modificate

- `server/modules/contracts/routes.js`
- `client/src/pages/modules/ContractePage.jsx`
- `package.json`
- `server/package.json`
- `client/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
