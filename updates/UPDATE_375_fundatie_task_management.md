# UPDATE 375 — Fundație Task Management

Versiune: `2.12.355`  
Data: `2026-07-22`

## Scop

InfraFlow are nevoie de o listă comună de lucru pentru task-uri personale și task-uri delegate de șefi/directori către utilizatori.

## Modificări

- `server/modules/tasks/routes.js`
  - modul nou Task Management;
  - `GET /api/tasks`;
  - `GET /api/tasks/my-open`;
  - `GET /api/tasks/:id`;
  - `POST /api/tasks`;
  - `PATCH /api/tasks/:id`;
  - `POST /api/tasks/:id/comments`;
  - audit pentru creare, actualizare și comentarii;
  - anularea se face prin status `cancelled`, nu prin ștergere fizică.

- `server/app.js`
  - montare rută task-uri.

- `server/core/db.js`
  - structură implicită `taskManagement: { tasks, comments }`.

- `client/src/pages/modules/TasksPage.jsx`
  - pagină nouă `/taskuri`;
  - tab-uri: `Ale mele`, `Create de mine`, `Toate vizibile`;
  - creare task;
  - schimbare status;
  - comentarii pe task.

- `client/src/App.jsx`
  - rută frontend `/taskuri`.

- `client/src/components/layout/Sidebar.jsx`
  - intrare nouă `Task-uri`.

- `client/src/pages/DashboardPage.jsx`
  - task-urile personale deschise/întârziate intră în `Ce ai de făcut azi`.

- `scripts/smoke-modules-readonly.js`
  - verificare read-only pentru `/api/tasks/my-open`.

## Compatibilitate

- Nu necesită migrări MSSQL.
- Compatibil cu `DB_MODE=json`.
- Nu adaugă dependențe noi.

## Verificare

- `node --check server/modules/tasks/routes.js`
- Build frontend.
- Release check.
- Smoke test read-only module.
- Pachet update ZIP.
