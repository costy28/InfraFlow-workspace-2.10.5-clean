# Contract intern de preluare temporară a jobului

Stare: parser și migrare SQL 007 implementate local, fără montare HTTP sau worker.
Migrarea nu este aplicată pe VPS și nu acordă niciun drept de execuție.

1. `claim`: jobId, expectedJobRevision, leaseToken.
2. `verify`: jobId, generation, leaseToken.
3. `renew` / `release`: jobId, generation, expectedJobRevision, leaseToken.

Tokenul trebuie generat criptografic de worker (32 bytes, hex lowercase), nu de browser.
Nu se jurnalizează tokenul sau comanda integrală. Erorile parserului sunt generice.
Identitatea proprietarului nu vine din comandă, ci din principalul SQL autentificat.

## Implementare SQL locală

`007_provision_leases.sql` adaugă procedura internă `platform.provision_lease_command`
cu operația separată de JSON și tabelul de audit `platform.provision_lease_events`.
Verificarea folosește principalul bazei (`USER_NAME()`), iar auditul păstrează
separat loginul tehnic original. Nu folosește `EXECUTE AS OWNER`.

- Ceas SQL UTC, durată fixă 60 secunde; termenul nu vine din payload.
- Preluare atomică cu verificarea reviziei și creșterea generației.
- Numai hash-ul tokenului persistat; audit atomic fără token.
- Refuz pentru termen expirat, proprietar diferit, generație/revizie veche.
- Repetarea aceleiași preluări confirmate nu prelungește termenul.
- Eliberarea nu înseamnă finalizare și nu activează trial-ul.
- Proba `scripts/probe-demo-provision-leases.cjs` folosește exclusiv o bază
  sintetică nouă și utilizatori de bază WITHOUT LOGIN. Nu creează loginuri server.

Cele 77 de teste Node ale platformei trec. Proba SQL a trecut toate cele 8 grupuri
de verificări (inclusiv cele 6 din rezervări): `passed=true`, `cleanup=true`.
Baza sintetică `INFRAFLOW_TEST_TRIALS_6402C032402A` a fost eliminată confirmat.
Au fost verificate concurența cu un singur câștigător, repetarea fără prelungire,
CAS la reînnoire, alt principal/token refuzat, expirarea, noua generație,
rollback la audit și eliberarea cu execuția rămasă închisă.
Aceasta nu dovedește izolarea OS sau a loginurilor SQL reale ale viitoarelor instanțe.

## Adaptor Node pentru comenzi

`server/demo-platform/provision-lease-client.js` oferă un port de transport injectat,
fără conexiune SQL implicită, credențiale, timer, rută HTTP sau operații OS.
Acceptă doar RPC-ul fix `platform.provision_lease_command`, cu parametrii separați
`operation` și `json`; implementarea transportului va trebui să îi lege ca parametri SQL.

- O singură cerere în zbor, fără coadă și fără retry automat.
- Payload validat și copiat înainte de transport.
- Răspunsul trebuie să corespundă jobului, generației și reviziei așteptate;
  orice permisiune de execuție diferită de `false` este refuzată.
- Timeout/eroare/răspuns invalid înseamnă rezultat neconfirmat, nu „nicio scriere”.
- Shutdown așteaptă cererea în zbor și refuză rezultatul sosit după închidere.
- Nu închide transportul injectat: acesta rămâne în responsabilitatea runtime-ului.

## Transport SQL dedicat (local, nemontat)

`provision-lease-sql.js` implementează portul cu driverul MSSQL și țintă fixă:
127.0.0.1:1433, INFRAFLOW_DEMO_PLATFORM, login/user `infraflow_demo_lease`.
Acest login NU a fost creat. Parola nu are fallback și nu este preluată din ERP.

Înaintea fiecărui RPC verifică identitatea, drepturile efective server/bază,
refuzul accesului la baza ERP demo și drepturile pe obiectele vizibile din cele
două scheme private. Acceptă numai EXECUTE pe procedura de lease.
Verificarea metadatelor nu înlocuiește auditul administrativ și probele negative
cu login real; vizibilitatea metadatelor depinde de drepturile SQL.

Transportul leagă separat parametrii `operation` și `json`, are pool maxim 1,
timeout-uri finite, fără coadă/retry și erori generice. `check()` nu execută
comenzi de lease. `shutdown()` așteaptă cererea și închide pool-ul propriu.

Testele transportului folosesc driver simulat. Rămân obligatorii proba cu driver
real, crearea controlată a loginului cu drepturi minime și integrarea credențialei
systemd. Nicio activare în serviciul platformei în această etapă.

## Probă driver nativ local

`scripts/probe-demo-lease-driver.cjs` cere explicit `NODE_ENV=test` și
`--temporary-db-confirmed`. Creează numai o bază sintetică cu prefixul
INFRAFLOW_TEST_TRIALS și un login aleator INFRAFLOW_TEST_LEASE. Parola aleatoare
nu se afișează și nu se salvează în fișiere. Loginul primește numai EXECUTE pe
procedura lease, cu refuz SELECT/DML pe schemele private, fără db_owner.

Se verifică prin driverul MSSQL real identitatea, refuzul accesului direct și al
altor comenzi, apoi adaptorul Node execută claim/replay/verify/renew/release.
Portul local al SQL Express este descoperit de fixture; nu este o opțiune de
configurare adăugată transportului de producție cu țintă fixă.

La final se închid clientul și pool-ul, se elimină loginul temporar și se confirmă
absența lui, apoi fixture-ul elimină baza temporară. Rezultatul acestei probe nu
certifică identitatea fixă infraflow_demo_lease de pe VPS, încă necreată.

Rezultat local confirmat: 9 grupuri trecute, `passed=true`, `cleanup=true`.
Baza `INFRAFLOW_TEST_TRIALS_E8819E7C49D9` și loginul ei temporar au fost eliminate.
Cele 86 de teste Node trec; auditul de expunere fișiere raportează zero constatări.
Driverul a emis avertismentul DEP0123 pentru TLS ServerName cu adresă IP; conexiunea
a reușit, dar avertismentul nu este considerat remediat de această probă.

## Runtime credențială protejată (pregătit local)

`provision-lease-runtime.js` compune transportul și adaptorul. Citește exclusiv
`lease-sql-password` din una dintre cele două unități viitoare:
`infraflow-demo-lease-worker.service` sau `infraflow-demo-lease-check.service`.
Nu reutilizează directorul de credențiale al ERP/operatorului și nu are fallback env.

Deschiderea refuză symlink-ul final și fișierele speciale; se verifică descriptorul
deschis: fișier regulat, un singur link, 16–128 bytes ASCII imprimabili, fără newline.
Sunt acceptate numai metadatele systemd root:root 0440 sau fișier service-owned 0400,
fără biți speciali. Bufferul temporar se suprascrie inclusiv la eșec. Șirul transmis
driverului nu poate fi garantat șters din memoria JavaScript; nu se promite zeroizare
integrală a memoriei procesului.

La pornire se verifică numai identitatea/drepturile; nu se preia niciun job.
`lease-systemd-probe.js` este o probă one-shot Linux/non-root cu mesaje generice,
fără argumente sau comenzi de lease. Nu este instalată și nu a fost rulată în
systemd real. Lipsesc în continuare loginul dedicat, credențiala și unitatea VPS.
Testele locale pentru runtime folosesc cititor și transport injectate; ele nu
dovedesc metadatele/ACL dintr-o instalare systemd reală.

## Configurare controlată a drepturilor (script pregătit)

`scripts/linux/restrict-demo-platform-lease.sql` cere baza platformei, migrarea 007
și un login SQL activ deja mapat corect la userul dedicat. Refuză apartenențe
explicite la roluri și proprietăți asupra bazelor, schemelor sau obiectelor, precum
și drepturi server/bază mai largi decât lista permisă. Nu creează login/user,
nu schimbă parola și nu „repară” automat un cont cu drepturi excesive.

Într-o tranzacție refuză SELECT/DML pe schemele private și EXECUTE pe celelalte
proceduri private existente, apoi acordă exclusiv procedura lease. Verifică efectiv
drepturile sub identitatea userului înainte de commit. La eșec revine din
impersonare și anulează tranzacția. Obiectele viitoare necesită reverificare;
scriptul nu este o politică automată pentru proceduri adăugate ulterior.

Scriptul nu este aplicat pe VPS. Crearea loginului și instalarea credențialei
necesită încă pași separați, cu verificarea absenței/conflictelor înainte de scrieri.

Verificare locală a scriptului: aplicare și reaplicare prin SQL real reușite;
proba completă a trecut 10 grupuri, `passed=true`, `cleanup=true`.
Baza `INFRAFLOW_TEST_TRIALS_040A9E7D7528` și loginul temporar au fost eliminate.
92 de teste Node trecute, audit fișiere fără constatări. Avertismentul TLS DEP0123
rămâne prezent; nicio probă systemd/VPS nouă nu este presupusă din aceste rezultate.

## Creare login dedicat (script pregătit, neexecutat)

`scripts/linux/create-demo-platform-lease-login.py` cere Linux, terminal interactiv
și `--create-confirmed`. Cere parola SA și o parolă nouă distinctă (confirmată de
două ori) prin prompt ascuns, nu prin argumente. Nu presupune parola operatorului.

Preflight-ul cere migrarea 007, acces administrativ și absența loginului/userului.
Crearea loginului, userului și aplicarea scriptului de drepturi sunt în aceeași
tranzacție SQL. Verificarea ulterioară se conectează nativ cu noul login și citește
doar metadate; nu preia joburi, nu consumă TOTP, nu instalează fișiere de credentială.
La rezultat neconfirmat nu reia și nu șterge automat. Parolele sunt transmise către
sqlcmd prin mediu/stdin, nu argv, iar stdout/stderr sunt capturate fără afișare brută.
Aceasta nu ascunde secretele de administratorul OS; scriptul trebuie rulat într-un
mediu administrativ de încredere.

Cele 4 teste Python pure au trecut (generare SQL, escaping, transport, erori fără
retry). Crearea completă prin acest script Python și verificarea ei pe Linux nu
au fost încă executate. Probele SQL native anterioare au testat separat granturile
și comportamentul lease, nu sunt prezentate drept validarea integrală a installerului.

Parserul nu confirmă existența jobului, nu acordă drepturi și nu dovedește exclusivitate.
O verificare punctuală nu garantează fencing pentru efecte externe: adaptorul privilegiat
trebuie să revalideze la limita operației. `execution_ready=0` rămâne obligatoriu.
Nicio modificare VPS, nicio instanță sau bază de date client creată în această etapă.
