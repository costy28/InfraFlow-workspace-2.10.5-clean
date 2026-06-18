# UPDATE 076 - Flux vizibil Facturi -> Registru jurnal -> Balanta

Versiune: 2.12.55 -> 2.12.56
Data: 2026-06-18

## Context

Dupa stabilizarea fluxului de Trezorerie, facturile de intrare si iesire trebuie sa ofere acelasi traseu clar: draft, validare, nota contabila, verificare in Registru jurnal si Balanta.

## Modificari

- Endpoint-urile de facturi returneaza pentru documentele validate si date despre nota contabila:
  - `journal_uuid`
  - `journal_status`
  - `journal_total_debit`
  - `journal_total_credit`
  - `balance_month`
- Dupa validarea unei facturi apar linkuri directe:
  - `Vezi registru jurnal`
  - `Verifica balanta`
- Listele de facturi de intrare/iesire au filtre pe luna si status.
- Tabelul de facturi include coloana `Nota`, cu trimitere spre Registru jurnal.
- Validarea are pre-verificari locale pentru:
  - status draft;
  - data facturii;
  - total pozitiv;
  - furnizor/client;
  - linii si conturi contabile.
- Actiunile `Valideaza`, `Devalideaza`, `Storno` si `Anuleaza` afiseaza mesaje clare si stare de incarcare.

## Fisiere afectate

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/FacturiContab.jsx`
- `package.json`
- `server/package.json`
- `client/package.json`
- `electron/package.json`
- `version.json`

## Testare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run build`
- `git diff --check`
