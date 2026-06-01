# UPDATE 018 — Kiosk universal pentru toți angajații

Data: 2026-06-01  
Versiune: 2.11.8

## Descriere

Orice utilizator activ are automat acces la Kiosk personal, indiferent de rolul principal. Permisiunile implicite de angajat sunt nedezactivabile și acoperă profilul personal, pontajul propriu, cererile de concediu și solicitarea documentelor proprii.

## Implementare

- Adăugate permisiunile implicite `kiosk:view`, `kiosk:pontaj_own`, `kiosk:leave_request`, `kiosk:documents_own`, `kiosk:profile_view`.
- `effectivePermissionsForUser()` atașează automat permisiunile Kiosk oricărui cont activ, inclusiv după filtrarea pe departament.
- `requireAuth()` verifică starea contului la fiecare request și răspunde cu `401 Cont dezactivat` pentru utilizatorii inactivi.
- Adăugat endpoint-ul `GET /api/kiosk/data` pentru profil, pontaj lunar, concedii, autorizații, program, fluturași disponibili și notificări personale.
- Linkul Kiosk din sidebar este permanent și nu depinde de modulele configurabile.
- Lista utilizatorilor și formularul de creare/editare afișează accesul Kiosk automat.

## Fișiere modificate

- `server/core/permissions.js`
- `server/core/auth.js`
- `server/modules/hr/routes.js`
- `client/src/components/layout/Sidebar.jsx`
- `client/src/pages/KioskPage.jsx`
- `client/src/pages/SetariPage.jsx`
- `package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
