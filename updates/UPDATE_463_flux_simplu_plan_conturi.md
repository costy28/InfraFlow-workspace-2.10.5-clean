# UPDATE 463 — Flux simplu Plan de conturi

Versiune: `2.12.443`
Data: `2026-08-01`

## Scop

Simplificarea paginii Contabilitate → Plan de conturi, astfel încât operatorul să înțeleagă rapid cum caută, selectează, creează analitice și verifică fișa contului.

## Modificări

- Adăugat panou „Plan de conturi simplificat” în `client/src/pages/accounting/PlanConturi.jsx`.
- Panoul grupează fluxul în patru pași:
  1. Găsește contul;
  2. Selectează contul;
  3. Adaugă analitic;
  4. Verifică fișa.
- Adăugată recomandare automată pentru următoarea acțiune:
  - curățare filtre;
  - reîncărcare plan;
  - reactivare cont inactiv;
  - adăugare analitic;
  - deschidere fișă cont.
- Adăugați indicatori rapizi pentru:
  - conturi afișate;
  - analitice;
  - conturi inactive;
  - filtre active.

## Compatibilitate

- Nu modifică endpoint-uri API.
- Nu modifică baza de date.
- Nu modifică regulile de creare/editare conturi.
- Schimbarea este strict de UX și ghidaj operațional.

## Verificări

- `npm run build` — ✅
- `scripts/windows/build-update-zip.ps1` — ✅
- `node scripts/release-check.js` — ✅

