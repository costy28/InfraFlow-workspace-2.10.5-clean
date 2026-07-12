# UPDATE 277 — Split rute departamente sistem

Versiune: `2.12.257`
Data: 2026-07-12

## Ce s-a schimbat

- Rutele Express pentru departamente au fost mutate din `server/modules/system/routes.js` în `server/modules/system/departments-routes.js`.
- Fișierul principal `server/modules/system/routes.js` montează acum routerul dedicat prin `createSystemDepartmentsRouter(...)`.
- Handlerul legacy `/api/departments` a rămas în `routes.js`, pentru compatibilitate cu fluxul vechi.

## Endpointuri păstrate

- `GET /api/departments`
- `POST /api/departments`
- `PATCH /api/departments/:id`
- `PUT /api/departments/:id`
- `DELETE /api/departments/:id`

## Verificări

- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/departments-routes.js`
- `npm run audit:local`

## Observație tehnică

Acesta este un refactor strict incremental. Comportamentul HTTP, permisiunile, auditul și răspunsurile JSON au fost păstrate pentru rutele Express mutate.
