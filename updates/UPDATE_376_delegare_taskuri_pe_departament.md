# UPDATE 376 — Delegare task-uri pe departament

Versiune: `2.12.356`  
Data: `2026-07-22`

## Scop

Task Management trece de la listă personală simplă la delegare controlată după rol și departament.

## Implementat

- Endpoint nou `GET /api/tasks/assignees`.
- Utilizator simplu: poate crea task-uri doar pentru el.
- Șef departament: poate vedea/delega task-uri către utilizatorii activi din departamentul propriu.
- Manager/admin/superadmin: poate vedea/delega global.
- Validare server-side la creare și reasignare task.
- Pagina `Task-uri` afișează regula de delegare și numărul de responsabili disponibili.
- Smoke test read-only extins pentru endpoint-ul de responsabili.

## Compatibilitate

- Nu necesită migrare SQL.
- Funcționează în `DB_MODE=json` și în MSSQL app_state.
- Nu schimbă structura task-urilor existente.

## Verificări

- `node --check server/modules/tasks/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
