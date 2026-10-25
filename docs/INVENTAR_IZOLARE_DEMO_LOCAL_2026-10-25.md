# Inventar local read-only și plan de probă SQL/OS

25 octombrie 2026 · Sursă InfraFlow 2.12.736.
Scope: laptopul acestei sesiuni; nu VPS, Demo public sau instalație client.
Referințe: `CONTRACT_SERVICIU_DEMO_PRIVAT_2026-10-25.md` și
`PORTI_PILOT_DEMO_PRIVAT_2026-10-25.md`.

## 1. Verificări efectuate fără modificări de configurație

| Element | Rezultat observat |
| --- | --- |
| OS / PowerShell | Windows / PowerShell 7.6.5 |
| Token Windows elevat | Nu |
| Node folosit de sesiune | v24.15.0; diferit de Node 20 declarat în AGENTS.md |
| Serviciu SQL local | MSSQL$SQLEXPRESS, Running |
| Conexiune verificată | `.\SQLEXPRESS`, master, Integrated Security; interogare metadata-only |
| SQL Edition / ProductVersion | Express Edition (64-bit), 16.0.1210.3 |
| Windows-only authentication | 0, deci autentificarea nu este limitată la Windows |
| Rolul SQL al conexiunii curente | sysadmin = 1 |
| Permisiuni SQL raportate | ALTER ANY LOGIN = 1, CREATE ANY DATABASE = 1, IMPERSONATE ANY LOGIN = 1 |
| Contained database authentication | 0; nu a fost activată |
| Unelte găsite | sqlcmd, modul LocalAccounts, icacls, runas |

Aceste rezultate provin din Get-Service, verificarea tokenului procesului,
inventarierea comenzilor și o singură interogare SELECT de proprietăți/permisii.
Nu s-au enumerat numele conturilor sau bazelor ERP, citit parole, creat loginuri,
modificat configurația SQL, schimbat ACL-uri ori repornit servicii.

## 2. Concluzii și limite

1. Este posibilă pregătirea unei probe locale SQL cu conexiuni autentificate
   separat, fără activarea autentificării contained și fără schimbarea modului
   de autentificare al instanței. Proba în sine NU a fost încă executată.
2. Conexiunea administrativă actuală nu este dovadă de izolare. Trebuie folosită
   numai la setup/cleanup; operațiile negative/pozitive se execută prin conexiuni
   noi cu loginuri de test restrânse. EXECUTE AS nu înlocuiește proba de login real.
3. Nu s-a probat dreptul de creare a conturilor OS ori rularea sub acestea.
   Modulul LocalAccounts și icacls prezente nu acordă elevare. Testele OS nu sunt
   declarate trecute și nu se substituie prin două procese ale aceluiași utilizator.
4. Node 24 este runtime-ul observat, nu confirmare pentru runtime-ul Node 20
   declarat. Închiderea porților de deployment cere verificare pe runtime-ul ales;
   acest inventar nu schimbă versiunea suportată sau dependențele proiectului.

## 3. Plan exact pentru următoarea probă SQL — cere confirmare înainte de setup

Resurse generate exclusiv pentru probă, cu un singur runId aleator hex de 12
caractere și prefix nou, distinct de instalațiile ERP existente:

- baze: `INFRAFLOW_TEST_ISO_<runId>_A`, `_B`, `_CP`;
- loginuri: `INFRAFLOW_TEST_ISO_<runId>_A`, `_B`;
- utilizatorul fiecărui login este mapat numai în baza proprie;
- canar minim separat în A/B/CP, nu schema ERP și nu copie de date client;
- parole aleatoare doar în memoria procesului și transport protejat al fixture-ului,
  fără argv, log, artefact, fișier env sau raport.

Setup-ul creează numai aceste resurse noi. Loginurile A/B nu primesc roluri de
server, db_owner sau drepturi de administrare; permisiunile necesare canarului
sunt limitate la baza proprie. Nu se modifică guest, public sau alte roluri
globale/existente. Refuzăm coliziunea cu orice resursă existentă, fără reutilizare.

Probe sub login real A și B, prin conexiuni distincte:

1. Citire și scriere canar propriu reușesc; loginul greșit/parola greșită e refuzat.
2. Citire/scriere canar vecin și CP, cu numele complet al bazei, sunt refuzate.
3. Interogarea drepturilor efective confirmă lipsa privilegiilor administrative.
   Nu încercăm CREATE LOGIN/CREATE DATABASE în proba negativă: dacă izolarea ar
   fi defectă, chiar testul ar produce mutații nedorite.
4. Canarii vecini și CP sunt comparați înainte/după; probele nu expun parolele.

Guarduri înainte de orice mutație: opt-in nou și distinct de
INFRAFLOW_TEST_TRIAL_SQL, țintă locală fixă, runId/prefix strict, manifestul exact
al resurselor create și refuzul conexiunilor/configurațiilor ERP din env. Raportul
distinge o probă refuzată pentru lipsa drepturilor de o izolare demonstrată.

### Cleanup planificat, nu executat acum

Se închid toate conexiunile de test. Cleanup-ul privește numai resursele pe care
manifestul acestui run confirmă că le-a creat; niciodată enumerate doar prin prefix.
Nu se folosește wildcard pentru DROP, nu se omoară sesiuni străine și nu se schimbă
starea unei baze existente. La rezultat ambiguu/cleanup eșuat, se raportează resursele
rămase pentru inspecție, fără ștergere mai largă. Confirmarea setup-ului trebuie să
includă și cleanup-ul strict al acestor resurse temporare.

## 4. Proba OS este separată

Necesită context dedicat autorizat cu drepturile necesare, două identități OS
reale și directoare/chei sintetice. Planul exact de creare, logon, ACL și cleanup
se validează înainte de execuție. Nu se cere parola utilizatorului, nu se încearcă
elevare automată și nu se modifică ACL-urile instalării InfraFlow existente.

Proba SQL nu închide poarta OS, gateway, restaurare, egress sau mediul Linux.
Pentru Linux va fi necesară dovadă pe mediul respectiv, nu extrapolare de la laptop.

## 5. Stare finală

Inventarul este închis; probele SQL/OS distincte sunt încă neexecutate.
Următorul pas poate fi fixture-ul SQL după confirmarea creării/curățării resurselor
de la secțiunea 3. Nu există update, arhivă nouă, restart ori activare de pilot.

## 6. Proba SQL executată după confirmare

Implementare: `server/tests/demo-sql-isolation.test.js`, opt-in distinct
`INFRAFLOW_TEST_SQL_ISOLATION=1`, local Windows/SQL Express fix. Mediu copil minim,
parole efemere în memorie/env copil, fără argv/log/artefact. Loginurile runtime
folosesc SQL authentication, pooling dezactivat și ORIGINAL_LOGIN verificat.

Rezultat final: **1 test integrat trecut, zero skip**. În interior: 4 probe proprii
(citire și insert/update/delete în A/B), 8 refuzuri SELECT/UPDATE între A/B și CP
(916/229), 2 verificări lipsă privilegii server și 2 parole greșite refuzate (18456).
Canarii A/B/CP au rămas neschimbați. Cleanup baze/loginuri creat efectiv confirmat
în cataloage, fără wildcard, SINGLE_USER ori terminare de sesiuni străine.

Primele trei rulări au eșuat la construirea conexiunii runtime, înaintea probelor
de izolare; cleanup confirmat la fiecare rulare. Diagnosticul ArgumentException a
fost corectat folosind indexerele cu chei canonice ale SqlConnectionStringBuilder,
fără relaxarea drepturilor. Rularea corectată și cea finală extinsă au trecut.
RunId-uri create/curățate: `2E2221E97405`, `1E83DF3FCB30`, `B26D88140E8D`,
`1588A261FDD3`, `96C98E7C79D9`; nu sunt cinci teste finale trecute.

Manifestul cleanup este în memoria copilului, nu crash-safe. Timeout/rezultat
ambiguu cere inspecție exact pe runId, nu cleanup global. Aceasta este proba unor
canari minimali, nu a schemei ERP. Audit expuneri: 503 fișiere, zero constatări;
sintaxă/diff check trecute. Celelalte suite SQL/ERP/Chrome nu sunt rerulate.
Proba OS și mediul Linux rămân nevalidate. Urmează planul OS/ACL într-un context
autorizat, fără elevare automată. Versiunea și arhivele rămân neschimbate.
