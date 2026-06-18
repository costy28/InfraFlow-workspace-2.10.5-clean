# UPDATE 075 - Flux vizibil Trezorerie -> Registru jurnal -> Balanta

Versiune: 2.12.54 -> 2.12.55
Data: 2026-06-16

## Context

Validarea din Trezorerie trebuia sa fie verificabila rapid: utilizatorul trebuie sa vada nota contabila generata si sa poata continua direct catre Registru jurnal si Balanta.

## Modificari

- Endpoint-ul `GET /api/accounting/treasury` returneaza pentru operatiile validate si date despre nota contabila:
  - `journal_uuid`
  - `journal_status`
  - `journal_total_debit`
  - `journal_total_credit`
  - `balance_month`
- Dupa validarea unei operatii de trezorerie, interfata afiseaza linkuri directe:
  - `Vezi registru jurnal`
  - `Verifica balanta`
- Trezoreria are filtre pe luna si status pentru verificari rapide.
- Tabelul de Trezorerie include coloana `Nota`, cu trimitere catre Registru jurnal.
- Registru jurnal si Balanta accepta parametrul `?luna=YYYY-MM`, pentru navigare contextuala din Trezorerie.

## Fisiere afectate

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/Trezorerie.jsx`
- `client/src/pages/accounting/RegistruJurnal.jsx`
- `client/src/pages/accounting/Balanta.jsx`
- `package.json`
- `server/package.json`
- `client/package.json`
- `electron/package.json`
- `version.json`

## Testare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run build`
- `git diff --check`
