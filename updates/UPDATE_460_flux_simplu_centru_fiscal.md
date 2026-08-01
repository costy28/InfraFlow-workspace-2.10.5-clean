# UPDATE 460 — Flux simplu Centru fiscal

Versiune: `2.12.440`
Data: `2026-08-01`

## Scop

Simplificarea paginii Contabilitate → Centru fiscal, astfel încât operatorul să vadă imediat starea lunii și următoarea acțiune recomandată fără să interpreteze manual toate taburile fiscale.

## Modificări

- Adăugat panou „Centru fiscal simplificat” în `client/src/pages/accounting/TVADeclaratii.jsx`.
- Panoul grupează fluxul în patru pași:
  1. Control lunar;
  2. TVA / D300;
  3. Declarații D394, D112 și SAF-T;
  4. Termen / recipisă.
- Adăugată recomandare automată pentru următoarea acțiune:
  - verificări fiscale;
  - TVA/D300;
  - export control declarații;
  - confirmare TVA verificat;
  - calendar/recipise;
  - audit contabil.
- Adăugați indicatori rapizi pentru:
  - verificări de rezolvat;
  - declarații nepregătite;
  - TVA estimat;
  - termene active.

## Compatibilitate

- Nu modifică endpoint-uri API.
- Nu modifică structura bazei de date.
- Nu modifică formulele contabile sau fiscale existente.
- Schimbarea este strict de UX și ghidaj operațional.

## Verificări

- `npm run build` — ✅
- `scripts/windows/build-update-zip.ps1` — ✅
- `node scripts/release-check.js` — ✅

