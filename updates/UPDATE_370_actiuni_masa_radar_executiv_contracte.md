# UPDATE 370 — Acțiuni în masă și radar executiv contracte

Versiune: `2.12.350`  
Data: `2026-07-21`

## Scop

Transformă portofoliul de contracte într-un panou de lucru: utilizatorul poate selecta contracte, aplica acțiuni în lot și vede rapid cozile operaționale importante.

## Modificări frontend

- `client/src/pages/modules/ContractePage.jsx`
  - selecție individuală pe rândurile din portofoliu;
  - selecție/deselectare pentru toate contractele vizibile în filtrul curent;
  - bară de acțiuni în masă pentru contractele selectate;
  - modal `Acțiune în masă contracte`;
  - asignare manager în lot, cu sugestii din utilizatorii activi;
  - creare task-uri operaționale în lot, cu titlu, descriere și prioritate;
  - radar executiv cu scurtături către: critice, scadente 30 zile, fără manager, fără document semnat și depășite.

## Modificări backend

- `server/modules/contracts/routes.js`
  - generatorul `POST /api/contracts/tasks/generate` include acum și riscurile detectate de auditul portofoliului;
  - se creează task-uri și pentru contractele active fără manager sau fără document semnat;
  - task-urile duplicate deschise pe același contract și același cod de risc sunt evitate.

## Compatibilitate

- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.
- Refolosește endpoint-urile existente pentru `PATCH /api/contracts/:id` și `POST /api/contracts/:id/tasks`.

## Testare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
