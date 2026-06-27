# UPDATE 164 - Contabilitate: operatiuni complete

Versiune: `2.12.144`
Data: `2026-06-27`

## Extrase bancare

- Import CSV, XLS si XLSX, cu limita de 10 MB.
- Normalizare pentru data, explicatie, document, debit si credit.
- Detectarea fisierelor importate anterior prin amprenta SHA-256.
- Creare de operatiuni Trezorerie in status `draft`.
- Potrivire exacta dupa numarul facturii si suma, fara validare automata.

## Stocuri

- Diagnostic lunar pentru miscarile nesincronizate.
- Verificare material, cantitate si cost unitar inainte de contabilizare.
- Note contabile pentru intrari si consumuri, fara dublarea miscarilor deja preluate.
- Transferurile interne si soldurile initiale nu genereaza artificial cheltuieli.

## Mijloace fixe

- Registru pentru mijloace fixe si numar de inventar unic.
- Editare controlata si anulare logica, fara stergere fizica.
- Amortizare liniara lunara, limitata la valoarea amortizabila ramasa.
- Note contabile automate si protectie la reluarea aceleiasi luni.

## Declaratii

- Control intre TVA-ul calculat din documente si rulajele conturilor `4426` si `4427`.
- Diferentele sunt afisate ca verificare distincta in pregatirea declaratiilor.
- SAF-T ramane diagnostic de mapare; acest update nu declara un XML D406 ca fiind validat oficial.

## Inchidere anuala

- Verificarea perioadelor anului si a lunii decembrie inainte de inchidere.
- Inchiderea conturilor de cheltuieli si venituri din clasele 6 si 7 prin contul `121`.
- Jurnal echilibrat, audit si protectie la inchiderea repetata a aceluiasi an.

## MSSQL si JSON

- Migrare `032_accounting_operations.sql`, compatibila SQL Server 2008.
- Tabele: `accounting_bank_imports`, `accounting_stock_postings`, `accounting_fixed_assets`, `accounting_depreciation_runs`, `accounting_annual_closings`.
- Structurile sunt initializate si in modul JSON, iar sincronizarea relationala include noile date.

## Interfata

- Ruta noua `/contabilitate/operatiuni`.
- Acces din meniul intern al modulului Contabilitate, grupul Operatiuni.
- Panouri separate pentru extras bancar, stocuri, mijloace fixe, amortizare si inchidere anuala.

## Verificari

- `npm run test:accounting` - noua teste de regresie.
- `node --check` pentru modulele backend modificate.
- `npm run build` pentru client.
