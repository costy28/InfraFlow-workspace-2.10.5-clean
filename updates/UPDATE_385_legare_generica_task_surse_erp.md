# UPDATE 385 — Legare generică task de surse ERP

Versiune: `2.12.365`  
Data: `2026-07-23`

## Ce aduce

- Task-urile pot fi legate generic de o sursă ERP.
- Câmpuri suportate:
  - `source_type`;
  - `source_id`;
  - `source_label`;
  - `source_url`.
- Backend-ul îmbogățește task-ul cu:
  - `source_type_label`;
  - `source_label`;
  - `source_url`.
- Formularul `Task nou` are secțiune opțională `Legare la o sursă ERP`.
- Detaliile task-ului afișează card `Legat de` și buton `Deschide sursa`.

## Tipuri de surse inițiale

- Contract
- Document
- Referat
- Angajat HR
- Sesizare
- Gestiune
- Achiziții
- Contabilitate
- Mecanizare
- Șablon task

## Backend

- Endpoint nou `GET /api/tasks/source-types`.
- Crearea, crearea din șablon și actualizarea task-ului păstrează metadatele de sursă.
- Linkurile sursă sunt acceptate doar ca URL-uri interne relative.

## Fișiere modificate

- `server/modules/tasks/routes.js`
- `client/src/pages/modules/TasksPage.jsx`
- `scripts/smoke-modules-readonly.js`
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
