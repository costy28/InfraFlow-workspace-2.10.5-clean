# UPDATE 368 — Mini-modal asignare manager contract

Versiune: `2.12.348`  
Data: `2026-07-21`

## Scop

Înlocuiește prompt-ul browser pentru acțiunea rapidă `Setează manager` cu un mini-modal clar, potrivit pentru utilizatori non-tehnici.

## Modificări

- `client/src/pages/modules/ContractePage.jsx`
  - acțiunea rapidă `Setează manager` deschide un modal dedicat;
  - modalul afișează contractul vizat, partenerul și valoarea contractului;
  - utilizatorul poate introduce manual responsabilul contractului;
  - modalul propune sugestii din utilizatorii activi ai aplicației;
  - dacă sugestiile nu pot fi încărcate, fluxul rămâne funcțional cu introducere manuală;
  - după salvare, lista Contracte, dashboard-ul și contoarele vederilor salvate se reîncarcă automat.

## Compatibilitate

- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.
- Endpoint-ul existent `PATCH /api/contracts/:id` rămâne sursa de salvare.

## Testare

- `npm run build`
- `node --check server/modules/contracts/routes.js`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
