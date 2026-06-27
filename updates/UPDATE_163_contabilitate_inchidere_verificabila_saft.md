# UPDATE 163 - Contabilitate: inchidere verificabila si SAF-T

Versiune: `2.12.143`
Data: `2026-06-27`

## D394

- Grupare pe tert, CUI, tip operatiune si cote TVA.
- Detaliu pentru fiecare factura inclusa in raport.
- Excludere explicita a documentelor tertilor externi din raportul intern D394.
- Avertizari pentru CUI invalid, numar lipsa si data lipsa.
- Export Excel cu foi `D394 lucru`, `Documente` si `Verificari`.

## Inchidere luna

- Snapshot versionat la fiecare inchidere.
- Snapshotul include balanța analitica, documentele perioadei, TVA si controalele de inchidere.
- Amprenta SHA-256 permite identificarea exacta a fotografiei contabile.
- Istoric pastrat pentru inchidere, redeschidere si depunere.
- Motivul redeschiderii si referinta recipisei sunt vizibile in istoric.

## Rapoarte

- Fisa de cont afiseaza conturile corespondente si sumarul lunar.
- Exportul fisei include o foaie separata `Sumar lunar`.
- Exportul Cartii Mari separa sumarul conturilor de miscarile detaliate.

## SAF-T

- Diagnostic tehnic pentru companie, plan de conturi, terti, facturi, note si materiale.
- Procent de acoperire si lista actionabila a datelor lipsa.
- Export Excel `Diagnostic SAF-T` pentru remedierea maparilor.
- Nu se genereaza XML D406 pana la integrarea si validarea schemei ANAF aplicabile.

## MSSQL

- Migrare `031_accounting_period_snapshots.sql` compatibila SQL Server 2008.
- Tabele noi: `dbo.accounting_period_snapshots`, `dbo.accounting_period_events`.
- Sincronizarea relationala include noile structuri.

## Teste

- `npm run test:accounting`
- `node --check` pentru modulele contabile modificate.
- `npm run build`
