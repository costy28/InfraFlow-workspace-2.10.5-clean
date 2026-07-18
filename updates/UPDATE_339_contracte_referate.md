# UPDATE 339 — Contracte în Referate

Versiune: `2.12.319`  
Data: `2026-07-18`

## Rezumat

Contractul urmărit poate fi ales încă din referat, iar aplicația îl propagă automat spre comanda de achiziții generată din fluxul de aprobare.

## Modificări

- `client/src/pages/modules/ReferatePage.jsx`
  - încărcare contracte active din `/api/contracts`;
  - selector „Contract urmărit” în formularul de referat nou;
  - coloană contract în lista referatelor;
  - badge contract în detaliile referatului.

- `server/modules/referate/routes.js`
  - helper comun pentru validarea și aplicarea legăturii cu contractul;
  - referatul salvează `contract_id`, `contractId`, `contract_numar`, `contract_title`;
  - comanda generată automat din referat moștenește contractul;
  - comanda păstrează trasabilitatea sursei: `sourceReferatId`, `sourceReferatUuid`, `sourceReferatNo`;
  - PDF-ul referatului afișează contractul urmărit.

## Efect

Fluxul complet devine:

`contract → referat → comandă achiziții → recepție/NIR → factură contabilă → consum contract`

Operatorul alege contractul o singură dată la începutul fluxului, iar aplicația îl poartă mai departe.

## Verificări

- `node --check server/modules/referate/routes.js`
- `npm run build`
