# UPDATE 072 - Hotfix schema SQL contabilitate

Versiune: 2.12.51 -> 2.12.52
Data: 2026-06-16

## Problema

In Setari > Baza date, schema SQL afisa tabele relationale existente, dar raporta lipsa tabelelor contabile:

- `accounting_chart`
- `accounting_journals`
- `accounting_journal_lines`
- `accounting_third_parties`
- `accounting_invoices_in`
- `accounting_invoices_out`
- `accounting_treasury`
- `accounting_periods`

Acest caz poate aparea cand `schema_migrations` contine istoricul migrarilor, dar tabelele efective lipsesc din baza.

## Schimbari

- Pregatirea schemei SQL ruleaza acum reparatii explicite pentru migrarile contabile critice.
- Daca lipseste oricare tabel contabil de baza, se ruleaza idempotent `027_accounting_core.sql`.
- Dupa crearea tabelelor de baza, se ruleaza idempotent `028_accounting_controlling_link.sql`.
- Reparatia nu schimba sursa principala de date: aplicatia foloseste in continuare `dbo.app_state` pana la migrarea controlata.

## Verificari

- `node --check server/core/db.js`
- `node --check server/modules/system/routes.js`
- `npm run build`
