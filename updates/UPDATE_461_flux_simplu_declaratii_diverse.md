# UPDATE 461 — Flux simplu Declarații diverse

Versiune: `2.12.441`
Data: `2026-08-01`

## Scop

Simplificarea paginii Contabilitate → Declarații și raportări, astfel încât operatorul să vadă imediat dacă D205, Intrastat și statusul fiscal sunt pregătite sau cer acțiune.

## Modificări

- Adăugat panou „Raportări fiscale simple” în `client/src/pages/accounting/DeclaratiiDiverse.jsx`.
- Panoul grupează fluxul în trei pași:
  1. D205;
  2. Intrastat;
  3. Status fiscal.
- Adăugată recomandare automată pentru următoarea acțiune:
  - completare D205;
  - verificare D205;
  - verificare Intrastat;
  - status fiscal;
  - export D205 sau Intrastat.
- Adăugați indicatori rapizi pentru:
  - poziții D205;
  - poziții Intrastat;
  - atenții;
  - obligații urmărite.

## Compatibilitate

- Nu modifică endpoint-uri API.
- Nu modifică baza de date.
- Nu modifică exporturile D205/Intrastat existente.
- Schimbarea este strict de UX și ghidaj operațional.

## Verificări

- `npm run build` — ✅
- `scripts/windows/build-update-zip.ps1` — ✅
- `node scripts/release-check.js` — ✅

