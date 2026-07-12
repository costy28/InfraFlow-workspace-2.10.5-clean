# UPDATE 278 — Split rute database sistem

Versiune: `2.12.258`
Data: 2026-07-12

## Ce s-a schimbat

- Rutele Express pentru configurarea SQL Server au fost mutate din `server/modules/system/routes.js` în `server/modules/system/database-routes.js`.
- Rutele Express pentru schema relațională MSSQL și sincronizarea contabilă MSSQL au fost mutate în același router dedicat.
- Fișierul principal `server/modules/system/routes.js` montează acum routerul dedicat prin `createSystemDatabaseRouter(...)`.
- Helper-ele de configurare DB și handlerul legacy au rămas în `routes.js`, pentru compatibilitate și risc minim.

## Endpointuri păstrate

- `GET /api/system/database-config`
- `POST /api/system/database-config/test`
- `POST /api/system/database-config`
- `GET /api/system/database-schema`
- `POST /api/system/database-schema/prepare`
- `POST /api/system/database-schema/sync-accounting`

## Verificări

- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/database-routes.js`
- `npm run audit:local`

## Observație tehnică

Acesta este un refactor strict incremental. Comportamentul HTTP, permisiunile, auditul, validarea configurației SQL Server și răspunsurile JSON au fost păstrate pentru rutele Express mutate.
