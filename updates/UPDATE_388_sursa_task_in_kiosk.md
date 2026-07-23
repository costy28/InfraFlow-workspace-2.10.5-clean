# UPDATE 388 — Sursa task-ului în Kiosk

Versiune: `2.12.368`
Data: `2026-07-23`

## Ce s-a schimbat

- Cardurile de task din Kiosk afișează contextul `Legat de` când task-ul are sursă ERP.
- Dacă utilizatorul este în sesiune ERP normală, Kiosk afișează butonul `Deschide sursa`.
- Dacă utilizatorul folosește Kiosk ca angajat, fără sesiune ERP, vede contextul task-ului, dar nu primește acces direct la module ERP.
- Linkurile către sursă sunt validate ca URL-uri interne relative.

## Planificat

- Direcția `Email organizațional + Inbox ERP` a fost adăugată în backlog-ul comercial:
  - email organizațional per utilizator;
  - fără email personal în aplicație;
  - fallback pe SMTP-ul organizației;
  - preferințe notificări pe module/canale;
  - clasificare ulterioară pe categorii, importanță, sursă ERP și atașamente.

## Fișiere afectate

- `client/src/pages/KioskPage.jsx`
- `AGENTS.md`
- `CHANGELOG.md`
- `version.json`
- `package.json`
- `client/package.json`
- `server/package.json`
