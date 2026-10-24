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

## 8. Ciclul finit al workerului sintetic

`server/tests/support/demo-sql-worker-cycle.js` leagă operațiile într-un singur
`runSyntheticJobCycle`: claim → un heartbeat explicit → efect SQL sintetic →
confirmare. Helperul este permis numai în NODE_ENV=test. Nu are timer, polling,
daemon, executare shell, handler arbitrar sau rută HTTP și nu este importat de ERP.

Opțiunile acceptate sunt store-ul de test, trialId, workerId, ceasul determinist,
durata lease-ului și un punct de întrerupere fix, exclusiv pentru probe. Ceasul
nu poate merge înapoi. Rezultatele etapelor sunt validate înainte de continuare:
identitatea/generația claimului, termenul heartbeatului, receipt-ul cu un singur
efect și confirmarea. Un răspuns incert nu este presupus succes.

1. Fără candidat, ciclul întoarce `idle` și nu continuă cu heartbeat sau efect.
2. Refuzul/eroarea de heartbeat oprește imediat ciclul, fără efect sau confirmare.
3. Eroarea/receipt-ul invalid al efectului nu execută confirmarea.
4. Întreruperea după efect lasă receipt-ul persistent și jobul leased; înainte
   de termen alt worker nu îl preia. După termen noua generație îl regăsește și
   îl confirmă fără a-l dubla.
5. Întreruperea după confirmarea SQL lasă jobul completed; reluarea întoarce idle,
   fără redeschidere sau repetarea efectului.

Punctele fixe `after_claim`, `after_renew`, `after_effect`, `after_complete` sunt
injecții de eroare de test, nu comenzi accesibile unui solicitant Demo. Proba de
recuperare folosește excepții și obiecte client noi, nu omorârea unui proces OS ori
o cădere de rețea. Heartbeatul este un singur checkpoint în acest ciclu finit,
nu o buclă automată care păstrează o operație lungă în viață.

Probe: `server/tests/demo-sql-worker-cycle.test.js`. Rulare cu SQL explicit:

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test --test-concurrency=2 server/tests/demo-sql-worker-cycle.test.js server/tests/demo-trial-sql-renewal.test.js
```

Nicio confirmare de aici nu declară o instanță creată/ștearsă și nu modifică
starea trialului. Efectul rămâne un rând unic în `demo_synthetic_effects`.
WorkerId, ceasul și flagurile sunt contexte de test; autentificarea operatorului,
timpul de server, accesul SQL/OS și efectele externe rămân porți distincte.

Următorul increment: observabilitate read-only pentru joburi, astfel încât
operatorul să distingă pending, leased, expirat, superseded și completed și
să poată vedea receipt-ul/ultima generație fără secrete. Nu se adaugă pornire,
ștergere sau relansare de job din interfață prin simpla afișare a raportului.

Rezultat curent: **19/19 probe trecute**, zero skip: 12 pentru ciclu/controlul
său și 7 pentru regresia reînnoirii. Baze locale păstrate:
`INFRAFLOW_TEST_TRIALS_9E7193DB58E6` și `INFRAFLOW_TEST_TRIALS_DA81F5B07499`.
Audit expuneri: **489 fișiere, zero constatări**; sintaxă și diff check trecute.
Zero procese sintetice active la verificarea finală. Suitele JSON/browser și
celelalte probe SQL nu au fost rerulate în această etapă; rezultatele lor
anterioare nu sunt prezentate ca rulare curentă. Versiunea și arhivele nu se schimbă.

## 9. Raport read-only al joburilor

`readJobReport({trialId, now})` este expus numai de store-ul SQL de test.
`server/core/demo-trial-sql-report-test-store.js` citește pe un singur trial
revizia curentă, metadatele outbox-ului și existența receipt-ului sintetic.
Nu selectează snapshot-uri, aprobare, workerId, conexiuni, căi sau nonce-uri.
Nu există rută HTTP ori ecran montat în aplicația livrată.

Raportul include starea persistată și diagnosticul calculat la momentul cerut:

- `pending`: așteaptă revendicarea;
- `leased`: drept de lucru încă valabil;
- `lease_expired`: termen atins, fără modificarea rândului leased;
- `superseded`: revizie depășită, inclusiv când rândul nu a fost încă marcat fizic;
- `completed`: confirmare salvată, inclusiv pentru revizii istorice.

Generația curentă, termenele, existența receipt-ului și generația primei aplicări
sunt vizibile. Rezumatul numără diagnosticele. Nu există `canExecute=true`:
`executionAllowed` și `productionReady` rămân false. Un receipt prezent nu
reactivează lease-ul și nu autorizează confirmarea după expirare.

Citirea folosește o tranzacție scurtă cu aceeași ordine de lockuri ca operațiile
workerului (trial → joburi), pentru o vedere coerentă. Folosește UPDLOCK/HOLDLOCK,
deci „read-only” înseamnă **fără schimbarea datelor**, nu fără blocări ori o
certificare a unui cont SQL cu privilegii exclusiv de citire. Timeoutul rămâne
explicit; eșecul citirii nu este convertit într-un raport gol care pare sănătos.

`scripts/lib/demo-sql-job-report.js` validează și pregătește un obiect numai cu
câmpurile permise și un HTML static, fără scripturi, formulare, butoane, URL-uri
externe sau comenzi. Nu salvează singur fișiere și nu trimite date nicăieri.
Mai mult de 100 joburi, stări necunoscute, duplicate sau momente incompatibile
sunt refuzate; nu se ascunde trunchierea sub un raport aparent complet.
Încă nu există paginare. `now` clasifică **starea actuală** la un timp sintetic;
nu este o interogare istorică de tip „cum era baza atunci”.

Probe: `server/tests/demo-sql-job-report.test.js`, **9/9 trecute**, zero skip,
incluzând SQL real. Sunt comparate integral registry, trialuri, comenzi,
evenimente, joburi și receipts înainte/după citire. Sunt verificate stările,
termenul exact, receipt-ul cu generație nouă și refuzul unui trial necunoscut.
Sentinelele pentru date interne nu apar în JSON sau HTML. Baza nouă păstrată:
`INFRAFLOW_TEST_TRIALS_2C02B0108695`. Audit expuneri: **491 fișiere, zero
constatări**; sintaxa și diff check au trecut.

Rulare explicită:

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test server/tests/demo-sql-job-report.test.js
```

Următorul increment: filtre și paginare read-only cu verificarea consistenței
între pagini. Nicio afișare sau descărcare a raportului nu trebuie să revendice,
reînnoiască, relanseze sau să șteargă un job. Interfața operatorului și politica
de acces rămân o integrare separată de această funcție de test.

## 10. Filtre și paginare cu detectarea schimbărilor

`readJobReportPage` este o operație nouă, exclusiv a store-ului de test. Metoda
integrală `readJobReport` își păstrează contractul și limita de 100 joburi;
rendererul integral refuză noul format paginat, ca să nu prezinte o pagină drept
raport complet. Nu a fost montată o interfață nouă în aplicație.

Cererea primește `trialId`, `now`, `state`, `receipt`, `pageSize` și opțional
`cursor`. Filtrul state folosește diagnosticul efectiv (inclusiv lease_expired și
superseded derivat), iar receipt este all/present/missing. Dimensiunea paginii
este între 1 și 100; implicit 25. Un rezultat gol este o listă goală explicită.

Paginarea este keyset, ordonată crescător după revizie. Se citește un rând
suplimentar pentru a decide existența paginii următoare. `totalJobs` este totalul
trialului, `totalMatched` totalul după filtre, iar `summaryScope=page` precizează
că rezumatul pe stări descrie numai pagina curentă. Cursorul următor este null
numai la sfârșit. Nu se schimbă stări sau date pentru a construi paginile.

Într-o tranzacție scurtă, pe trialul blocat în aceeași ordine ca workerul, SQL
materializează metadatele vizibile ale tuturor joburilor/receipt-urilor, apoi
calculează o amprentă SHA2-256. Contextul trial/timp/filtre/dimensiune este inclus
în amprentă. Filtrarea folosește o variabilă tabel locală, nu DELETE pe tabelele
persistente. Referință: [Microsoft — HASHBYTES](https://learn.microsoft.com/en-us/sql/t-sql/functions/hashbytes-transact-sql).

Cursorul conține amprenta, contextul și ultima revizie. Schimbarea contextului
este refuzată, iar o amprentă diferită produce `job_report_changed`: operatorul
trebuie să reînceapă de la prima pagină. Sunt detectate și schimbările fără o
revizie nouă de trial: claim, heartbeat, receipt și confirmare. Timpul rămâne fix
între pagini; avansarea lui necesită un raport nou.

Acesta NU este un snapshot istoric păstrat pe server, nici un cursor semnat sau
o credențială. Nu conferă acces la alt trial și nu înlocuiește autorizarea unui
viitor operator. Poziția cursorului nu este dovada că utilizatorul a citit toate
paginile; garanția este pentru conținutul continuării normale, nu împotriva unui
client care își fabrică intenționat propria afișare. Hashul acoperă numai datele
selectate de raport, nu toate câmpurile sau evenimentele din baza platformei.

Probe: `server/tests/demo-sql-job-report-page.test.js`. Limita 100+1 este verificată
în probele pure; proba SQL folosește istoricul controlat cu trei joburi și
modificări reale între pagini. Nu se declară test de volum/scalabilitate.

Prima rulare a refuzat corect două pagini filtrate goale deoarece FOR JSON
întorcea null în expresia scalară. SQL-ul normalizează acum acel caz la `[]`;
validarea nu a fost eliminată sau relaxată. Se rerulează și raportul integral.

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test --test-concurrency=2 server/tests/demo-sql-job-report-page.test.js server/tests/demo-sql-job-report.test.js
```

Nu se promite citire fără lockuri sau cost constant: amprenta materializează
istoricul vizibil pe trial în SQL. Executorul PowerShell rămâne cel de test.
Următorul increment este previzualizarea/exportul static paginat cu marcarea
clară a paginii și a totalurilor, fără comenzi de execuție și fără publicare.

Rezultat final: **17/17 probe trecute**, zero skip (8 paginare, 9 regresia
raportului integral), inclusiv SQL real. Bazele finale păstrate sunt
`INFRAFLOW_TEST_TRIALS_5CA77A59D971` și `INFRAFLOW_TEST_TRIALS_483E2D133717`.
Prima rulare a păstrat bazele de diagnostic `INFRAFLOW_TEST_TRIALS_50617088F734`
și `INFRAFLOW_TEST_TRIALS_FFD868490720`; eșecul filtrului gol nu este ascuns.
Audit expuneri: **493 fișiere, zero constatări**; sintaxă/diff check trecute.
Nicio schemă ERP, versiune, arhivă, serviciu instalat sau instanță publică nu
este modificată. Celelalte suite SQL/JSON/browser nu sunt declarate rerulate.

## 11. Previzualizare și export static paginat

`scripts/lib/demo-sql-job-report-export.js` adaugă:

- `renderJobReportPagePreview`: pagină statică, marcată ca parțială sau continuare;
  ultima pagină nu este prezentată automat drept întregul raport;
- `collectJobReportExport`: colectare de la prima pagină, verificând cursorul,
  ordinea reviziilor, amprenta, contextul, totalurile și finalul selecției;
- `renderJobReportExport`: reverificare a pachetului înainte de HTML, cu pagini
  numerotate, filtre, moment sintetic și totaluri distincte.

Colecția este limitată la maximum 20 pagini a maximum 100 rânduri. După o eroare,
schimbare de amprentă, final prematur, pagini duplicate sau depășirea limitei nu
este întors un export parțial cu `complete=true`. Helperul nu scrie fișiere;
artefactele QA sunt salvate de test numai după colectarea și randarea reușite.
Nu se declară publicare atomică a mai multor fișiere ori download de producție.

Exportul JSON este reconstruit din câmpuri permise, nu reflectă obiectele primite
integral. HTML-ul are CSS local fix, fără scripturi, resurse externe, formulare,
butoane sau comenzi. Totul rămâne NODE_ENV=test pentru colectare/export complet;
prezentarea pură nu acordă autoritate asupra vreunui job.

Un export reușit este o observație coerentă a selecției colectate, nu un raport
live care continuă să se actualizeze după salvare. Momentul afișat este sintetic
în probe, nu ora calendaristică a unei platforme în producție.

Probe în `server/tests/demo-sql-job-report-export.test.js`: pagini complete și
parțiale, selecție goală, curățarea câmpurilor interne, limite, date schimbate,
final prematur, erori de citire și raport falsificat. Chrome verifică desktop și
mobil, lipsa cererilor externe și a controalelor interactive, plus capturi QA.
Proba SQL colectează paginile reale, compară registrul și refuză continuarea când
un claim schimbă datele între pagini. Nu este un test pentru raportare live la scară.

Artefacte generate în `installer/output/qa/`:

- `demo-job-export-sql.html` și `demo-job-export-sql.json`: selecție din baza SQL de test;
- `demo-job-export-fixture.html`: previzualizare pe fixture pur;
- `demo-job-export-desktop.png`, `demo-job-export-mobile.png`: capturi ale fixture-ului,
  nu ale Demo-ului public sau ale unei instalații client.

Rulare explicită, cu `INFRAFLOW_PLAYWRIGHT_MODULE` către modulul local Playwright:

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test --test-concurrency=2 server/tests/demo-sql-job-report-export.test.js server/tests/demo-sql-job-report-page.test.js
```

Nicio interfață de administrare nu este montată în ERP prin această etapă.
Următorul prag: contract separat de acces pentru operator și autorizarea citirii
într-un harness autentificat, înainte de expunerea raportului printr-un serviciu.
Administratorul unei companii Demo nu devine operator al platformei.

Rezultate: rularea combinată export+paginare **16/16**, zero skip, cu SQL și
Chrome. După rafinarea etichetelor, exportul final a fost rerulat **8/8**, zero
skip, inclusiv SQL/Chrome. Capturile desktop și mobil au fost inspectate vizual.
Baze locale noi păstrate: `INFRAFLOW_TEST_TRIALS_247669FE8E2A`,
`INFRAFLOW_TEST_TRIALS_E3D3B82B3E6B` și, pentru exportul final,
`INFRAFLOW_TEST_TRIALS_BF576CE167BC`. Nu sunt baze VPS ori ERP.
Audit expuneri: **494 fișiere, zero constatări**; sintaxă/diff check trecute;
zero procese sintetice active la final. Celelalte suite nu sunt declarate
rerulate. Versiunea 2.12.736, serviciile și arhivele rămân neatinse.
