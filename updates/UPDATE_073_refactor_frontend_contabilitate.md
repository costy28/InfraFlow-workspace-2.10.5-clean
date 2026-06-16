# UPDATE 073 - Refactor frontend Contabilitate

Versiune: 2.12.52 -> 2.12.53
Data: 2026-06-16

## Scop

Pregatire pentru migrarea controlata a modulului Contabilitate catre tabele SQL reale, fara sa modificam comportamentul vizibil al aplicatiei.

## Schimbari

- `client/src/pages/accounting/AccountingPage.jsx` a fost redus la un fisier de compatibilitate cu re-exporturi.
- Au fost separate paginile contabile in fisiere dedicate:
  - `ContabilitateDashboard.jsx`
  - `PlanConturi.jsx`
  - `TertiContab.jsx`
  - `FacturiContab.jsx`
  - `Trezorerie.jsx`
  - `RegistruJurnal.jsx`
  - `TVADeclaratii.jsx`
  - `Balanta.jsx`
  - `FisaCont.jsx`
  - `InchidereLuna.jsx`
  - `AlerteLegislative.jsx`
- A fost creat `accounting-shared.jsx` pentru shell-ul de navigare, tabelul comun, selectoarele de cont si utilitarele UI.
- Rutele existente din `App.jsx` raman neschimbate.

## Verificari

- `npm run build`
