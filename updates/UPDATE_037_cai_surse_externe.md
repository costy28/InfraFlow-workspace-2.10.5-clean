# UPDATE 037 — Căi surse externe
Data: 04 Iunie 2026
Versiune: 2.12.17

## Descriere
Pagină simplă în Setări → Integrări pentru configurarea căilor către surse externe:
PIUSI Self-Service, Cântar Poartă, autoMinder și integrări custom.

## Funcționalități
- Câmpuri text pentru cale fișier/folder și interval de sincronizare.
- Test generic de acces cale prin `GET /api/integration/test?path=...`.
- Status vizual: neconfigurat, netestat, conectat sau neconectat.
- Integrări custom cu nume, tip (MDB/SQLite/CSV/Excel), cale și interval.
- Salvare centralizată în setările aplicației.

## Fișiere modificate
- `client/src/pages/SetariPage.jsx`
- `server/modules/integration/piusi.js`
- `server/modules/system/routes.js`
- `server/core/db.js`
- `db/migrations/024_external_integration_paths.sql`
- `package.json`
- `version.json`
- `AGENTS.md`
