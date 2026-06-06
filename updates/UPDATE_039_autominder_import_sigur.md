# UPDATE 039 — Autominder import sigur
Data: 06 Iunie 2026
Versiune: 2.12.19

Descriere:
- Importul SQL Autominder a fost trecut în regim conservator.
- Importul implicit actualizează doar nomenclatoare, parc auto, utilaje, angajați și documente expirabile.
- FAZ-urile și foile de parcurs istorice sunt detectate în preview, dar nu se mai importă automat.
- Salvarea connection string-ului Autominder folosește endpoint dedicat.
- Erorile CLIXML/PowerShell sunt curățate înainte să ajungă în interfață.

Fișiere modificate:
- server/modules/integration/autominder/full-import.js
- server/app.js
- server/core/db.js
- client/src/pages/modules/FlotaPage.jsx
- package.json
- version.json
