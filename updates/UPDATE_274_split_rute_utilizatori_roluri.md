# UPDATE 274 — Split rute utilizatori si roluri

Versiune: `2.12.254`
Data: 2026-07-12

## Ce s-a schimbat

- Rutele Express pentru utilizatori, roluri și permisiuni au fost mutate din `server/modules/system/routes.js` în `server/modules/system/users-routes.js`.
- Fișierul principal `server/modules/system/routes.js` montează acum routerul dedicat prin `createSystemUsersRouter(...)`.
- Helperii de creare/editare utilizatori au rămas în `routes.js`, fiind încă folosiți de handlerul legacy `/api`.

## Endpointuri păstrate

- `GET /api/roles`
- `GET /api/roles/permissions-catalog`
- `POST /api/roles`
- `PUT /api/roles/:id`
- `DELETE /api/roles/:id`
- `PATCH /api/roles/:id/permissions`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `PUT /api/users/:id/role`
- `PUT /api/users/:id/roles`
- `PATCH /api/users/:id/reset-password`

## Verificări

- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/users-routes.js`
- `npm run audit:local`

## Observație tehnică

Acesta este un refactor strict incremental. Comportamentul HTTP, permisiunile și payload-urile au fost păstrate pentru rutele Express mutate.
