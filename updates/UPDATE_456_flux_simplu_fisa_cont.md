# UPDATE 456 — Flux simplu Fișă cont

Versiune: `2.12.436`  
Data: `2026-08-01`

## Scop

Fișa contului trebuie să explice rapid soldul final al unui cont și să arate următorul pas util pentru verificare sau export.

## Modificări

- `client/src/pages/accounting/FisaCont.jsx`
  - adăugat panou „Flux simplu fișă cont”;
  - afișat verdict coerent / fără mișcări / diferență de sold;
  - afișate mișcările, natura soldului și intervalul selectat;
  - recomandată automat acțiunea următoare: Balanță, Registru jurnal sau Export Excel.

## Verificări

- `npm run build`
- `scripts/windows/build-update-zip.ps1`
- `node scripts/release-check.js`

## Observații

Nu au fost schimbate endpoint-uri sau calcule contabile. Update-ul clarifică interfața peste soldurile și mișcările existente.
