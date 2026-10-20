# UPDATE 754 — Index SQL pentru alerte contractuale

Versiune: **2.12.734** — 2026-10-18.

Migrarea 068 conținea NOT IN în predicatul unui index filtrat, sintaxă respinsă de SQL Server. Corecția din fișierul istoric este strict de sintaxă: comparații <> cu AND, același set de rânduri. Este necesară acolo deoarece eroarea de parsare nu poate fi evitată printr-o migrare ulterioară sau un index precreat.

Migrarea nouă `078_contract_task_open_alert_index.sql` creează indexul dacă lipsește. Dacă există duplicate active, se oprește cu mesaj pentru verificare manuală; nu șterge și nu modifică task-uri. Nu reconstruiește un index deja existent/customizat și nu validează automat definiția acestuia. Regula NULL rămâne cea istorică: cel mult un task activ cu alert_code NULL pentru același contract; această etapă nu extinde comportamentul task-urilor manuale.

Comparațiile sunt acceptate de [sintaxa oficială CREATE INDEX](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql?view=sql-server-ver17#syntax).

Test SQL opt-in: `server/tests/contract-task-index-sql.test.js`, cu `INFRAFLOW_TEST_RELATIONAL_SQL=1`. Diagnosticul general și limitele sunt în matricea Documente/Mesaje. Configurația MSSQL standard și conexiunile nu se schimbă; modul relațional extins nu este activat automat.

Test SQL dedicat: două teste trecute, cu reproducere istorică, unicitate activă, stări finale/anulare, regula NULL și recuperare fără ștergerea duplicatelor. Regresie fără opt-in: 54 teste trecute, trei teste SQL sărite explicit. Build și audit expuneri reușite. Diagnosticul de schemă nu trebuie confundat cu sincronizarea datelor sau acceptanța completă a aplicației.

Diagnosticul complet a aplicat toate cele 87 de fișiere SQL pe o bază goală, fără eroare. Sincronizarea generală rămâne neimplementată/nevalidată (fișierul de import app-state lipsește); nu se activează modul extins pe instalații.
