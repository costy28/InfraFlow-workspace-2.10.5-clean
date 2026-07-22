# UPDATE 381 — Acțiuni rapide task în Kiosk

Versiune: `2.12.361`  
Data: `2026-07-22`

## Ce s-a schimbat

- Angajații pot marca task-urile ca `în lucru`, `blocat` sau `finalizat` direct din Kiosk.
- Cardul `Task-urile mele` include câmp de comentariu scurt pentru progres, blocaje sau observații.
- Pentru sesiunea Kiosk separată există endpoint dedicat `PATCH /api/hr/kiosk/tasks/:id`.
- Endpoint-ul Kiosk permite modificarea numai a task-urilor asignate utilizatorului ERP asociat angajatului.
- Acțiunile sunt auditate și comentariile sunt salvate în istoricul task-ului.

## Compatibilitate

- Nu necesită migrare DB.
- Compatibil cu `DB_MODE=json` și MSSQL app_state.
- Nu schimbă regulile existente din pagina ERP `Task-uri`.

## Fișiere modificate

- `client/src/pages/KioskPage.jsx`
- `server/modules/hr/routes.js`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`

