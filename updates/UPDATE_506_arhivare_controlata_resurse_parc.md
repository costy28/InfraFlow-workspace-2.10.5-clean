# UPDATE 506 — Arhivare controlată resurse parc

Versiune: `2.12.486`
Data: 2026-08-05

## Context

După adăugarea și editarea completă a resurselor din parc, lipsea o metodă sigură de scoatere din uz a unui autovehicul/utilaj fără ștergere definitivă.

## Implementare

- Am adăugat endpoint `PATCH /api/fleet-assets/:id/active`.
- Resursele pot fi arhivate sau reactivate cu motiv opțional.
- Acțiunea este auditată prin `resursa_parc_arhivata` sau `resursa_parc_reactivata`.
- `Parc Utilaje` afișează implicit doar resursele active.
- A fost adăugat filtrul `Stare catalog`: active, arhivate sau toate.
- Cardurile arhivate sunt marcate vizual și ascund acțiunile operaționale.
- Resursele active au acțiune `Arhivează`, iar cele arhivate au acțiune `Reactivează`.
- Selecțiile operaționale folosesc doar resurse active.

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
