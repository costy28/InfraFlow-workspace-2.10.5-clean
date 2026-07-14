# UPDATE 323 — Declarații fiscale lunare din registry țară

Versiune: `2.12.303`  
Data: `2026-07-14`

## Scop

Mutarea listei operaționale de declarații fiscale lunare din cod hardcodat spre registry-ul de țară, fără schimbarea rezultatului pentru profilul România.

## Modificări

- `server/shared/countryRules.js`
  - helper nou `getMonthlyFiscalDeclarations(countryCode)`;
  - normalizare aliasuri:
    - `D406_SAF_T` → `D406`;
    - `SAF-T` → `D406`;
  - excludere `D205` din lista lunară, deoarece este declarație anuală.

- `server/modules/accounting/fiscal-register.js`
  - registrul declarațiilor folosește lista lunară din registry.

- `server/modules/accounting/fiscal-extras.js`
  - harta de completare fiscală folosește aceeași listă lunară din registry.

- `server/modules/accounting/declaration-routes.js`
  - transmite țara curentă din setări către registrul fiscal.

## Compatibilitate

- Pentru România lista rămâne identică:
  - `D300`;
  - `D394`;
  - `D112`;
  - `D406`.
- Nu schimbă validarea sau generarea declarațiilor.
- Nu adaugă dependențe.
