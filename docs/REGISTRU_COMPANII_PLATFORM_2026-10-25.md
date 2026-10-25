# Registru companii — schemă platformă, pregătire locală

Migrare propusă: db/demo-platform-migrations/001_company_registry.sql.
Nu este în runner-ul ERP și refuză orice DB_NAME diferit de
INFRAFLOW_DEMO_PLATFORM. Nu a fost aplicată pe VPS sau executată pe SQL local.

Schema relațională platform.trials păstrează aprobare unică, nume companie,
stare, revizie, timpi UTC și identificatori de resurse derivați din UUID prin
coloane calculate persistente. Nu acceptă nume de bază/căi/chei furnizate de
browser. key_ref este numai referință, nu cheia secretă. Trial commands oferă
loc pentru digest și receipt idempotent; events pentru audit per revizie.
Aceste tabele nu implementează singure tranzacțiile comenzilor/workerul.

Migrarea are tranzacție, application lock, versionare și refuzul schemei
parțiale neînregistrate. Reaplicarea versiunii înregistrate este no-op, nu un
audit complet de drift. Nu creează loginuri, privilegii de scriere sau API-uri.
Loginul existent are deja SELECT pe schema platform; datele viitoare trebuie
să rămână metadate fără tokenuri/parole/chei. Nu este acces public autorizat.

server/demo-platform/trial-policy.js este o politică pură, fără I/O sau
autorizare: creează record queued, activează numai awaiting_activation o singură
dată, stabilește exact 15*24 ore în milisecunde de la activare și refuză accesul
la termen. id/now provin din context de serviciu de încredere, nu din payload.
Nicio funcție nu creează sau șterge resurse reale.

Validare: 10/10 teste locale Node (4 noi, 6 regresii), zero skip. Migrarea a
fost verificată structural, nu compilată/executată SQL. Nu declarăm CAS,
concurență, rollback sau idempotentă tranzacțională validate în această schemă
de producție. Probele vechi test-only rămân dovezi separate.

Urmează validarea migrației pe SQL izolat, apoi aplicare explicit autorizată
pe baza platformei. După aceasta: proceduri restrânse și identitate de scriere
separată, comenzi CAS/audit/idempotentă atomică și integrare operator autentificat.
Readiness public rămâne negativ, fără provisionare/ștergere automată.
