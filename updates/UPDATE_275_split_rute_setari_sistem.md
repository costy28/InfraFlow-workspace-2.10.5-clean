# UPDATE 275 — Split rute setari sistem

Versiune: `2.12.255`
Data: 2026-07-12

## Ce s-a schimbat

- Rutele Express pentru setări generale, module active, test email, branding, logo, test GPS și registry devices au fost mutate din `server/modules/system/routes.js` în `server/modules/system/settings-routes.js`.
- Fișierul principal `server/modules/system/routes.js` montează acum routerul dedicat prin `createSystemSettingsRouter(...)`.
- Configurarea MSSQL și licența au rămas în `routes.js`, fiind zone cu efect operațional mai sensibil și potrivite pentru pași separați.

## Endpointuri păstrate

- `GET /api/settings`
- `PATCH /api/settings`
- `POST /api/settings`
- `POST /api/settings/modules`
- `POST /api/settings/email/test`
- `GET /api/admin/branding`
- `POST /api/admin/branding`
- `POST /api/admin/branding/logo`
- `GET /api/integration/gps/test`
- `GET /api/devices`

## Verificări

- `node --check server/modules/system/routes.js`
- `node --check server/modules/system/settings-routes.js`
- `npm run audit:local`

## Observație tehnică

Acesta este un refactor strict incremental. Comportamentul HTTP, permisiunile și payload-urile au fost păstrate pentru rutele Express mutate.
