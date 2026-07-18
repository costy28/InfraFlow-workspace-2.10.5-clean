# UPDATE 341 — Manageri și remindere contracte

Versiune: `2.12.321`  
Data: `2026-07-18`

## Ce s-a schimbat

- Contract Management grupează dashboard-ul pe manager/responsabil de contract.
- Alertele de contract includ responsabilul și metadate utile pentru notificări.
- Adăugat endpoint `POST /api/contracts/reminders` pentru generare remindere din alerte.
- Reminderele sunt deduplicate pe zi, contract și tip alertă.
- Pagina Contract Management are buton „Trimite remindere” și card „Manageri contract”.

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
