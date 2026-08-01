# UPDATE 455 — Flux simplu Cartea Mare

Versiune: `2.12.435`  
Data: `2026-08-01`

## Scop

Cartea Mare trebuie să arate rapid dacă intervalul este coerent, câte conturi și mișcări sunt vizibile și care este următoarea acțiune.

## Modificări

- `client/src/pages/accounting/CarteaMare.jsx`
  - adăugat panou „Flux simplu Cartea Mare”;
  - afișat verdict coerent / diferențe / fără conturi în filtrul curent;
  - afișate filtrele active, conturile afișate din total și mișcările;
  - recomandată automat acțiunea următoare: reîncarcă raportul, deschide Balanța sau exportă Excel.

## Verificări

- `npm run build`
- `scripts/windows/build-update-zip.ps1`
- `node scripts/release-check.js`

## Observații

Nu au fost schimbate endpoint-uri sau calcule contabile. Update-ul clarifică interfața peste datele existente.
