# UPDATE 082 - Stabilizare migrare contabilitate SQL

Versiune: 2.12.62
Data: 2026-06-18

## Context

Migrarea contabilitatii din `dbo.app_state` in tabelele relationale SQL putea afisa eroare generica atunci cand datele aveau ID-uri textuale sau cand operatia dura peste timeout-ul intern al comenzii SQL.

## Modificari

- Normalizare ID-uri contabile inainte de copierea in SQL:
  - conturi
  - terti
  - perioade
  - note contabile
  - facturi intrare/iesire
  - trezorerie
  - alerte legislative
- Liniile de factura primesc ID numeric secvential stabil pentru tabelele `accounting_invoice_in_lines` si `accounting_invoice_out_lines`.
- Timeout-ul real al comenzii SQL Server respecta durata ceruta de operatiile lungi de migrare.
- Endpoint-ul de migrare raporteaza tabelul exact care a picat, daca apare o eroare.
- Ecranul Setari > Baza date afiseaza cate randuri exista efectiv in tabelele contabile SQL dupa migrare.

## Verificare

- `node --check server/core/db.js`
- `node --check server/modules/accounting/relational-sync.js`
- `npm run build` in `client`
- Test real local pe SQL Express:
  - 584 conturi
  - 2 terti
  - 2 perioade
  - 2 note contabile
  - 6 linii de jurnal
  - 1 factura intrare + 1 linie
  - 1 factura iesire + 1 linie
  - 1 operatiune trezorerie
  - tabele lipsa: 0

