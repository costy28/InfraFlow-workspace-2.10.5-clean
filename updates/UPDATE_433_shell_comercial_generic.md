# UPDATE 433 — Shell comercial generic

Versiune: `2.12.413`
Data: `2026-07-30`

## Context

După generalizarea Dashboard-ului, shell-ul aplicației încă avea câteva texte vizibile care sugerau o implementare orientată pe un client/domeniu pilot. Pentru produs comercial, meniul lateral, Setările și fallback-urile server trebuie să sune generic și configurabil.

## Modificări

- Sidebar:
  - `Mecanizare` devine `Parc & Resurse`;
  - `Asternere` devine `Lucrări / Execuție`.
- Setări:
  - `Stație` devine `Punct de lucru / locație`;
  - catalogul de module descrie `Producție / Operațiuni` ca flux configurabil.
- Server:
  - fallback-ul `Statie asfalt` a fost înlocuit cu `Organizație` pentru setări și pagini de raport;
  - mesajul de setup cere `punct de lucru`, nu `stație`.
- Documentație utilizator:
  - Dashboard și Producție au descrieri generale, nu orientate strict pe asfalt/utilaje.

## Fișiere modificate

- `client/src/components/layout/Sidebar.jsx`
- `client/src/pages/SetariPage.jsx`
- `server/modules/system/routes.js`
- `server/modules/system/service.js`
- `docs/utilizator/02-dashboard.md`
- `docs/utilizator/03-productie.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `version.json`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `client/package.json`
- `client/package-lock.json`

## Verificări

- Scanare shell/Setări/docs/server system pentru fallback-uri vechi: OK.
- `npm run build`: OK.
- `npm run release:check`: OK.
- Pachet update ZIP generat: `installer/output/InfraFlow-update-v2.12.413.zip`.

