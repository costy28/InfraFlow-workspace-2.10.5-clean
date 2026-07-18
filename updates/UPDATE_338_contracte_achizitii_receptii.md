# UPDATE 338 — Contracte în Achiziții și Recepții

Versiune: `2.12.318`  
Data: `2026-07-18`

## Rezumat

Contract Management este legat acum și de fluxul de Achiziții: comanda poate primi contractul urmărit, recepția îl moștenește automat, iar listele arată rapid documentele conectate.

## Modificări

- `client/src/pages/modules/AchizitiiPage.jsx`
  - încărcare contracte active din `/api/contracts`;
  - selector „Contract urmărit” în formularul de comandă nouă;
  - selector „Contract urmărit” în modalul de recepție, precompletat din comandă;
  - coloane contract în listele de comenzi și recepții.

- `server/modules/procurement/routes.js`
  - helper comun pentru validarea și aplicarea legăturii cu contractul;
  - comenzile moderne salvează `contract_id`, `contractId`, `contract_numar`, `contract_title`;
  - recepțiile moderne moștenesc contractul comenzii sau folosesc selecția explicită;
  - fluxurile legacy de comandă/recepție păstrează aceeași compatibilitate.

## Efect

Fluxul operațional devine:

`contract → comandă achiziții → recepție/NIR → factură contabilă → consum contract`

Astfel, consumul contractului poate fi urmărit fără introducere manuală suplimentară și fără pierderea legăturii între documentele sursă.

## Verificări

- `node --check server/modules/procurement/routes.js`
- `npm run build`
