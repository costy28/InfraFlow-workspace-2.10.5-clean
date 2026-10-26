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

## Probă SQL locală reală încheiată

scripts/probe-demo-platform-migration.js a creat numai baza temporară locală
INFRAFLOW_TEST_TRIALS_0184E75037F2. Migrarea nemodificată a fost refuzată cu
51201 pe această bază. Pentru executarea corpului SQL în test, numai literalul
DB_NAME țintă a fost înlocuit în memorie cu numele temporar; fișierul de migrare
livrabil nu a fost schimbat. Nu este o execuție pe baza de producție.

Cinci grupuri de assertions trecute: guard bază greșită; schemă parțială refuzată
cu rollback inclusiv pentru tabela schema_migrations; prima aplicare și no-op
la reaplicare; bindings derivate/aprobare unică/activare fără date refuzată și
stocare interval 15 zile; receipt cu JSON invalid refuzat. Nu se adună acestea
cu numărul testelor unitare. 4/4 teste politică/structură rerulate; audit 532/zero.

Cleanup prin DROP exclusiv pe baza creată de fixture în această rulare, fără
KILL/SINGLE_USER și fără loginuri create; DB_ID NULL verificat. passed=true,
cleanup=true,error=null. Mesajul inițial generic al fixture-ului despre bază
păstrată a fost urmat de cleanup-ul scriptului; nu există bază restantă din run.

Neacoperit aici: aplicare pe SQL Linux/VPS, CAS/comenzi concurente, audit atomic
prin proceduri și drepturi writer reale. Următorul pas necesită acord pentru
crearea celor patru tabele platform.schema_migrations/trials/trial_commands/
trial_events și a indecșilor în baza platformei deja creată. Fără modificări
în ERP, fără login nou sau acordare DML, fără restart.
