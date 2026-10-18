# UPDATE 751 — Sursa comandă CRM în Email

Versiune: **2.12.731** — 2026-10-18.

Repository-ul comenzii întoarce atât numărul comenzii, cât și pe cel al ofertei asociate. Serializerul Email alege acum eticheta după tipul sursei; pentru comandă folosește `order_number`. Nu inventează o rută UI pentru comandă și nu modifică permisiuni, date istorice sau schema.

Test dedicat: `server/tests/auth-crm-sql-http.test.js`, activat prin `INFRAFLOW_TEST_DOCUMENTS_SQL=1`. Loginul, verificarea parolei, sesiunile Bearer, politicile de acces și repository-urile CRM sunt reale. App-state este citit/scris în SQL prin adaptor dedicat testului; nu se afirmă validarea completă app.js/core/db. Baza sintetică este păstrată pentru diagnostic; fără SMTP, Meta sau Oblio.
