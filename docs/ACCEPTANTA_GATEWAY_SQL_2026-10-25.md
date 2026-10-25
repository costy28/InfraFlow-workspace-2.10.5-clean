# Acceptanță locală — gateway, sesiuni și executor SQL de test

25 octombrie 2026 · Sursă 2.12.736 · HEAD observat la începutul verificării:
`fb8776f3`, cu modificările locale ale prototipului. Nu descrie o instalație VPS.

## 1. Verdict de publicare

**Pilot public: NO-GO. Continuarea dezvoltării izolate: permisă.**

Acest raport consolidează componentele de test, nu transformă fișierele din
server/tests/support într-un serviciu livrabil. Nu autorizează deployment,
restart, creare de conturi reale, schimbare ACL/ExecutionPolicy sau ștergere.

## 2. Scope-ul regresiei extinse

Rulare serială Node --test, INFRAFLOW_TEST_TRIAL_SQL=1, pe SQL Express local.
Sunt incluse următoarele 12 fișiere de test (subprobe incluse în totalul runnerului):

- demo-gateway-pool-shutdown.test.js;
- demo-sql-pool-shutdown.test.js;
- demo-gateway-overload.test.js;
- demo-sql-process-pool.test.js;
- demo-gateway-cancellation.test.js;
- demo-sql-process-cancellation.test.js;
- demo-sql-instance-session.test.js;
- demo-trial-sql-runtime.test.js;
- demo-instance-session.test.js;
- demo-gateway-http.test.js;
- demo-gateway-route.test.js;
- demo-trial-registry.test.js.

Toate sunt în server/tests. Flagul SQL creează baze noi strict de test, păstrate
pentru inspecție; nu este comanda de folosit pe VPS sau în baza ERP existentă.
Nu sunt incluse întreaga suită contabilă/HR, UI Chrome sau toate joburile SQL.
Detaliile etapelor: [Generații SQL](GENERATII_RUNTIME_SQL_2026-10-25.md) și
[Rutare](PROBA_RUTARE_DEMO_2026-10-25.md).

## 3. Ce probează componentele și limitele lor

| Domeniu | Scope verificat de suită | Ce NU rezultă |
| --- | --- | --- |
| Generație SQL | CAS, epocă nouă, receipt idempotent, rollback/ack injectate, B neafectat | Restart SQL Server, restaurare sigură a unui registry vechi sau autoritate de producție |
| Sesiuni + SQL | Citire curentă a epocii, token vechi refuzat, listener nou, izolare A/B | Auth ERP, login real, MFA, cookie browser sau sesiuni persistente |
| Rutare HTTP | Servere loopback distincte, host/termen/legare/refuz și revalidări | Procese ERP distincte, TLS/DNS/Cloudflare, streaming/download sau transport runtime autentificat |
| Anulare SQL | Semnal până la procesul PowerShell deținut, close și vecin neafectat | Rollback al efectelor comise sau dispariția instantanee a lotului SQL de pe server |
| Suprasarcină | Pool/coadă/deadline și HTTP cu executor simulat | Benchmark SQL, limită distribuită sau fairness pe companie |
| Oprire | Admisie/refuz/anulare, așteptare close, procese proprii | SIGTERM/systemd/Windows Service și oprirea unui ERP instalat |

Indisponibilitatea cititorului SQL din proba sesiunilor este injectată, nu
oprirea SQL Server. Schimbările în autorizarea asincronă sunt deterministe,
cu cititor simulat. Revalidările nu sunt tranzacție atomică împreună cu socketul.

## 4. Blocaje care rămân active

1. Serviciu separat și identități reale operator/worker/runtime, nu fixture-uri;
   alegerea providerului de autentificare înainte de login/MFA real.
2. Izolare runtime SQL/OS pe mediul țintă. Proba canarilor SQL cu loginuri A/B
   este istoric separată, nu reexecutată de această suită. Proba OS Windows a
   fost blocată de politica de scripturi; profilele/directoarele restante au fost
   curățate conform rezultatelor utilizatorului. Nu o marcăm trecută și nu ocolim politica.
3. Autentificare ERP și fișiere reale între instanțe, secrete/backup/restaurare,
   blocarea efectelor externe și gateway care nu poate fi ocolit direct.
4. Politică explicită de retenție și ștergere, măsurători pe mediul pilot,
   monitorizare și rollback. Valabilitatea de 15 zile nu este termen implicit
   de ștergere a backupurilor.
5. Alinierea runtime-ului declarat cu cel de validare: proiectul declară Node 20,
   iar sesiunea locală a fost observată pe Node 24.15.0. Nu se presupune echivalență.

Observațiile intermitente Windows/Node și 503/200 din istoricul probelor rămân
documentate; o rerulare reușită nu dovedește cauza sau remedierea lor.

## 5. Limita livrării

Nu există update instalabil prin această etapă. Versiunea, pachetele Windows/
Linux, Demo-ul public, conturile existente și serviciile instalate nu sunt
modificate. [Porțile pilot](PORTI_PILOT_DEMO_PRIVAT_2026-10-25.md) rămân autoritatea
de scope pentru continuare, nu o aprobare implicită de activare.

## 6. Rezultatul rerulării extinse

**89/89 probe trecute, zero eșecuri, zero skip**, în aceeași rulare serială a
celor 12 fișiere, cu SQL opt-in activ. Durată raportată de runner: 288,2 secunde.
Numărul include subprobe; nu reprezintă 89 fluxuri ERP complete.

Baze noi locale păstrate pentru inspecție:

- `INFRAFLOW_TEST_TRIALS_9E1101719F72` — sesiuni SQL + HTTP;
- `INFRAFLOW_TEST_TRIALS_832995B9159D` — anulare executor;
- `INFRAFLOW_TEST_TRIALS_0B634F6D1E1C` — generații/CAS/idempotentă/rollback.

Audit expuneri: 522 fișiere, zero constatări. Sintaxa celor 12 fișiere și
git diff --check au trecut. Verificarea proceselor după rulare a găsit zero
procese Node de test și zero helperi SQL PowerShell potriviți filtrelor fixture-ului;
aceasta nu afirmă că toate sesiunile SQL server-side au fost inventariate.

Nicio probă din această rulare nu a sărit din lipsa flagului SQL. Nu se adaugă
rezultatele etapelor istorice la acest total. Această etapă a făcut validare și
documentare, nu implementare/deployment nou. Observațiile intermitente anterioare
nu s-au reprodus în rularea serială, dar nu sunt declarate rezolvate.

## 7. Următorul increment

Fundația locală gateway/sesiuni/executor poate continua către un adaptor de
control plane Node/MSSQL verificat separat, fără dependență de lansarea unui
proces PowerShell pentru fiecare interogare. Reutilizarea driverului existent
nu înseamnă montarea fixture-ului în app.js sau folosirea credențialelor ERP.
Mai întâi se inspectează adaptorul Node existent și se stabilește contractul de
conexiune/pool/anulare pe o bază nouă strict de test. Providerul de autentificare,
mediul pilot și izolarea OS rămân decizii/porți separate, înainte de publicare.
