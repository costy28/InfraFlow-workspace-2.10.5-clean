# UPDATE 165 - Contabilitate: reconciliere si inchidere completa

Versiune: `2.12.145`
Data: `2026-06-27`

## Reconciliere bancara

- Detectare automata pentru profile uzuale de extras si fallback generic CSV/Excel.
- Date suplimentare importate: partener, IBAN si CUI, atunci cand exista in fisier.
- Sugestii de factura dupa suma ramasa, numar document si identificarea tertului.
- Confirmarea potrivirii nu valideaza automat operatia; controlul final ramane in Trezorerie.
- Un lot poate fi marcat procesat numai dupa validarea sau clasificarea tuturor operatiilor.

## Stocuri

- Evaluare cronologica prin cost mediu ponderat (CMP).
- Intrari valorizate la costul documentului si iesiri valorizate la CMP disponibil.
- Transferurile interne sunt neutre in evaluarea globala.
- Diagnostic pentru intrari fara cost si stocuri negative.
- Sincronizarea contabila foloseste CMP atunci cand iesirea nu are cost explicit.

## Mijloace fixe

- Evenimente pentru punere in functiune, transfer, reevaluare si casare.
- Reevaluarea actualizeaza valoarea si genereaza nota prin contul 105.
- Casarea descarca valoarea, amortizarea cumulata si valoarea neta prin contul 6583.
- Istoricul evenimentelor este pastrat separat de fisa mijlocului fix.

## Declaratii

- Validare interna separata pentru D300 si D394.
- Fiecare validare are checksum si lista erorilor constatate.
- Recipisa ANAF se poate inregistra numai dupa o validare interna fara erori.
- D300 include obligatoriu controlul facturi versus conturile 4426/4427.
- Exporturile existente raman documente de lucru; nu sunt etichetate ca XML oficial validat.

## Inchidere anuala

- Control separat pentru reportarea soldurilor in anul urmator.
- Se reporteaza numai conturile bilantiere; clasele 6 si 7 sunt excluse.
- Protectie la report dublu si la suprascrierea soldurilor initiale existente.
- Export Excel pentru verificarea soldurilor propuse.

## MSSQL si JSON

- Migrare `033_accounting_advanced_operations.sql`, compatibila SQL Server 2008.
- Tabele noi: `accounting_fixed_asset_events`, `accounting_declaration_runs`, `accounting_carryforward_runs`.
- Sincronizarea relationala si numaratoarea tabelelor includ toate noile structuri.
- Modul JSON initializeaza automat aceleasi colectii.

## Verificari

- `npm run test:accounting` - 14 teste.
- `node --check` pentru modulele contabile.
- `npm run build` pentru clientul 2.12.145.
