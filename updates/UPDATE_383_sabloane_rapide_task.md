# UPDATE 383 — Șabloane rapide pentru task-uri

Versiune: `2.12.363`  
Data: `2026-07-22`

## Ce aduce

- Catalog rapid de șabloane în pagina `Task-uri`.
- Creare task dintr-un click, cu responsabil ales din lista permisă.
- Șabloane sistem pentru:
  - verificare document;
  - încărcare dovadă;
  - raport zilnic;
  - urmărire contract;
  - verificare gestiune.
- Endpoint nou `GET /api/tasks/templates`.
- Endpoint nou `POST /api/tasks/from-template`.
- Crearea din șablon respectă aceleași reguli de delegare ca task-ul manual.
- Task-urile create din șablon trimit notificări și intră în audit.

## Fișiere modificate

- `server/modules/tasks/routes.js`
- `client/src/pages/modules/TasksPage.jsx`
- `CHANGELOG.md`
- `version.json`
- `package.json`
- `client/package.json`
- `server/package.json`
- `scripts/smoke-modules-readonly.js`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`

## Compatibilitate

- Nu necesită migrare DB.
- Compatibil cu `DB_MODE=json` și cu MSSQL `app_state`.
- Nu introduce dependențe noi.
