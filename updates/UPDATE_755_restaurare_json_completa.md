# UPDATE 755 — Restaurare JSON cu păstrarea domeniilor actuale

Versiune: **2.12.735** · Data: **22 octombrie 2026**

Restaurarea nu mai reconstruiește snapshotul prin lista legacy care omitea
domenii noi. Păstrează toate câmpurile JSON, inclusiv CRM, Documente, Mesaje,
departamente, setări și valori criptate. Listele opționale legacy absente primesc
în continuare valori implicite goale. Structurile invalide sunt refuzate.

Nu se modifică permisiunile rutelor, backupul de siguranță sau comportamentul
de restart. Nu este necesară migrare SQL. Nu se restaurează fișiere storage sau
APP_KEY din JSON. Pentru tabele relaționale separate este necesar backup MSSQL.
Păstrați separat cheia originală; ciphertextul nu înlocuiește cheia.

Verificări: `node --test server/tests/restore-data.test.js`, `npm run test:backup`.
Proba nativă SQL este separată, opt-in: `server/tests/mssql-backup-roundtrip.test.js`.
