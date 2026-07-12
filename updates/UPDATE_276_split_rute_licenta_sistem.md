# UPDATE 276 — Split rute licenta sistem

Versiune: `2.12.256`
Data: 2026-07-12

## Ce s-a schimbat

- Rutele Express pentru status și import licență au fost mutate din `server/modules/system/routes.js` în `server/modules/system/license-routes.js`.
- Fișierul principal `server/modules/system/routes.js` montează acum routerul dedicat prin `createSystemLicenseRouter(...)`.
- Ruta legacy `/api/license/import` a rămas în `routes.js`, pentru compatibilitate cu handlerul vechi.

## Endpointuri păstrate

- `GET /api/license/status`
- `POST /api/license/import`

## Verificări

- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/license-routes.js`
- `npm run audit:local`

## Observație tehnică

Acesta este un refactor strict incremental. Comportamentul HTTP, permisiunile, validarea `.iflic` și payload-urile au fost păstrate pentru rutele Express mutate.
