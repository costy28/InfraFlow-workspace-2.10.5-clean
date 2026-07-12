# UPDATE 272 — Split rute update sistem

Versiune: `2.12.252`
Data: `2026-07-11`

## Scop

Primul pas de refactorizare controlată pentru `server/modules/system/routes.js`.
Fișierul avea aproape 10.000 de linii și am început separarea pe responsabilități,
fără schimbare de comportament API.

## Backend

- Fișier nou:
  - `server/modules/system/update-routes.js`
- Endpointuri mutate:
  - `POST /api/system/update-package`
  - `GET /api/system/update/check`
  - `GET /api/system/update-check`
  - `GET /api/system/update/changelog`
  - `POST /api/system/update/install`
  - `POST /api/system/update/upload`
  - `POST /api/system/update-upload`
  - `POST /api/system/update/apply`
  - `GET /api/system/update/history`
- `server/modules/system/routes.js` montează noul router prin `createSystemUpdateRouter(...)`.
- Helper-ele istorice de ZIP/copy/version rămân în fișierul principal pentru compatibilitate și sunt injectate explicit în routerul nou.

## Compatibilitate

- Nu introduce dependențe noi.
- Nu schimbă schema DB.
- Nu schimbă path-uri API.
- Nu schimbă permisiuni.
- Nu schimbă payload-uri sau răspunsuri JSON.

## Testare

- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/update-routes.js`
- `npm run audit:local`
