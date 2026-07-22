# UPDATE 382 — Dovezi atașate pe task din Kiosk

Versiune: `2.12.362`  
Data: `2026-07-22`

## Ce s-a schimbat

- Kiosk-ul permite încărcarea unui fișier dovadă pe task.
- Sunt acceptate imagini, PDF, documente Office și fișiere text, cu limită existentă de 10 MB.
- Dovezile sunt salvate în `storage/task-evidence` și înregistrate în `taskManagement.attachments`.
- Upload-ul din Kiosk este permis doar pentru task-urile utilizatorului ERP asociat angajatului.
- Detaliile task-ului din ERP afișează lista de dovezi și buton de descărcare.
- Descărcarea dovezilor folosește endpoint securizat și verifică dreptul de vizualizare al task-ului.

## Compatibilitate

- Nu necesită migrare DB.
- Compatibil cu `DB_MODE=json` și MSSQL app_state.
- Nu schimbă comportamentul existent al comentariilor și statusurilor task.

## Fișiere modificate

- `server/modules/tasks/routes.js`
- `server/modules/hr/routes.js`
- `client/src/pages/KioskPage.jsx`
- `client/src/pages/modules/TasksPage.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`

