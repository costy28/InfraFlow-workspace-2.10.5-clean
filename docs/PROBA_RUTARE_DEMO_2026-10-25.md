# Rutare Demo — decizie fail-closed în test

25 octombrie 2026 · Sursă 2.12.736 · Nu este reverse proxy de producție.

## Implementare

`scripts/lib/demo-gateway-route.js` rezolvă hostname → trial → runtimeKey numai
din snapshotul registrului și legările de rutare furnizate de serviciu. Nu
primește port, bază, URL sau cale de runtime de la client și nu deschide sockets,
DNS, procese sau conexiuni SQL. Funcția cere NODE_ENV=test și întoarce explicit
executionAllowed=false/productionReady=false.

Hostname ASCII strict, normalizat lowercase; fără port, trailing dot, userinfo,
cale sau whitespace. Legare unică pe host/trial, runtimeKey identic cu resursa
trialului și revizie egală cu registrul. Legare duplicată/nevalidă ori revizie
veche blochează rezolvarea; nu există fallback spre un Demo comun.

Acces numai pentru starea active, de la activatedAt inclusiv până înainte de
expiresAt. Termenul este verificat din ceasul serviciului, chiar dacă lifecycle-ul
nu a schimbat încă starea active în expired. Toate celelalte stări sunt refuzate.
Acest resolver nu oferă încă fluxul de invitație/activare: acela necesită contract
separat, nu acces general pentru awaiting_activation.

`server/tests/support/demo-gateway-route-harness.js` expune numai GET /route-probe
pe loopback/port efemer în teste. Returnează decizia JSON, **nu transmite trafic**
la runtime. Cere exact un Host; refuză Host duplicat, Forwarded/X-Forwarded-* și
orice query/selector. În caz de registru/legare indisponibilă produce 503, iar
necunoscut/expirat produce același 404. Nu expune erorile interne. Fără endpoint
montat în app.js, serviciu instalat sau schimbare DNS/Cloudflare.

## Probe și limite

`server/tests/demo-gateway-route.test.js`: 7 probe, cu host A/B distinct, expirare
exactă, host necunoscut, stări neactive, legări greșite/duplicate/vechi, selectors,
antete forward spoofing, Host duplicat prin HTTP real și eroare de snapshot.
Registrul nu este modificat de rezolvare. Regresia modelului trial: alte 7 probe.

Rulare: `node --test server/tests/demo-gateway-route.test.js server/tests/demo-trial-registry.test.js`

Rezultat: **14/14 probe trecute, zero skip**. Audit expuneri: 505 fișiere,
zero constatări; diff check trecut. SQL, Chrome, ACL Windows și ERP complet nu
sunt declarate rerulate prin aceste probe.

Nu validează proxy real, TLS, DNS, SNI, WebSocket, upload/download, cookie/sesiune
cross-instance ori izolarea rețelei. Host este intrare de rutare, nu identitate
autentificată a utilizatorului. Snapshotul este de test, fără garanție de refresh
distribuit sau revocare atomică pe durata unui stream. Antetele forwarded sunt
refuzate în harness, nu configurate pentru un reverse proxy de încredere real.

Următorul increment: legarea deciziei de două runtime-uri HTTP sintetice distincte,
cu destinații definite server-side și refuz înainte de conectare pentru host sau
stare neeligibilă. Nu se folosește o adresă de destinație din cererea clientului.
Pilotul public rămâne NO-GO; versiunea/arhivele și instanțele instalate sunt neatinse.

## Extensie: două destinații HTTP sintetice

`server/tests/support/demo-gateway-http-harness.js` și
`server/tests/demo-gateway-http.test.js` leagă decizia de două listener-e HTTP
distincte pe loopback/port efemer. Sunt servere Node în același proces de test,
NU două procese ERP sau o probă de izolare OS.

Destinațiile sunt obiecte http.Server înregistrate de fixture, nu URL/port din
cerere. Ruta acceptată este numai GET /synthetic-probe, iar runtime-ul primește
numai /runtime-probe și antetul Accept fix. Cookie/Authorization/client headers
nu sunt propagate; răspunsurile nu propagă Set-Cookie sau Location. Aceasta NU
este implementarea autentificării sau a cookie-urilor reale ERP.

Răspunsul este JSON sintetic whitelist, limitat la 4096 octeți, cu termen total
de 1500 ms și timeout socket. Nu urmează redirecturi. Identitatea trialului din
răspuns trebuie să corespundă deciziei; legarea deliberat greșită este detectată
după contactarea destinației sintetice, nu prevenită printr-un transport autentificat.
De aceea nu se declară securizarea traficului către un runtime compromis.

După citire sunt reverificate registrul, legarea/revizia și expirarea înainte
de divulgarea răspunsului bufferizat. Trial necunoscut/expirat este refuzat înainte
de conectare; runtime oprit/lent nu folosește B ca fallback. Nu este streaming,
WebSocket, upload/download sau garanție de revocare atomică după ultimul check.

O primă rulare a identificat o eroare în restaurarea NODE_ENV în fixture la
două instanțieri în același test. Subprobele au acum cleanup separat, iar proba
production fixează explicit mediul și îl restaurează; gardul nu a fost relaxat.

Următorul increment: sesiuni sintetice legate de instanță și refuzul reutilizării
pe vecin în aceeași probă HTTP, fără importarea sesiunilor ERP reale ori acces
la serviciul public. Proba OS rămâne blocată de ExecutionPolicy, explicit.

Rezultat final al extensiei: **25/25 probe trecute, zero skip** (include regresia
resolverului/modelului și subprobele redirect/limită). Audit expuneri: 507 fișiere,
zero constatări; sintaxă/diff check trecute. Nu s-au rerulat SQL/Chrome sau probe
ACL, nu s-au creat conturi și nu există restart/deploy ori arhive noi.

## Extensie: sesiuni sintetice legate de instanță

`server/tests/support/demo-instance-session.js` adaugă un registru volatil de
sesiuni de test, cu tokenuri aleatoare de 32 octeți, numai hash SHA-256 stocat,
termen maxim 15 minute și revocare. Legarea include host normalizat, trialId și
runtimeKey. Emiterea este out-of-band din fixture, NU autentificare de utilizator.
Nu există login HTTP, emitere de cookie sau persistență după restart.

`createDemoGatewaySessionHarness` cere obligatoriu adaptorul de sesiuni și nu
acceptă suprascrierea autorizerului. Folosește mecanismul before/after al probei
HTTP; vechiul harness fără autorizer rămâne numai fixture-ul de rutare neautentificată,
nu o alternativă permisivă pentru sesiuni reale. Refuză cererile fără cookie-ul
sintetic exact demo_probe_session, cookie duplicat/ambiguu și încercarea de a
substitui Authorization. Cookie-ul nu este propagat la runtime și nu apare în
JSON sau antete de răspuns. Nu sunt implementate atributele browser Secure,
HttpOnly, SameSite sau protecțiile CSRF ale unei autentificări de producție.

Probele verifică A→A și B→B, A→B/B→A refuzat înainte de conectare, token fals,
termen exact, revocare fără afectarea vecinului și revocare/expirare în timpul
răspunsului. Gateway-ul verifică din nou sesiunea înainte de divulgare. Nu se
promite atomicitate între ultimul check și socket sau securizarea unui runtime
care poate fi contactat direct ocolind gateway-ul.

Fișier probe: `server/tests/demo-instance-session.test.js` (6 teste). Acestea
folosesc două listener-e sintetice în același proces, nu ERP cu auth originală.
SQL, TLS, browser real și poarta OS nu sunt validate prin tokenurile de test.
Următorul increment: invalidare controlată a sesiunilor la reluarea/reînlocuirea
runtime-ului, cu generație de instanță și probe negative după restart, înainte
de legarea la autentificarea reală ERP. Nu se inventează login ori provider nou.

Rezultat final pentru extensia de sesiuni și regresii: **31/31 probe trecute,
zero skip**. Audit expuneri 509 fișiere, zero constatări; sintaxă/diff check
trecute. SQL/OS/Chrome și suitele ERP complete nu au fost rerulate. Fără conturi
noi, deployment, restart, schimbare versiune sau arhive Windows/Linux.

## Extensie: generație de runtime și invalidare după înlocuire

Registrul de sesiuni de test cere acum înregistrarea unui listener nou prin
replaceRuntime, cu CAS pe generația așteptată. Generația este UUID aleator
generat de adaptor, nu primită din cookie/browser. Sesiunile sunt legate și de
această generație. Un listener deja văzut nu poate fi reînregistrat în același
registru; evenimentul close îl marchează retras definitiv, chiar dacă același
obiect server este redeschis pe același port. O nouă sesiune nu poate fi emisă
pentru listenerul retras/oprit.

Gateway-ul trece autorizerului identitatea obiectului server ales pentru cerere.
Înlocuirea registrului fără reconfigurarea gateway-ului refuză inclusiv tokenul
nou pe gateway-ul rămas cu ținta veche. Revalidarea după răspuns împiedică
divulgarea rezultatului vechi când generația se schimbă în timpul citirii.

5 probe noi: A înlocuit/B neafectat; CAS vechi și rollback la listener vechi;
înlocuire în timpul răspunsului; close/relisten pe același port; reinițializarea
registrului de sesiuni nu acceptă tokenurile vechi. Acolo unde se schimbă ținta,
fixture-ul pornește un nou listener și reconfigurează gateway-ul de test. Proba
reinițializării registrului construiește un obiect nou în același proces, NU
repornire OS/daemon sau test de persistență SQL.

Rezultat: **36/36 probe trecute, zero skip**, cu regresiile HTTP/resolver/model.
Audit expuneri: 509 fișiere, zero constatări; sintaxă/diff check trecute. Nu s-au
rerulat SQL, OS, Chrome ori autentificarea ERP. Generațiile/sesiunile rămân
volatile; nu sunt în registrul SQL și nu se coordonează între servicii multiple.
Nu există modificare în versiunea 2.12.736, arhive sau instanțe instalate.

Urmează contractul de persistență/coordonare al generației în control plane,
separat de revizia lifecycle și generația lease-ului unui job, înainte de a lega
această autoritate de un serviciu real. O generație volatilă din fixture nu este
dovadă de protecție după restaurarea/copierea unui registry de producție.
