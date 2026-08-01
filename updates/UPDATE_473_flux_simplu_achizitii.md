# UPDATE 473 — Flux simplu Achiziții

Versiune: `2.12.453`  
Data: `2026-08-01`

## Scop

Modulul Achiziții a primit un panou ghidat care arată ordinea naturală de lucru: necesar → CPV/PAAP → comandă → contract → recepție → cântar/raport.

## Modificări

- `client/src/pages/modules/AchizitiiPage.jsx`
  - adăugat panou „Flux simplu achiziții”;
  - adăugați pași expliciți pentru cerințe/necesar, CPV/PAAP, comandă, contract, recepție și cântar/raport;
  - fiecare pas afișează statusul curent și o acțiune directă;
  - recomandarea principală se adaptează automat după datele reale: cerințe urgente, PAAP cu risc, comenzi deschise, comenzi fără contract, produse de cântar nemapate sau lipsă comenzi;
  - păstrat asistentul achiziții existent și toate taburile existente.

## Impact

- Nu modifică schema DB.
- Nu modifică endpointurile existente.
- Nu schimbă logica de comenzi, recepții, PAAP, cântar sau CPV.
- Face modulul mai ușor de folosit pentru firme private și instituții, păstrând extensibilitatea pe profil de țară.

## Verificări

- `npm run build` — ✅ trecut.
