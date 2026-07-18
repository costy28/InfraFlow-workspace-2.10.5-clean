# UPDATE 340 — Dosar operațional contract

Versiune: `2.12.320`  
Data: `2026-07-18`

## Rezumat

Contract Management primește un dosar operațional pe fiecare contract: consumuri care scad valoarea, documente sursă grupate și timeline cronologic pentru traseul real al contractului.

## Modificări

- `server/modules/contracts/routes.js`
  - endpointul `GET /api/contracts/:id` include acum `documente_sursa`;
  - documentele sursă sunt grupate în: referate, comenzi achiziții, NIR/recepții și facturi;
  - timeline cronologic comun pentru toate documentele legate;
  - consumurile rămân agregate separat și fără dublare între NIR și factură.

- `client/src/pages/modules/ContractePage.jsx`
  - buton „Detalii” pe fiecare contract;
  - modal „Dosar contract” cu sumar valoare/consum/rămas/progres;
  - tabel de consumuri contract;
  - carduri pentru documente sursă grupate;
  - timeline documente în ordine cronologică descrescătoare.

## Efect

Utilizatorul poate vedea într-un singur ecran:

`referat → comandă → recepție/NIR → factură → consum contract`

Acesta este primul pas prin care Contract Management devine dosar de lucru, nu doar registru.

## Verificări

- `node --check server/modules/contracts/routes.js`
- `npm run build`
