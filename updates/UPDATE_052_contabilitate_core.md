# UPDATE 052 - Contabilitate core

Versiune: 2.12.30 -> 2.12.31

## Inclus

- Modul Contabilitate cu dashboard, plan de conturi, terti, facturi intrare/iesire, trezorerie, registru jurnal, balanta, fisa cont, inchidere luna si alerte legislative.
- Seed plan de conturi extras din referinta Saga C 3.0: `E:\CODEX 1\saga\SAGA C.3.0\clona\conturi.dbf`.
- Fisier seed generat: `data/accounting-chart-saga.json` cu 583 conturi reale Saga.
- Motor contabil separat: `server/modules/accounting/accounting-engine.js`.
- Validare hard pentru dubla inregistrare: minim 2 linii, debit = credit, o singura parte completata pe linie, cont existent.
- Perioade contabile cu blocare la luna inchisa.
- Analitice automate pentru terti:
  - furnizor -> `401.00001`
  - client -> `4111.00001`
- Storno prin nota inversa; inregistrarea originala nu se sterge fizic.
- API complet sub `/api/accounting/*`.
- Migrare SQL Server 2008 compatible: `db/migrations/027_accounting_core.sql`.
- Permisiuni si licentiere modul: `accounting:view/manage/post/close/reports/alerts`.

## Observatii

- Numerotarea promptului original era UPDATE_042, dar in repository exista deja un update 042 si ultimul update functional era 051. Pentru a pastra istoricul curat, implementarea este livrata ca UPDATE_052.
- Modulul suporta DB_MODE=json prin `app_state` si pregateste schema MSSQL relationala prin migrare.
