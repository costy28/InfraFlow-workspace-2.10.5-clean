# Joburi Demo SQL — claim, lease și generație (test izolat)

Data: 24 octombrie 2026. Extensie a primei probe de registru SQL, nu serviciu
de provisionare. Nicio operație fizică pe companii nu este executată.

## 1. Implementare

- Migrare nouă, separată de ERP:
  `db/control-plane-test-migrations/002_trial_job_leases.sql`.
- Operații centrale SQL:
  `server/core/demo-trial-sql-job-test-store.js`, expuse de fabrica de test a
  registrului prin `claimJob` și `completeJob`.
- Probe: `server/tests/demo-trial-sql-jobs.test.js`.

Se păstrează gardurile: NODE_ENV=test, nume strict de bază de test, executor
local explicit. Nu există rută HTTP, autentificare de operator sau proces
worker pornit automat. Identitatea `workerId` este intrare de încredere a testului,
nu un mecanism de autentificare pentru un viitor serviciu public.

## 2. Contract

`claimJob({ trialId, workerId, now, leaseMs })`:

1. Blochează tranzacțional trialul țintă cu `UPDLOCK,HOLDLOCK`.
2. Marchează `superseded` joburile pending/leased ale reviziilor anterioare.
3. Revendică numai jobul reviziei curente dacă este pending ori lease-ul a expirat.
4. Incrementează generația, fixează workerul, momentul claimului și termenul;
   returnează identitatea jobului după COMMIT. Dacă nu există candidat, `job=null`.

Fiecare claim nou primește generație nouă, inclusiv dacă același worker reia
după expirare. Doi clienți SQL concurenți nu obțin același claim valabil.
Ordinea blocărilor este trial → outbox; nu se face apel extern sub aceste lockuri.
Referință: [Microsoft — Table hints](https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table).

`completeJob({ trialId, revision, generation, workerId, now })`:

1. Refuză alt worker, altă generație, revizie depășită sau job nerevendicat.
2. Acceptă numai în intervalul `claimedAt <= now < leaseUntil`. La termen exact
   lease-ul este expirat, chiar dacă nimeni nu a revendicat încă jobul.
3. Marchează `completed` fără a modifica starea trialului.
4. Repetarea aceleiași confirmări deja persistate întoarce `already_completed`,
   inclusiv după termen; nu redeschide lease-ul și nu execută din nou vreun efect.

Un job deja completat rămâne istoric: confirmarea sa identică poate fi recunoscută
după avansarea trialului, dar nu confirmă jobul noii revizii. Un job leased al
unei revizii vechi nu mai poate fi completat, chiar dacă lease-ul lui nu a expirat.

## 3. Timp, validări și schemă

Timpul este injectat explicit pentru probe deterministe. Nu este ora browserului
și nu este încă implementată sursa de timp a serviciului de producție. Lease-ul
de test este între 1 și 60.000 ms; această limită nu este politică instalată.
Inputurile refuză câmpuri suplimentare, identificatori nesiguri, valori negative,
depășiri numerice și durate invalide înainte de executor.

Outbox-ul are acum stările `pending`, `leased`, `completed`, `superseded` și
coloane pentru generație, worker, claim, termen și confirmare. Constrângerile
SQL verifică stările și datele necesare. Migrarea este tranzacțională și
idempotentă pentru schema de test cunoscută; nu este adăugată runnerului ERP.

## 4. Probe

Matrice SQL reală, pe conexiuni independente:

- competiție pe același trial: un claim, celălalt client primește null;
- un alt trial își păstrează jobul disponibil;
- refuz la termen exact, reatribuire cu generație crescută și refuzul workerului vechi;
- refuz pentru alt worker, inclusiv diferență de majuscule;
- client nou poate confirma claimul persistent, fără stare în memoria clientului inițial;
- retry identic de confirmare fără repetarea efectului administrativ;
- același worker/generație nouă nu legitimează vechea generație;
- refuz când timpul confirmării este anterior claimului;
- avansarea trialului invalidează jobul leased anterior, înainte de expirare;
- trial inexistent: nici claim, nici confirmare;
- validări fără nicio execuție SQL.

Rulare explicită:

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test --test-concurrency=2 server/tests/demo-trial-sql-jobs.test.js server/tests/demo-trial-sql-store.test.js
```

Sunt create baze locale noi cu nume de test, păstrate pentru inspecție conform
politicii fixture-ului. Nu se folosește o bază ERP și nu există DROP automat.
Prima încercare a întâlnit o eroare SQL 102 în expresia de DDL din migrare;
construcția numelui constrângerii a fost separată într-o variabilă înainte de EXEC.
Nu au fost relaxate testele sau gardurile pentru a accepta acea eroare.

Rerularea explicită după corecție: **16/16 probe SQL trecute**, zero skip,
incluzând regresia registrului. Bazele noii rulări, păstrate pentru inspecție:
`INFRAFLOW_TEST_TRIALS_32F88356D4FB` (joburi) și
`INFRAFLOW_TEST_TRIALS_2CC8333D6BA9` (registru). Primele două baze de diagnostic,
create înaintea corecției DDL și fără migrarea 002 finalizată, sunt
`INFRAFLOW_TEST_TRIALS_E6E26559B096` și `INFRAFLOW_TEST_TRIALS_8615B3C6E2F3`.
Nu au fost modificate baze ERP și nu s-a șters nicio bază existentă.

Regresia JSON/browser a fost rerulată separat: **87/87**, zero skip, inclusiv
Chrome. Auditul expunerilor: **486 fișiere, zero constatări**; verificările de
sintaxă și diff au trecut. Inventarul final: zero procese sintetice active.
Versiunea 2.12.736, serviciile și arhivele Windows/Linux sunt neatinse.

## 5. Ce NU este demonstrat

Aceste operații protejează **confirmarea SQL**, nu pot opri fizic un worker vechi
care ar avea deja drepturi directe asupra fișierelor/bazelor. Viitorul executor
trebuie să reverifice autoritatea/generația la limita efectului, să fie idempotent
și să reconcilieze un efect reușit a cărui confirmare s-a pierdut. Nu promitem
execuție fizică „exact o dată” pe baza acestui lease.

Nu există încă heartbeat/reînnoire de lease, daemon, handler de provisionare,
ștergere, rutare, sandbox extern sau integrare WordPress/email. Nu este portat
întregul store JSON. Executorul SQL rămâne Windows PowerShell/System.Data de test,
nu driverul Node/Linux al viitorului serviciu. Nu s-au simulat panne OS/SQL sau
întreruperi reale de rețea. Confirmarea jobului nu echivalează cu crearea ori
ștergerea unei instanțe ERP.

## 6. Următoarea etapă

Reînnoirea controlată a lease-ului și proba de reluare după pierderea confirmării,
cu un handler sintetic idempotent, fără acces la resurse ERP. Executorii reali și
pilotul public rămân dezactivați până la verificarea separată a identităților,
ACL-urilor, timpului de server și a limitei efectelor.

## 7. Extensie: heartbeat controlat și efect sintetic idempotent

`renewJob` acceptă identitatea completă a claimului, timpul sintetic, durata și
`expectedLeaseUntil`. Operația este tranzacțională și verifică simultan:

1. Revizia trialului este încă aceeași, jobul este leased și identitatea/generația coincid.
2. `claimedAt <= now < leaseUntil`; un worker expirat nu se poate reactiva prin heartbeat.
3. Termenul curent este cel așteptat, iar noul termen este strict mai mare.
4. Generația nu se schimbă la heartbeat; se schimbă numai când jobul este reatribuit.

Două heartbeaturi concurente cu același termen așteptat au un câștigător; celălalt
este refuzat. Nu se implementează aici retry idempotent al heartbeatului pierdut:
workerul nu trebuie să presupună o prelungire neconfirmată. Acesta este un contract
conservator, nu un mecanism complet de recuperare a răspunsurilor heartbeat.

Migrarea nouă `003_synthetic_effect_receipts.sql` adaugă numai tabela de test
`demo_synthetic_effects`. `applySyntheticEffect` verifică din nou lease-ul și
revizia la scriere, sub aceeași tranzacție/ordine de lockuri. Efectul este exact
un rând SQL, cu `effect_count=1`, unic pe trial/revizie. Nu creează bază ERP,
director, cont, email ori document fiscal. Un retry autorizat întoarce `replayed`
fără un rând nou; un worker fără lease valabil nu poate nici relua efectul.

Scenariul de recuperare omite deliberat `completeJob` după persistarea efectului.
După expirare, un client nou revendică generația următoare, regăsește efectul,
apoi confirmă. Sunt verificate și două cereri concurente pentru efect: numai
una îl aplică, cealaltă îl regăsește. La final există un singur rând/efect pentru
jobul reluat, păstrând generația primei aplicări. Revizia nouă refuză atât
heartbeatul, cât și efectul vechiului job încă neexpirat.

Probe dedicate în `server/tests/demo-trial-sql-renewal.test.js`; rulare explicită:

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test server/tests/demo-trial-sql-renewal.test.js
```

S-a simulat pierderea confirmării prin omiterea apelului, nu printr-o cădere de
rețea sau un crash OS. Un rând SQL idempotent nu demonstrează idempotenta pentru
provisionare, ștergere, SMTP sau alte sisteme externe. Nici aceste probe nu
activează daemonul ori executorii reali. Timpul și workerId rămân contexte de
test de încredere, nu date acceptabile dintr-un browser în producție.

Următorul increment: un ciclu de worker exclusiv sintetic care leagă claim,
heartbeat, efect/receipt și confirmare, cu recuperare după întrerupere și
reverificarea generației. Nu se conectează încă la provisionerul real.

Rezultat final al extensiei: **7/7 probe dedicate**, zero skip, pe baza
`INFRAFLOW_TEST_TRIALS_800EB413BD4C`, păstrată pentru inspecție. Regresia SQL
anterioară registru/joburi a trecut **16/16** în rularea combinată; aceasta a
inclus și o iterație intermediară cu patru scenarii de renewal (22 probe total).
Fișierul final, cu al cincilea scenariu și efect concurent, a fost rerulat
dedicat 7/7. Nu sunt prezentate drept o singură rulare combinată de 23 probe.

Celelalte baze noi din această etapă sunt `INFRAFLOW_TEST_TRIALS_FDA4858E862D`,
`INFRAFLOW_TEST_TRIALS_40A0EA347A71`, `INFRAFLOW_TEST_TRIALS_0351CCF8CEBB`.
Sunt baze locale de test, nu pe VPS; nu se șterg automat. Audit expuneri: 487
fișiere, zero constatări; sintaxă și diff check trecute. Regresia JSON/browser
87/87 din etapa anterioară nu a fost rerulată în această etapă, limitată la SQL.
