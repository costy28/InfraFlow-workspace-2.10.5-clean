# UPDATE 342 — Task-uri operaționale contract

Versiune: `2.12.322`  
Data: `2026-07-18`

## Ce s-a schimbat

- Alertele de contract pot genera task-uri operaționale.
- Task-urile sunt deduplicate pe contract și cod alertă cât timp sunt deschise.
- Dashboard-ul Contract Management include numărul de task-uri deschise și restante.
- Pagina Contracte afișează cardul „Task-uri contract”.
- Task-urile pot fi marcate „Rezolvat” direct din UI.
- Adăugată migrare MSSQL pentru `contract_management.tasks`.
- Smoke-suite verifică endpointul `GET /api/contracts/tasks`.

## Fișiere modificate

- `server/modules/contracts/routes.js`
- `client/src/pages/modules/ContractePage.jsx`
- `db/migrations/068_contract_management_tasks.sql`
- `scripts/smoke-modules-readonly.js`
- `package.json`
- `server/package.json`
- `client/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
