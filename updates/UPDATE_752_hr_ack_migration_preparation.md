# UPDATE 752 — Pregătire migrare confirmări documente HR

Versiune: **2.12.732** — 2026-10-18.

Schema relațională, construită de la zero într-o bază sintetică, a eșuat la migrarea 063: SQL Server compilează UPDATE înaintea ALTER TABLE din același batch și raportează coloana `generated` inexistentă.

Migrarea nouă `062b_hr_employee_file_ack_columns.sql` pregătește idempotent cele trei coloane referite de UPDATE, înainte de 063. Migrarea istorică rămâne intactă. Coloanele existente nu sunt rescrise; nu se șterg date. Nu se activează modul relațional extins și nu se schimbă conexiunile instalațiilor.

Test SQL opt-in: `server/tests/hr-ack-migration-sql.test.js`, cu `INFRAFLOW_TEST_RELATIONAL_SQL=1`. Diagnostic mai larg: `scripts/diagnose-relational-schema.js`, aceeași variabilă; acesta construiește doar schema și se oprește la prima eroare, nu validează sincronizarea app-state sau întreaga aplicație.

Pool-ul Node cu autentificare Windows integrată este o limitare separată a driverului implicit Tedious, nu este rezolvat prin această migrare. Executorul PowerShell rămâne neschimbat.

Verificări: test SQL real cu reproducere înaintea corecției și aplicări repetate după corecție; trei înregistrări păstrate și document anulat neactualizat. Două teste opt-in trecute. Regresie fără SQL: 52 teste trecute, un test SQL sărit explicit; build și audit expuneri reușite. Rezultatul diagnosticului integral de schemă și limitele sincronizării sunt consemnate în matricea de roluri.
