# UPDATE 384 — Șabloane personalizate pentru task-uri

Versiune: `2.12.364`  
Data: `2026-07-23`

## Ce aduce

- Coordonatorii pot crea șabloane proprii de task din pagina `Task-uri`.
- Formular pentru șablon custom:
  - nume scurt;
  - categorie;
  - titlu task generat;
  - instrucțiuni implicite;
  - termen implicit în zile;
  - prioritate implicită.
- Șabloanele custom apar lângă șabloanele sistem.
- Șabloanele custom pot fi dezactivate logic, fără ștergere fizică.
- Șabloanele sistem rămân protejate.

## Backend

- `GET /api/tasks/templates` întoarce și `can_manage_templates`.
- `POST /api/tasks/templates` creează șablon custom.
- `PATCH /api/tasks/templates/:id` actualizează sau dezactivează logic șablonul custom.
- Toate write-urile sunt auditate.

## Fișiere modificate

- `server/modules/tasks/routes.js`
- `client/src/pages/modules/TasksPage.jsx`
- `CHANGELOG.md`
- `version.json`
- `package.json`
- `client/package.json`
- `server/package.json`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Compatibilitate

- Nu necesită migrare DB.
- Compatibil cu `DB_MODE=json` și MSSQL `app_state`.
- Nu introduce dependențe noi.
