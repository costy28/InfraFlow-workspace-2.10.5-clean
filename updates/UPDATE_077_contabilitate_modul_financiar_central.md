# UPDATE 077 - Contabilitate ca modul financiar central

Versiune: 2.12.56 -> 2.12.57
Data: 2026-06-18

## Context

ANAF / e-Factura si Controlling apartin logic de zona financiar-contabila. Pentru o navigare mai curata, ele trebuie accesate din Contabilitate, nu ca module separate imprastiate in sidebar.

## Modificari

- Sidebar-ul nu mai afiseaza separat:
  - `ANAF / e-Factura`;
  - `Controlling`.
- Modulul Contabilitate include taburi noi:
  - `ANAF / e-Factura`;
  - `Controlling`.
- Au fost adaugate rute alias sub Contabilitate:
  - `/contabilitate/anaf`;
  - `/contabilitate/controlling`.
- Rutele vechi `/anaf` si `/controlling` raman functionale pentru compatibilitate, dar nu mai sunt promovate in sidebar.
- Permisiunile de sidebar pentru Contabilitate includ si drepturile `anaf`, `integration`, `cost_accounting` si `controlling`.
- Planul de conturi permite creare rapida de cont analitic din contul selectat.
- Textele din Plan de conturi folosesc denumiri proprii InfraFlow, fara referinte la produse externe.

## Fisiere afectate

- `client/src/App.jsx`
- `client/src/components/layout/Sidebar.jsx`
- `client/src/pages/accounting/accounting-shared.jsx`
- `client/src/pages/accounting/PlanConturi.jsx`
- `client/src/pages/accounting/ContabilitateAnaf.jsx`
- `client/src/pages/accounting/ContabilitateControlling.jsx`
- `package.json`
- `server/package.json`
- `client/package.json`
- `electron/package.json`
- `version.json`

## Testare

- `npm run build`
- `git diff --check`
