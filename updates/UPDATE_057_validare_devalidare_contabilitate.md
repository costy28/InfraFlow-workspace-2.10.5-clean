# UPDATE 057 - Validare si devalidare contabilitate

Versiune: 2.12.36 -> 2.12.37
Data: 2026-06-14

## Context

In Saga/Nexus documentele contabile pot fi validate, devalidate, editate sau sterse/anulate pana cand luna este inchisa si declaratiile sunt depuse la ANAF.
InfraFlow pastreaza acel flux practic, dar cu audit si fara stergere fizica dupa regula ERP.

## Modificari backend

- Adaugat conceptul de nota contabila activa.
- Notele cu status `stornat`, `devalidat` sau `anulat` nu mai intra in:
  - balanta;
  - fisa cont;
  - solduri cont;
  - registrul jurnal activ.
- Facturi intrare:
  - `POST /api/accounting/invoices-in/:uuid/devalidate`
  - `DELETE /api/accounting/invoices-in/:uuid` pentru anulare draft.
- Facturi iesire:
  - `POST /api/accounting/invoices-out/:uuid/devalidate`
  - `DELETE /api/accounting/invoices-out/:uuid` pentru anulare draft.
- Perioadele cu status `inchisa` sau `depusa` blocheaza validarea, devalidarea si editarea.
- Adaugat endpoint pentru marcarea perioadei ca depusa:
  - `POST /api/accounting/periods/:an/:luna/mark-submitted`

## Modificari frontend

- Facturile draft pot fi editate direct din lista.
- Facturile draft pot fi anulate controlat.
- Facturile validate pot fi devalidate si revin in draft.
- Erorile la validare/devalidare/anulare sunt afisate in pagina.
- Modalul de factura suporta editare document draft, scadenta si explicatie.

## Reguli functionale

- `draft` -> editabil, anulabil, validabil.
- `validat` -> intra in contabilitate, poate fi devalidat doar daca luna este deschisa.
- `devalidat` -> nota ramane in istoric, dar nu mai participa la rapoarte.
- `anulat` -> document pastrat in istoric, fara efect contabil.
- `inchisa` / `depusa` -> blocaj operational; corectiile se fac ulterior prin redeschidere autorizata sau documente rectificative.

## Verificari

- `node --check server/modules/accounting/accounting-engine.js`
- `node --check server/modules/accounting/accounting-routes.js`
- `npm run build` in `client`

