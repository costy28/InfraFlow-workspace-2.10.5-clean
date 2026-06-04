# UPDATE 033 — Hotfix Dashboard după revenire din Kiosk
Data: 04 Iunie 2026
Versiune: 2.12.13

## Descriere
Repară eroarea React #31 apărută la revenirea din Kiosk către Dashboard.

## Cauză
Dashboardul afișa direct câmpul `details` din audit. În anumite situații, acest câmp vine ca obiect JSON (`Entity`, `id`, `details`), iar React nu poate afișa obiecte ca text.

## Modificări
- Adăugat helper defensiv `displayText`.
- Câmpurile `action`, `details`, `detalii`, `userName`, `user` sunt convertite în text înainte de randare.
- Dashboardul nu mai cade dacă API-ul returnează obiecte în logul de activitate.

## Fișiere modificate
- `client/src/pages/DashboardPage.jsx`
- `package.json`
- `version.json`
- `client/package.json`
- `server/package.json`
- `electron/package.json`
- `installer/infraflow-server-setup.iss`
- `installer/infraflow-client-setup.iss`
