# UPDATE 079 - Migrare contabilitate catre SQL relational

Versiune: 2.12.58 -> 2.12.59  
Data: 2026-06-18

## Context

Modulul Contabilitate functioneaza stabil pe `dbo.app_state`, dar pentru livrari reale si verificare in SQL Server trebuie sa existe tabele relationale populate, nu doar pregatite.

## Modificari

- Adaugata migrarea `029_accounting_relational_sync.sql`.
- Create tabele pentru liniile facturilor:
  - `dbo.accounting_invoice_in_lines`
  - `dbo.accounting_invoice_out_lines`
- Creat tabel de jurnal sincronizare:
  - `dbo.accounting_relational_sync`
- Adaugat modul backend separat:
  - `server/modules/accounting/relational-sync.js`
- Adaugat endpoint superadmin:
  - `POST /api/system/database-schema/sync-accounting`
- Setari > Baza date afiseaza butonul `Migreaza contabilitatea`.
- Statusul schemei arata ultima migrare si numarul de conturi, terti, facturi, trezorerie si note copiate.

## Decizie tehnica

Aplicatia ramane deocamdata cu `dbo.app_state` ca sursa principala. Tabelele SQL sunt o oglinda controlata pentru verificare, raportare si trecere treptata pe model relational.

## Verificari

- `node -c server/modules/accounting/relational-sync.js`
- `node -c server/modules/system/routes.js`
- `node -c server/core/db.js`
- `npm run build`
- `git diff --check`

