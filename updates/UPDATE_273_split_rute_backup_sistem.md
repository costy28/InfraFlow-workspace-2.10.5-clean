# UPDATE 273 — Split rute backup sistem

Versiune: `2.12.253`  
Data: 2026-07-12

## Ce s-a schimbat

- Rutele Express pentru backup și restaurare au fost mutate din `server/modules/system/routes.js` în `server/modules/system/backup-routes.js`.
- Fișierul principal `server/modules/system/routes.js` montează acum routerul dedicat prin `createSystemBackupRouter(...)`.
- Rutele legacy din handlerul `/api` au rămas pe loc pentru compatibilitate și risc minim.

## Endpointuri păstrate

- `GET /api/system/backups`
- `POST /api/system/backups`
- `POST /api/system/backups/:name/restore`
- `GET /api/backup`
- `POST /api/backup`
- `POST /api/restore`

## Verificări

- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/update-routes.js`
- `node --check server/modules/system/backup-routes.js`
- `npm run audit:local`

## Observație tehnică

Acesta este un refactor strict incremental. Comportamentul HTTP, permisiunile și payload-urile au fost păstrate identic pentru rutele Express mutate.
