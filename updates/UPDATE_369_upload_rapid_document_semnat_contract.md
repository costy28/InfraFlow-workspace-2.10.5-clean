# UPDATE 369 — Upload rapid document semnat contract

Versiune: `2.12.349`  
Data: `2026-07-21`

## Scop

Reduce pașii necesari pentru rezolvarea contractelor marcate ca `Fără document semnat`: utilizatorul poate încărca fișierul direct din lista Contracte.

## Modificări

- `client/src/pages/modules/ContractePage.jsx`
  - acțiunea rapidă `Încarcă semnat` deschide un mini-modal dedicat;
  - modalul afișează contractul vizat și partenerul;
  - fișierul este încărcat direct cu categoria `contract semnat`;
  - utilizatorul poate ajusta descrierea înainte de upload;
  - modalul confirmă numele și dimensiunea fișierului selectat;
  - după upload, lista, dashboard-ul și contoarele vederilor salvate se reîncarcă automat;
  - dacă dosarul contractului era deja deschis, detaliile lui sunt actualizate cu atașamentul nou.

## Compatibilitate

- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.
- Refolosește endpoint-ul existent `POST /api/contracts/:id/attachments`.

## Testare

- `npm run build`
- `node --check server/modules/contracts/routes.js`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
