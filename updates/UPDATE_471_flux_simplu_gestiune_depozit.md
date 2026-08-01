# UPDATE 471 — Flux simplu Gestiune / Depozit

Versiune: `2.12.451`  
Data: `2026-08-01`

## Scop

Modulul Gestiune / Depozit a primit un panou ghidat care transformă operarea dintr-o colecție de taburi într-un flux clar: catalog → furnizori/contracte → NIR → consum → inventar → raport valoric.

## Modificări

- `client/src/pages/modules/GestiunePage.jsx`
  - adăugat panou „Flux simplu depozit”;
  - adăugați pași expliciți pentru catalog, furnizori/contracte, recepție NIR, bon consum, inventar și raport valoric;
  - fiecare pas afișează statusul curent și o acțiune directă;
  - recomandarea principală se adaptează automat după datele reale: catalog lipsă, furnizori lipsă, stocuri sub minim, bonuri în așteptare, nomenclator incomplet sau raport pregătit;
  - păstrat asistentul depozit existent și toate taburile existente.

## Impact

- Nu modifică schema DB.
- Nu modifică endpointurile existente.
- Nu schimbă logica NIR, bon consum, inventar, furnizori sau raport valoric.
- Face modulul mai intuitiv pentru operatori și pregătește evoluția către WMS fără rescriere.

## Verificări

- `npm run build` — ✅ trecut.
