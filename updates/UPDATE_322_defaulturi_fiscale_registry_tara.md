# UPDATE 322 — Defaulturi fiscale din registry țară

Versiune: `2.12.302`  
Data: `2026-07-14`

## Scop

Începerea decuplării reale a constantelor fiscale de codul hardcodat pe România. Comportamentul existent rămâne identic pentru profilul RO, dar sursa valorilor implicite devine registry-ul de țară.

## Modificări

- `server/shared/countryRules.js`
  - helperi noi:
    - `getAccountingRules`;
    - `getHrRules`;
    - `getDefaultVatRate`;
    - `getVatRates`;
    - `getFiscalDeclarations`;
    - `getPayrollProfile`.

- `server/modules/system/routes.js`
  - salvarea setărilor folosește TVA-ul implicit din profilul țării;
  - pentru România fallback-ul rămâne `21`.

- `server/core/db.js`
  - normalizarea DB JSON folosește TVA-ul implicit din registry;
  - `cota_tva_standard` primește fallback coerent cu `tva_implicit`.

- `server/modules/anaf/routes.js`
  - fallback-ul TVA pentru facturi e-Factura vine din registry-ul de țară.

## Compatibilitate

- Nu schimbă calculele existente.
- Nu schimbă endpointuri publice.
- Nu adaugă dependențe.
- Profilul România păstrează TVA implicit `21%`.
