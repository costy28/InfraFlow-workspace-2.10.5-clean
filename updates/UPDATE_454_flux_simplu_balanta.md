# UPDATE 454 — Flux simplu Balanță

Versiune: `2.12.434`  
Data: `2026-08-01`

## Scop

Balanța trebuie să spună rapid dacă luna este echilibrată, ce diferențe există și unde trebuie mers mai departe.

## Modificări

- `client/src/pages/accounting/Balanta.jsx`
  - adăugat panou „Flux simplu balanță”;
  - afișat verdict echilibrată/dezechilibrată/fără rânduri;
  - calculată diferența totală și diferența pe filtrul curent;
  - afișate filtrele active și numărul de conturi afișate;
  - recomandată automat acțiunea următoare: reîncarcă, Registru jurnal sau Export Excel.

## Verificări

- `npm run build`
- `scripts/windows/build-update-zip.ps1`
- `node scripts/release-check.js`

## Observații

Nu au fost schimbate endpoint-uri sau calcule contabile. Update-ul clarifică interfața peste datele deja calculate de backend.
