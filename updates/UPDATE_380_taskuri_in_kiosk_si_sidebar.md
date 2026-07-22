# UPDATE 380 — Task-uri în Kiosk și sidebar

Versiune: `2.12.360`  
Data: `2026-07-22`

## Ce s-a schimbat

- `Task-uri` este acum acces rapid în meniul principal, lângă `Dashboard` și `Kiosk Angajat`.
- Kiosk-ul afișează `Task-urile mele` pentru utilizatorul ERP asociat angajatului.
- Task-urile din Kiosk afișează prioritate, status, termen, creator și semnale pentru urgente/depășite.
- La creare sau reasignare task, backend-ul creează notificare internă pentru responsabil.
- Notificările browser verifică și task-urile personale deschise, nu doar mesaje/documente/sesizări.

## Compatibilitate

- Nu necesită migrare DB.
- Compatibil cu `DB_MODE=json` și MSSQL app_state.
- Contul Kiosk rămâne separat de sesiunea ERP; task-urile se leagă prin asocierea angajatului cu utilizatorul ERP.

## Fișiere modificate

- `client/src/components/layout/Sidebar.jsx`
- `client/src/pages/KioskPage.jsx`
- `client/src/hooks/useGlobalNotifications.js`
- `client/src/utils/notifications.js`
- `server/modules/hr/routes.js`
- `server/modules/tasks/routes.js`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`

