# UPDATE 504 — Editare rapidă date tehnice carburant

Versiune: `2.12.484`
Data: 2026-08-05

## Context

După filtrul „Rezervor nesetat”, utilizatorul vedea rapid resursele fără capacitate rezervor, dar trebuia să intre în fișa completă pentru o corecție mică.

## Implementare

- Am adăugat endpoint dedicat `PATCH /api/fleet-assets/:id/technical`.
- Endpoint-ul actualizează combustibilul, capacitatea rezervorului și consumul normat.
- Actualizarea este auditată și returnează alertele recalculate.
- În panoul „Carburant pe utilaj / vehicul” apare acțiunea rapidă „Setează rezervor”.
- Modalul rapid este precompletat din resursa selectată și salvează fără navigare.
- Acțiunea „Fișă” rămâne disponibilă pentru editări complete.

## Verificări

- `npm run build`
- `npm run release:check -- --no-zip`
- `git diff --check`

## Fișiere atinse

- `server/modules/fleet/routes.js`
- `client/src/pages/modules/MecanizarePage.jsx`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `version.json`
