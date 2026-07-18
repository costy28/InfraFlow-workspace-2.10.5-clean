# UPDATE 335 — UI minimal Contract Management

Versiune: `2.12.315`  
Data: `2026-07-18`

## Ce s-a schimbat

- Frontend:
  - pagină nouă `client/src/pages/modules/ContractePage.jsx`;
  - rută nouă `/contracte`;
  - item nou în sidebar `Contracte`;
  - dashboard cu contracte active, valoare contractată, consum și alerte;
  - listă contracte cu progres de consum, CPV, responsabil și termen;
  - formular pentru contract nou;
  - formular pentru consum manual pe contract.

- Catalog module:
  - cheie nouă `contract_management`;
  - adăugată în catalogul comercial din Setări;
  - inclusă în pachetele Gestiune + Achiziții, Contabilitate, City Services și Enterprise.

## Motiv

UPDATE 334 a pus fundația backend. Acest update face modulul vizibil și utilizabil în aplicație, fără să aștepte integrarea automată completă cu facturi/NIR-uri/situații.

## Validare

- `node --check server/modules/system/settings-routes.js`
- `node --check server/modules/system/routes.js`
- `npm run build`
- `npm run test:smoke`
- `npm run audit:local`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/build-update-zip.ps1 -SkipClientBuild`
