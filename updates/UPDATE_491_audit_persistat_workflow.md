# UPDATE 491 — Audit persistat pentru modificările workflow

Versiune: `2.12.471`  
Data: 2026-08-04

## Ce s-a schimbat

- Modificările șabloanelor de workflow documente sunt salvate într-un istoric dedicat `workflowSettingsAudit`.
- Fiecare intrare păstrează utilizatorul, data, sumarul înainte/după și fluxurile adăugate, eliminate sau modificate.
- Setări afișează ultimele 3 modificări persistate direct în panoul de workflow.
- Auditul general primește acțiunea `workflow_fluxuri_modificate` pentru trasabilitate rapidă.
- Istoricul este limitat la ultimele 100 de modificări și nu include secrete.

## Fișiere principale

- `server/modules/system/settings-routes.js`
- `client/src/pages/SetariPage.jsx`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `version.json`

## Verificare

- `node --check server/modules/system/settings-routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`

## Pachet

- `installer/output/InfraFlow-update-v2.12.471.zip`
