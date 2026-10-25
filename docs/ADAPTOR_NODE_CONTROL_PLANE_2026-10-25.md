# Adaptor asincron Node/MSSQL — contract exclusiv de test

25 octombrie 2026 · Sursă 2.12.736 · Nu este serviciu public sau adaptor ERP nou.

## Inspecție și alegere

Există server/core/mssql-executor.js, executor copil pentru operațiile istorice
sincrone Linux. Acesta deschide un pool pe invocare și citește configurația ERP
din env. Nu este rescris și nu este reutilizat cu secretele instalării.
Driverul mssql 12.5.4 este deja declarat/instalat. README-ul instalat documentează
pool-uri private, request.input și request.cancel. Nu s-au adăugat dependențe.

Importul mssql/msnodesqlv8 eșuează cu MODULE_NOT_FOUND pentru dependența nativă.
Nu s-a instalat un driver nativ și nu s-au cerut credențialele utilizatorului.
Noul adaptor folosește config explicit pentru SQL authentication strict de test.

## Implementare

`server/core/demo-trial-node-sql-test-executor.js`: NODE_ENV=test, bază numai
INFRAFLOW_TEST_TRIALS_<12 HEX>, login corespunzător INFRAFLOW_TEST_CP_<12 HEX>,
server fix 127.0.0.1 și port explicit. Nu citește DB_*, nu acceptă master/altă bază
și nu folosește pool-ul global sql.connect. Parola există numai în config/memoria
driverului; nu se afișează în erori, loguri ori argumente de procese.

Conectare lazy unică, pool privat max=2 și limiter cu coadă/termen server-side.
JSON parametrizat NVarChar(MAX), opțiuni ANSI ca în executorul existent și
rezultat scalar/JSON reconstruit în format compatibil. Limite input/output.
Abort înainte de query refuzat; abort în query cheamă request.cancel și operația
rămâne activă până la soluționarea promisiunii driverului. Shutdown așteaptă
limiterul și închide pool-ul, fără reopen implicit. Erorile sunt categorii fixe.

Encrypt=true/trustServerCertificate=true este configurația locală de test,
nu politica TLS de producție. Nu se declară rollback al efectelor deja comise.
Conectarea inițială nu are anulare nativă aici: are timeout de 5 secunde și
guard de abort după connect. Query timeout=15 secunde. Nu este garantat un
deadline strict pentru un driver necooperant la cancel sau close.

## Verificări efectuate

`server/tests/demo-node-sql-executor.test.js`: **6/6 probe de contract**, cu driver
simulat, zero skip: config strict înainte de driver, pool privat și parametrizare,
țintă/opțiuni/pre-abort, cancel cu așteptarea confirmării, erori/close și runtime
normal refuzat. Prima versiune a fixture-ului de driver a avut o eroare de sintaxă,
corectată înaintea rulării trecute. Driverul instalat real a fost construit și
închis FĂRĂ connect, fără încercare de autentificare.

Metadata-only prin conexiunea Windows existentă: listener TSQL ONLINE observat
pe portul 61770 (IPv4/IPv6) în instanța locală. Nu s-au modificat protocoale,
firewall sau conturi. Portul este din inventar și trebuie reverificat înainte
de proba reală; nu este o valoare de hardcodat pentru clienți.

## Proba reală următoare — necesită confirmare

O bază nouă strict de test și UN login SQL temporar dedicat, cu parolă generată
în memorie, fără privilegii server. Pentru inițializarea schemei de control plane,
loginul de probă va avea drepturi numai în baza sa nouă (inclusiv DDL necesar
migrărilor); nu este identitatea runtime ERP și nu dovedește minimalitatea
drepturilor unui serviciu de producție. Nu se refolosesc utilizatorul sa, loginuri
ERP, baze vechi sau parole din env.

Setup/cleanup prin conexiunea Windows administrativă existentă, numai pentru
resursele create în acel run și confirmate în manifest. Adaptorul Node face
conexiunea TCP la listenerul local, inițializează schema și probează read/CAS/
anulare/shutdown. Cleanup după pool.close, fără wildcard, KILL sau forțare
SINGLE_USER; dacă rămân resurse, se raportează, nu se extinde ștergerea.

Această etapă NU a creat bază/login și NU a făcut query real prin adaptor.
Pilotul rămâne NO-GO; lipsesc integrarea de autentificare, izolarea OS/țintă,
serviciul și toate celelalte porți din raport. Fără versiune/arhive noi.

## Proba reală autorizată și executată

După confirmarea utilizatorului, `scripts/probe-demo-node-sql.js` a executat
proba locală cu flag explicit `--create-temporary-sql-confirmed` și NODE_ENV=test.
Resurse create: INFRAFLOW_TEST_TRIALS_D44BB28D3359 și loginul
INFRAFLOW_TEST_CP_D44BB28D3359. Parola aleatoare a rămas numai în memoria
proceselor, nu în sursă, argumente CLI sau raport. Login fără rol sysadmin,
db_owner numai în baza nouă pentru inițializarea schemei (nu drepturi minimale
de producție). Niciun credential ERP folosit.

Rezultate, toate trecute:

- Identitate SQL dedicată verificată și cele patru migrări de test inițializate.
- Două avansări concurente cu aceeași generație: un succes, un conflict CAS;
  retry-ul comenzii câștigătoare întoarce aceeași confirmare.
- Cerere WAITFOR anulată prin AbortSignal; eroare așteptată, apoi query nou reușit.
  Anularea a fost cerută după 300 ms; această probă nu folosește marker SQL pentru
  a demonstra momentul exact al începerii WAITFOR sau rollback-ul unui write.
- Shutdown și refuzul executării după închidere.
- Pool închis înainte de cleanup. DROP numai pe numele generate de această
  probă; absența bazei și loginului verificată în SQL. cleanup=true, error=null.

Prima încercare s-a oprit înainte de creare din cauza câmpurilor NULL omise de
FOR JSON. Verificare read-only: nici baza 9CD175CE6E66, nici loginul corespunzător
nu existau. Corectat cu INCLUDE_NULL_VALUES, apoi executată proba de mai sus.

Regresie curentă: 6/6 teste de contract, zero skip. Audit expuneri: 524 fișiere,
zero constatări. Avertisment observat DEP0123 (TLS ServerName cu IP). Conexiunea
locală folosește trustServerCertificate; validarea certificatului/numele DNS
pentru producție rămân nevalidate. Nu s-a schimbat configurația SQL Server.

Urmează compunerea adaptorului cu harness-ul SQL/session/gateway într-o probă
integrată, inclusiv anulare observabilă și oprire ordonată. Rezultatul nu ridică
NO-GO pentru pilotul public și nu justifică instalare/update/arhive.

## Integrare Node SQL + sesiuni + HTTP

Executată ulterior prin același script, extins cu
`server/tests/support/demo-node-gateway-probe.js`. Bază nouă
INFRAFLOW_TEST_TRIALS_0CF8C8691FA6, login INFRAFLOW_TEST_CP_0CF8C8691FA6,
ambele șterse și absența verificată după închiderea pool-ului: cleanup=true.

Cele zece verificări raportate de script au trecut (nu zece teste node:test):
cele patru verificări SQL anterioare plus șase verificări de integrare HTTP:
sesiune validă, token A refuzat pe B înainte de contact, invalidare A după
avansul epocii SQL, B neafectat, eroare SQL injectată fără cache de autorizare
și oprire gateway/pool cu refuzul cererilor ulterioare.

Snapshot-ul registrului este recitit din SQL prin adaptorul Node. Runtime-urile
sunt două servere HTTP sintetice loopback, iar tokenurile sunt emise de fixture,
nu prin autentificarea ERP. Indisponibilitatea SQL este injectată în cititorul
generației, nu prin oprirea SQL Server. Nu se pretinde izolare OS/SQL între două
ERP-uri: cele două trialuri sunt în aceeași bază de control plane de test.

Regresie separată: 15 teste trecute, 1 test SQL opt-in sărit (vechiul fixture
PowerShell), zero eșecuri. Proba Node SQL reală de mai sus a rulat separat și
nu a fost sărită. Audit: 525 fișiere, zero constatări. DEP0123 rămâne observat.

Rămâne de probat anularea SQL observabilă prin marker și deadline la integrare;
readSnapshot folosește store.read fără propagare AbortSignal în această probă.
Urmează contractul executabil al serviciului Linux și configurarea mediului
pilot, nu publicarea harness-ului. Nu există încă serviciu ERP privat complet.

## Deadline gateway propagat până la snapshot SQL

Proba ulterioară folosește store.read({signal}), validat înainte de executor
și reverificat după răspuns. Snapshot-ul lent este injectat în executorul
store-ului: marker autocommit, WAITFOR 10 secunde, marker final și SELECT real
al registrului. Gateway-ul are deadline de 2 secunde în această probă.

Markerul de început a fost observat prin a doua conexiune înainte de deadline.
HTTP a răspuns 504/gateway_request_timeout; executorul a primit signal.aborted
și a respins cu synthetic_sql_aborted. Markerul final era absent; numărul de
contacte runtime A/B a rămas identic. După dezactivarea întârzierii, o cerere
nouă pentru B a reușit. Nu este o garanție de rollback pentru write-uri deja
confirmate și nu dovedește comportamentul unui serviciu public sub sarcină.

Resurse: INFRAFLOW_TEST_TRIALS_060EEC49B754 și
INFRAFLOW_TEST_CP_060EEC49B754. Script: 17 verificări trecute, cleanup=true,
error=null; baza și loginul absente după cleanup verificat SQL. Contracte:
7/7 teste, zero skip. Audit: 526 fișiere, zero constatări. DEP0123 persistă.

Limita locală gateway → store → driver pentru snapshot este acum probată.
Următoarea etapă este serviciul Linux real, cu identități, configurare și
oprire de serviciu; harness-ul rămâne exclusiv test. Mediul pilot separat și
providerul operatorului necesită alegere înainte de deployment. NO-GO public
rămâne până la toate porțile de acceptanță.

## Anulare SQL observabilă — probă încheiată

Rulare ulterioară pe baza nouă INFRAFLOW_TEST_TRIALS_FAFB116F04D0 cu loginul
INFRAFLOW_TEST_CP_FAFB116F04D0: toate cele 14 verificări ale scriptului trecute,
inclusiv integrarea HTTP anterioară. Acestea sunt assertions în script, nu o
suită de 14 teste node:test independente.

Batchul introduce markerul 1 (autocommit), așteaptă 10 secunde și apoi ar
introduce markerul 2. O altă conexiune a pool-ului a observat markerul 1 înainte
de AbortSignal. Anularea s-a finalizat sub pragul de 4 secunde; markerul 2 era
absent, markerul 1 a rămas. O cerere vecină cu WAITFOR 1 secundă a reușit;
pool-ul a acceptat apoi o cerere nouă. Aceasta demonstrează comportamentul
batchului concret, nu rollback general ori anulare instantanee garantată.

Shutdown și cleanup verificate: baza și loginul nu mai există, cleanup=true,
error=null. Testele de contract rerulate: 6/6, zero skip. DEP0123 rămâne deschis.
Propagarea deadline-ului gateway până la citirea snapshot-ului nu este închisă
prin acest rezultat. Urmează delimitarea serviciului Linux real și a mediului
pilot separat; nu se instalează aceste harness-uri ca serviciu public.
