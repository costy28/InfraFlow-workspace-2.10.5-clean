# UPDATE 753 — Preflight pentru migrarea Controlling 066

Versiune: **2.12.733** — 2026-10-18.

Migrarea nouă `065b_controlling_legacy_cleanup_preflight.sql` pregătește coloanele de anulare ale centrelor și asocierilor, evitând eroarea de compilare din 066. Migrarea istorică rămâne intactă.

Înainte de 066, codurile istorice sunt comparate cu numele/tipul/company_id din seed-ul 021. Personalizările sau referințele găsite prin chei străine și coloanele cunoscute Controlling/Flotă opresc migrarea cu eroare 51066 și mesaj pentru verificare manuală. Nu sunt șterse, redenumite sau dezactivate aceste date de preflight. O corelare cod/nume/tip fără referințe nu este o dovadă absolută de origine: de aceea nu se declară migrarea generală a datelor validată.

Dacă 066 este deja înregistrată în istoricul migrărilor, noua gardă nu blochează retroactiv upgrade-ul. Nu restaurează modificări istorice deja executate. Configurația standard app-state și conexiunile rămân neschimbate; nu se activează automat modul relațional extins.

Test opt-in SQL: `server/tests/controlling-cleanup-migration-sql.test.js` cu `INFRAFLOW_TEST_RELATIONAL_SQL=1`. Rezultatele și limitele diagnosticului sunt în matricea Documente/Mesaje și în jurnalul auditului.

Verificări trecute: două teste în rularea SQL dedicată, incluzând coliziuni de cod, referințe prin asocieri/buget/vehicul, reluare și istoric deja aplicat; 18 centre păstrate. Regresie fără SQL: 53 teste trecute și două sărite explicit. Build, audit expuneri și verificare versiune reușite. Nu se declară migrarea datelor clientului sau modul relațional complet validate.
