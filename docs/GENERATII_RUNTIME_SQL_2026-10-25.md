# Generații runtime persistente — probă SQL izolată

25 octombrie 2026 · Sursă 2.12.736 · Control plane exclusiv de test.

## Contract și implementare

Migrare separată `db/control-plane-test-migrations/004_runtime_generations.sql`,
încărcată numai de store-ul SQL de test; nu este în runnerul de migrări ERP.
Helper: `server/core/demo-trial-sql-runtime-test-store.js`. Guardurile existente
impun NODE_ENV=test și bază nouă `INFRAFLOW_TEST_TRIALS_<12 hex>`.

Tabelele păstrează starea curentă și receipt-ul fiecărei comenzi. Generația este
un contor int separat de revizia lifecycle și generația lease-ului jobului;
fiecare avans primește și o epocă UUID aleatoare nouă, generată de adaptor, nu
de browser. Nu se păstrează endpointuri, parole, conturi OS sau chei ERP aici.

`advanceRuntimeGeneration` primește trialId, commandId, expectedGeneration și
momentul sintetic. Prima generație cere expectedGeneration=0. Tranzacția ia un
lock pe trial, verifică starea active și termenul, CAS și monotonia timpului,
apoi scrie împreună generația curentă și receipt-ul comenzii. Nu modifică
snapshotul lifecycle, revizia trialului sau outbox-ul existent. Înainte/după
commit există fault injection exclusiv de test.

Aceeași comandă cu același conținut întoarce receipt-ul inițial; conținut diferit
pentru același ID este refuzat. **Receipt-ul vechi NU este starea curentă** și
nu autorizează reactivarea unui runtime sau a unei sesiuni. Citirea curentă se
face separat prin readRuntimeGeneration. Retry-ul istoric nu rescrie epoca.

## Probe

`server/tests/demo-trial-sql-runtime.test.js`: input invalid fără executor SQL;
citire prin adaptor nou; două conexiuni concurente cu un singur câștigător;
trial B neafectat; receipt vechi versus stare nouă; ID reutilizat cu conținut
diferit; rollback înainte de commit; ack pierdut după commit și retry; timp
invers și termen exact refuzate; lifecycle identic înainte/după.

Rulare explicită:

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test server/tests/demo-trial-sql-runtime.test.js
Remove-Item Env:INFRAFLOW_TEST_TRIAL_SQL
```

Creează și păstrează o bază nouă locală de test; nu este comandă pentru VPS.
Executorul PowerShell deschide conexiuni noi; nu se declară restart SQL Server,
crash hardware sau failover al unui serviciu real.

## Limite și următorul prag

Helperul nu este conectat încă la gateway sau registrul volatil al sesiunilor.
Prin urmare, această etapă nu promite invalidare distribuită a tokenurilor ERP.
Momentul și apelantul sunt de test, nu autoritate publică ori ceas de producție.
Nu există job de pornire reală, verificare health, audit operator durabil al
comenzii sau credențiale minime de serviciu. Snapshot restaurat/duplicat necesită
protocol separat; UUID-urile nu certifică securitatea unei restaurări vechi.

Urmează adaptorul de test care citește generația SQL curentă înainte de emiterea
și validarea sesiunilor, inclusiv refuz la indisponibilitatea SQL. Nu se folosește
receipt-ul unei comenzi drept sursă de autoritate curentă. Pilotul public și
izolarea OS rămân neacceptate; fără versiune/arhive/restart în această etapă.

## Rezultate în această etapă

**7/7 probe trecute, zero skip**, inclusiv cele 5 subprobe SQL reale. Bază nouă
locală păstrată pentru inspecție: `INFRAFLOW_TEST_TRIALS_4454D7CD0ED9`.
Separat, regresia rutare/sesiuni/model: **36/36**, zero skip. Nu se declară că
gateway-ul a folosit generația SQL prin aceste două rulări separate.
Audit expuneri: 511 fișiere, zero constatări; sintaxă/diff check trecute.
Nu s-au rerulat Chrome, OS sau întreaga suită ERP; sursa rămâne 2.12.736.

## Extensie: sesiuni de test validate contra stării SQL curente

`server/tests/support/demo-sql-instance-session.js` compune registrul volatil de
sesiuni cu cititorul readRuntimeGeneration. Înregistrarea unui listener citește
generația/epoca înainte și după legarea locală; emiterea sesiunii cere aceeași
generație ca listenerul și recitește SQL înainte să întoarcă tokenul. La schimbare
sau eroare la această recitire, tokenul creat este revocat și nu este întors.

Validarea cere atât sesiunea locală/host/trial/runtime, cât și generația+epoca
curentă din SQL. Nu folosește receipt-ul comenzii, nu acceptă doar contorul și
nu păstrează un fallback pozitiv dacă cititorul SQL eșuează. Tokenurile imposibile
sau ale vecinului sunt refuzate local înaintea citirii SQL. Lipsa rândului SQL
produce refuz; indisponibilitatea/formatul invalid produc eroare, nu acces.

Autorizerul gateway-ului este acum asincron, așteptat înainte de contactarea
runtime-ului și înainte de divulgare. Excepția cititorului este mascată prin
503 fără detalii interne. Înregistrarea locală a serverului și SQL nu formează
o tranzacție distribuită: dacă etapa finală de înregistrare eșuează, controllerul
de test trebuie să reconcilieze/reinițializeze starea locală; nu se declară rollback
atomic al listenerului. Nici verificarea SQL nu este atomică împreună cu socketul.

Probe în `server/tests/demo-sql-instance-session.test.js`: cititor simulat lipsă,
eroare SQL și schimbare de epocă în timpul răspunsului; apoi integrare SQL reală
cu două trialuri/listener-e, token A pe B refuzat, avans SQL care invalidează A
fără afectarea lui B, emitere refuzată pe listenerul vechi, listener nou și token
nou acceptate, indisponibilitate injectată a cititorului fără cache/fallback și
lifecycle neschimbat. Eroarea SQL injectată nu este o oprire reală SQL Server.

Sesiunile/identitatea runtime-urilor sunt încă în memorie și emise de fixture,
nu de auth ERP. Nu există serviciu gateway de producție, TLS, browser real sau
izolare OS validată. Urmează revalidarea trialului/legării și după verificările
SQL asincrone, plus probe de expirare sau schimbare de rută în această fereastră.

Rezultat extensie: **5/5 probe trecute, zero skip**, inclusiv 3 subprobe SQL/HTTP
reale. Baza locală nouă păstrată: `INFRAFLOW_TEST_TRIALS_F9AEECC782A2`.
Separat, regresiile HTTP/rutare/sesiuni/model au trecut **36/36**, zero skip.
Audit expuneri: 513 fișiere, zero constatări; sintaxă/diff check trecute.
Nu s-au rerulat SQL lease/concurență, Chrome, OS sau suitele ERP complete.
Fără restart/deploy, modificări de conturi sau arhive noi; sursa rămâne 2.12.736.

## Extensie: revalidare după așteptarea autorizerului SQL

Gateway-ul de test recitește acum snapshotul de rutare și timpul DUPĂ autorizarea
asincronă inițială, înainte de a contacta runtime-ul. După răspuns, revalidează
ruta, așteaptă autorizarea finală și revalidează din nou ruta/termenul înainte
de a divulga conținutul bufferizat. Rezultatul pozitiv al unei autorizări care
a început înainte de expirare nu este folosit singur pentru livrare.

3 teste noi, dintre care două au câte două subprobe: expirare exactă în citirea
inițială/finală, legare/revizie nevalidă în aceleași momente și lifecycle retras
cu B neafectat. Cititorul SQL din aceste probe este SIMULAT și suspendat asincron;
mutările sunt deterministe, nu depind de viteza unei conexiuni SQL reale.
Nu sunt probe de concurență într-un serviciu public sau de tranzacție distribuită.

Rulare combinată adaptor+sesiuni+gateway+model: **44 probe trecute, 1 SQL opt-in
sărită**, zero eșecuri. Proba SQL reală din etapa precedentă nu a fost rerulată;
nu se reutilizează rezultatul ei ca verificare live a noii ferestre. Audit expuneri:
513 fișiere, zero constatări; sintaxă/diff check trecute. Fără alte mutații SQL/OS.

Limita rămâne explicită: revalidările nu sunt atomice cu scrierea pe socket și
nici cu schimbări distribuite după ultima citire. Nu există încă termen total
pentru citirea snapshotului/autorizerul SQL, în afara timeouturilor executorului;
deadline-ul runtime-ului HTTP nu acoperă acele așteptări. Urmează timeout/anulare
fail-closed pentru control plane lent, inclusiv client deconectat, fără callback
târziu care să pornească o cerere upstream. ERP/Demo/arhive neschimbate.

## Extensie: deadline și anulare la limita gateway-ului

Harness-ul HTTP are termen total configurabil numai server-side (implicit
30000 ms, validat 20–60000 ms), separat de limita runtime de 1500 ms. Snapshotul
și autorizerul sunt așteptate prin aceeași limită per cerere; timeout produce
504 cu cod fix, fără mesaj intern. Deconectarea clientului emite AbortSignal
și închide upstream-ul dacă există. Timerele/listener-ele gateway-ului sunt
curățate la terminare. Callbackurile târzii, inclusiv respingerea unei promisiuni,
sunt consumate fără a relua fluxul sau a iniția o conexiune runtime.

AbortSignal este oferit callbackurilor readSnapshot/authorizeRequest. Acesta
NU este încă propagat de toate adaptoarele până la executorul SQL PowerShell;
o interogare deja pornită poate continua până la propriul timeout. Nu se declară
anulare nativă SQL, zero resurse reținute de un provider necooperant sau limită
de cereri concurente. Codul actual asigură abandonarea rezultatului la gateway,
nu terminarea fizică garantată a operației interne.

`server/tests/demo-gateway-cancellation.test.js`: 7 probe HTTP cu porți controlate
pentru snapshot lent, autorizer inițial/final lent, client închis în snapshot/
autorizare și după conectare, finalizare/respingere târzie. Nu este un test de
întrerupere a SQL Server. Callbackurile sunt simulate, nu trafic către VPS.

Rezultat combinat: **51 probe trecute, 1 SQL opt-in sărită**, zero eșecuri.
Audit expuneri: 514 fișiere, zero constatări; sintaxă/diff check trecute.
SQL real/OS/Chrome nu sunt rerulate. Fără restart, arhive sau schimbare versiune.
Urmează propagarea anulării în adaptorul/executorul SQL de test și verificarea
operațiilor proprii oprite, fără a atinge sesiuni/procese SQL străine.

## Extensie: semnal transmis la executorul SQL de test

Lanțul gateway → adaptor sesiune → readRuntimeGeneration → store → fixture
primește acum AbortSignal ca opțiune separată, nu în payloadul JSON/SQL.
Semnalul deja anulat refuză apelul înainte de spawn. Helperul nou
`server/tests/support/demo-owned-sql-process.js` deține obiectul ChildProcess,
oprește numai acel proces la abort și așteaptă evenimentul close înainte de
respingerea operației. Nu enumeră procese, nu folosește taskkill global și nu
emite SQL KILL. Erorile rămân categorii fixe, fără texte/provider/credențiale.

Proba `demo-sql-process-cancellation.test.js` are **4/4 teste trecute, zero skip**:
pre-abort fără proces, transportul opțiunii, gard runtime normal și SQL real.
În baza locală nouă `INFRAFLOW_TEST_TRIALS_D90A8C171F2F`, lotul lent scrie un marker
de pornire și așteaptă; un observator confirmă markerul înainte de abort.
Procesul asociat se închide; un proces vecin rulează până la rezultat normal.
Markerul deja comis rămâne intenționat: nu se promite anulare instantanee pe
server, rollback al unui batch trimis ori lipsa efectelor deja comise. Nu a fost
verificată dispariția imediată a sesiunii SQL și nu se extrapolează la scrieri.

O probă suplimentară cu cititor simulat verifică semnalul complet prin gateway,
înainte/după runtime. Integrarea SQL/HTTP completă din etapa precedentă nu este
declarată rerulată: fixture-ul ei transmite acum opțiunea, dar proba sa rămâne
opt-in. Nu sunt modificări în executorul SQL ERP de producție.

Urmează limitarea cererilor concurente către control plane-ul de test, astfel
încât cererile lente/anulate să nu pornească procese fără limită. Efectele
ambigue ale comenzilor de scriere rămân separate, tratate prin idempotentă/CAS.

Regresia gateway/sesiuni/model după propagare: **52 probe trecute, 1 SQL opt-in
sărită**, zero eșecuri. Audit expuneri 516 fișiere, zero constatări; sintaxă/diff
check trecute. Nicio modificare de versiune, arhive sau instanțe publice.

## Extensie: limită de procese și coadă mărginită

`server/tests/support/demo-sql-process-pool.js` limitează fixture-ul SQL la 2
procese active și 16 cereri în așteptare implicit. Configurația este server-side,
cu limite validate (1–8 active, 0–64 în coadă). FIFO pentru cererile admise;
depășirea produce synthetic_sql_busy înainte de executare. Anularea în coadă
scoate cererea fără spawn. Pentru o cerere activă, locul rămâne ocupat până când
executorul confirmă close, nu până când gateway-ul abandonează rezultatul.
Erorile sincrone/asincrone eliberează locul. Statusul agregat nu expune secrete.

Aceasta este o limită **per proces Node/modul de test**, nu o cotă distribuită
pe SQL Server, pe trial sau pe toate fișierele pornite de node --test. Coada nu
are un termen propriu: cererile gateway au semnalul deadline-ului, iar operațiile
de setup fără semnal așteaptă procesele active și timeouturile lor. Nu se declară
fairness între companii ori protecție DoS de producție.

5 probe deterministe în demo-sql-process-pool.test.js: limită/FIFO/depășire,
anulare în coadă, loc reținut până la close, erori fără pierdere de loc și input
invalid/pre-abort. Regresia SQL inițială a eșuat în observerul care identifica
procesele printr-o variabilă globală de fază: după introducerea cozii, spawn-ul
nu mai este sincron cu apelul. Observerul folosește acum un processTag de test
capturat pe cerere (fără SQL/parole), nu presupunerea temporală. Verificările
de close/proces vecin nu au fost relaxate.

Rezultate finale: **57 probe trecute, 1 SQL/HTTP opt-in sărită** în pachetul
gateway/sesiuni/pool/model; separat **4/4** probe anulare, inclusiv SQL real,
zero skip. Baza SQL finală păstrată: `INFRAFLOW_TEST_TRIALS_54F4E72A2F1F`;
rularea cu observerul eronat a păstrat `INFRAFLOW_TEST_TRIALS_299DDB121E18`.
Audit expuneri 518 fișiere, zero constatări; sintaxă/diff check trecute.
Nu s-au rerulat Chrome/OS ori întregul flux ERP. Urmează termenul propriu al
așteptării în coadă, inclusiv pentru setup fără semnal de la gateway. Fără
restart, schimbare versiune sau arhive noi.

## Extensie: termen propriu pentru așteptarea în coadă

Pool-ul de test are acum queueTimeoutMs server-side: implicit 10000 ms, validat
între 20 și 60000 ms. Fiecare cerere pusă în coadă are timer și deadline bazat
implicit pe performance.now. Pomparea cozii verifică și ea termenul, astfel
încât un timer amânat de event loop să nu permită pornirea unei cereri expirate.
Expirarea produce synthetic_sql_queue_timeout, scoate cererea și curăță timerul/
listenerul de abort. Nu omoară și nu eliberează prematur procesele deja active.

Termenul este numai pentru așteptare: după admitere, procesul are timeoutul său
și semnalul cererii. Nu se declară timp total maxim SQL server sau anulare a
efectelor deja comise. Ceasul injectat din probe este numai pentru reproductibilitate,
nu configurare aleasă de client. Limita rămâne per proces Node, nu distribuită.

Pool-ul are **9/9 teste trecute** (4 noi: expirare fără semnal extern, termen
verificat de pump înaintea timerului, capacitate eliberată fără afectarea activei,
abort după expirare). Pachet combinat: **61 trecute, 1 SQL/HTTP opt-in sărită**,
zero eșecuri. SQL real/Chrome/OS nu au fost rerulate în această etapă. Audit
expuneri: 518 fișiere, zero constatări; sintaxă/diff check trecute.

Urmează proba HTTP integrată pentru suprasarcină/coadă expirată și recuperarea
serviciului după eliberarea locurilor, fără rezultate întârziate sau afectarea
vecinului. Nu se schimbă versiunea, arhivele ori instanțele publice.

## Extensie: suprasarcină și revenire probate prin HTTP

`server/tests/demo-gateway-overload.test.js` conectează gateway-ul, pool-ul real
de test și două runtime-uri HTTP sintetice. Executorul pool-ului este simulat
cu promisiuni controlate; NU sunt procese SQL reale în aceste probe.

4 teste: activă blocată/coadă plină/expirare cu 503 și revenire A/B; client
deconectat în coadă fără executare; eroare activă care eliberează locul pentru
vecin; maxQueued=0 cu refuz imediat și revenire. Contoarele confirmă că cererile
respinse/anulate/expirate nu ajung la executor/runtime și că eroarea internă nu
este reflectată în răspuns. Cererile folosesc același pool, deci nu este fairness
garantat între companii și nici izolare de capacitate pe trial.

Erorile pool-ului sunt mascate prin 503 gateway_unavailable în harness. Nu există
retry automat, Retry-After sau promisiune comercială pentru acești timpi. Este
verificarea comportamentului local la capacitate limitată, nu benchmark de pilot
sau test de sarcină al SQL Server. Fără mutații SQL/OS în această etapă.

Urmează oprirea controlată a pool-ului: refuz cereri noi, tratarea cozii și
așteptarea confirmării închiderii activelor. Nu se adaugă un serviciu public.

Rezultat: **65 probe trecute, 1 SQL/HTTP opt-in sărită**, zero eșecuri, cu
regresiile locale. Audit expuneri: 519 fișiere, zero constatări; sintaxă/diff
check trecute. Nu s-au rerulat SQL real, OS sau Chrome; arhive/versiune neschimbate.

## Extensie: shutdown explicit al pool-ului de test

createSqlProcessPool oferă acum shutdown idempotent și stările open/closing/
closed. Trecerea în closing refuză cereri noi, respinge coada cu categorie fixă
și curăță timerele/listener-ele aferente. Operațiile deja executate sunt lăsate
să termine; shutdown se rezolvă numai când numărul activ ajunge la zero.
O cerere rezervată dar al cărei executor încă nu a pornit este refuzată înainte
de spawn. Eroarea unei active nu blochează închiderea. Nu există reopen implicit.

5 teste noi în demo-sql-pool-shutdown.test.js: coadă/refuz/așteptare, rezervare
fără execuție, eroare activă, idempotentă și gard runtime, plus proces PowerShell
real care se închide normal fără kill, fără pornirea copilului din coadă.
Nu sunt teste SQL Server și nu se revendică rollback SQL sau oprire de serviciu.

Shutdown nu are un termen de forțare propriu și nu omoară operații active;
executorul real de test are timeoutul lui, iar un executor injectat necooperant
poate ține closing deschis. Nu este SIGTERM/systemd/Windows Service handler,
nu este expus pool-ul implicit al fixture-ului pentru restart automat. Oprirea
întregului gateway trebuie coordonată separat, înainte de închiderea pool-ului.

Urmează proba de oprire coordonată a gateway-ului și pool-ului: fără cereri noi,
fără conectări târzii și fără răspuns autorizat printr-un serviciu în curs de oprire.

Rezultate: 5/5 probe noi de shutdown trecute, inclusiv procesul PowerShell real.
Rerulările combinate serială și paralelă: **70 trecute, 1 SQL/HTTP opt-in sărită**.
O primă rulare paralelă a returnat 503 acolo unde o probă aștepta 200; nu este
declarată cauză stabilită sau remediere, iar rerulările trecute nu ascund acea
observație. Nu s-au relaxat timpii sau asertările. Audit expuneri: 520 fișiere,
zero constatări; sintaxă/diff check trecute. SQL real/Chrome/OS nu sunt rerulate.
Versiune/arhive/servicii instalate neschimbate.

## Extensie: oprire coordonată gateway + pool

`server/tests/support/demo-gateway-pool-lifecycle.js` oprește întâi admisia în
handlerul gateway, apoi pool-ul. Gateway-ul are stări open/closing/closed,
anulează cererile urmărite și închide upstream-urile proprii. Confirmarea sa
așteaptă ieșirea handlerelor și evenimentele close ale upstream-urilor. Pool-ul
refuză coada/noile operații și așteaptă terminarea executorilor activi. Controllerul
confirmă closed numai după ambele, fără reopen implicit.

4 probe în demo-gateway-pool-shutdown.test.js: activă și coadă/noi cereri,
snapshot întârziat fără conectare ulterioară, upstream deja conectat fără livrare
și anulare cu așteptarea close a unui proces PowerShell real propriu. Acesta nu
execută SQL și nu este serviciul ERP. Nu se termină PID-uri/sesiuni străine.

Handlerul HTTP rămâne legat de listener în probă și întoarce 503 gateway_closed
după oprire; controllerul nu închide listenerul TCP de administrare și nu este
handler SIGTERM/systemd/Windows Service. Procesele/runtime-urile sintetice de
destinație sunt închise de cleanup-ul fixture-ului, nu de controller. Callbackurile
externe necooperante, în afara pool-ului, pot continua intern; nu sunt declarate
terminate fizic prin abandonarea rezultatului. Fără deadline de forțare a shutdown.

Urmează regresia extinsă SQL + gateway și actualizarea acceptanței înainte de
alegerea/integrările serviciului real. Nu se publică acest harness ca gateway.

Rezultat serial: **74 probe trecute, 1 SQL/HTTP opt-in sărită**, zero eșecuri;
include 4 probe noi de coordonare și probele cu procese PowerShell reale, nu
SQL real. Audit expuneri 522 fișiere, zero constatări; sintaxă/diff check trecute.
Eșecul intermediar 503/200 din etapa precedentă rămâne documentat, nu remediat
prin această rulare. Fără schimbare versiune, restart/deploy sau pachete noi.
