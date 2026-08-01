# UPDATE 462 — Flux simplu Audit fiscal

Versiune: `2.12.442`
Data: `2026-08-01`

## Scop

Simplificarea paginii Contabilitate → Audit fiscal, astfel încât operatorul să vadă imediat dacă luna este blocată, dacă validatorul D406 este pregătit și dacă dosarul fiscal poate fi arhivat.

## Modificări

- Adăugat panou „Audit fiscal simplificat” în `client/src/pages/accounting/AuditFiscal.jsx`.
- Panoul grupează fluxul în patru pași:
  1. Acceptanță lunară;
  2. Validator D406;
  3. SAF-T / D406;
  4. Dosar fiscal.
- Adăugată recomandare automată pentru următoarea acțiune:
  - rulează acceptanța;
  - configurează DUK;
  - generează/reverifică D406;
  - exportă acceptanța;
  - descarcă dosarul fiscal.
- Adăugați indicatori rapizi pentru:
  - blocaje;
  - avertizări;
  - rulări D406;
  - recipise lipsă.

## Compatibilitate

- Nu modifică endpoint-uri API.
- Nu modifică baza de date.
- Nu modifică validarea SAF-T sau exporturile existente.
- Schimbarea este strict de UX și ghidaj operațional.

## Verificări

- `npm run build` — ✅
- `scripts/windows/build-update-zip.ps1` — ✅
- `node scripts/release-check.js` — ✅

