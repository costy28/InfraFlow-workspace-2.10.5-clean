# Contract propus — serviciul Demo privat și izolarea resurselor

25 octombrie 2026 · Sursă 2.12.736 · Proiectare, nu implementare sau autorizare.
Referință de acceptanță: `PORTI_PILOT_DEMO_PRIVAT_2026-10-25.md`.

## 1. Limita serviciului

Serviciul platformei nu este un modul instalat în ERP-ul companiei. Instanța
companiei nu primește credențiale de operator, worker sau control plane. Codul
comun al aplicației poate fi distribuit read-only, dar datele, storage-ul, cheia,
sesiunile și configurația runtime sunt separate pe trial.

Componente logice (nu obligația unor mașini diferite):

1. API de operator: autentificare separată, consultare și comenzi autorizate.
2. Control plane: registru durabil, revizii, comenzi, joburi și metadate resurse.
3. Worker: preia jobul cu lease; nu primește comenzi shell/SQL/căi din browser.
4. Adaptor privilegiat de provisionare/migrare: operații restrânse, legate de
   trial și job; separat de identitatea runtime. Nu este implementat încă.
5. Gateway: rezolvă hostname-ul și runtime-ul din registru, nu din parametri client.
6. Runtime A/B: ERP separat, cu acces numai la propriile date și secrete.
7. Backup/restore: identitate controlată, separat de accesul runtime și operator.

Un proces privilegiat de host poate, prin natura drepturilor sale, traversa
izolarea. Nu promitem protecție față de administratorul OS; îi restrângem și
audităm utilizarea. Un filtru în UI nu este dovadă de izolare SQL/OS.

## 2. Contracte de intrare și autoritate

| Interfață logică | Intrare permisă | Autoritate și rezultat |
| --- | --- | --- |
| Consultare | trialId, filtre/paginare validate | Identitate operator + scope verificat; ieșire whitelist, audit înainte de divulgare |
| Comandă lifecycle | trialId, commandId, expectedRevision, acțiune permisă și motiv validat | Permisiune distinctă de citire; CAS și idempotentă; întoarce stare/job, nu declară efectul final executat |
| Preluare/reînnoire/confirmare job | job/revizie/generație și termen așteptat | Identitate worker de serviciu; lease și generație revalidate înaintea efectelor și confirmării |
| Aprobare comercială | ID de aprobare verificat și date minime validate | Integrare autentificată a platformei; aceeași aprobare nu creează alt trial |
| Rezolvare rută | hostname normalizat | Rută din registry și stare eligibilă; necunoscut/expirat/ambiguu refuzat |

Sunt interzise ca autoritate din payload: actor.kind, rol ERP, PID, nonce de test,
nume de bază, port, cale, comandă shell, șir de conexiune sau cheia companiei.
Resursele rezultă din legarea trialului la registru. Cursorul și amprenta raportului
nu sunt credențiale. Citirea nu acordă drept de modificare ori ștergere.

Ora lifecycle/lease vine din sursa de timp a serviciului, nu de la browser.
Tranzacția registrului nu rămâne deschisă în timpul pornirii procesului ori
trimiterii invitației. Retry-ul reconciliază efectul real; receipt-ul sintetic
existent nu dovedește efect extern exactly-once.

## 3. Matricea accesului țintă

Legendă: `NU` = refuz tehnic de probat; `RO` = citire limitată; `RW` = citire/
scriere în domeniul propriu; `JOB` = exclusiv operația delegată și auditată.
Matricea reprezintă ținta, NU permisiunile deja instalate.

| Identitate | Control plane SQL | SQL A | SQL B | Storage A/B | Cheia A/B | Backupuri |
| --- | --- | --- | --- | --- | --- | --- |
| Runtime A | NU | RW fără administrare server | NU | RW A / NU B | RO A / NU B | NU |
| Runtime B | NU | NU | RW fără administrare server | NU A / RW B | NU A / RO B | NU |
| API operator | RO proiecții; comenzi prin contract autorizat | NU | NU | NU / NU | NU / NU | Numai metadate autorizate |
| Worker registru | JOB claim/lease/confirmare | NU direct | NU direct | NU direct | NU direct | NU direct |
| Adaptor provisionare/migrare | Legare job/resurse verificată | JOB A | JOB B | JOB pe trial | JOB creare/referință | NU implicit |
| Gateway | RO rutare și eligibilitate | NU | NU | NU / NU | NU / NU | NU |
| Backup/restore | JOB inventar și rezultat | JOB sursă/destinație | JOB sursă/destinație | JOB pe trial | Acces doar dacă operația cere, separat | JOB pe trial |

Operatorul nu primește conexiune SQL directă prin simplul cont de login. API-ul
trebuie să aibă identitate tehnică minimă. Adaptorul privilegiat este un risc
explicit: nu acceptă SQL/shell arbitrar și nu se expune runtime-urilor.

### Compatibilitate de rezolvat în ERP

`server/core/db.js` conține căi de migrare, bootstrap și reparare critică a
schemei. Ținta „runtime fără administrare server” nu dovedește că schema poate
fi complet imuabilă acum. Înainte de restrângerea DDL trebuie inventariate și
separate operațiile de instalare/migrare de cele necesare la pornire. Nu acordăm
db_owner/sysadmin tuturor runtime-urilor doar pentru a trece proba și nu schimbăm
drepturile instalării existente prin acest document.

## 4. Probe negative obligatorii

Fiecare probă rulează sub identitatea reală de test indicată, nu prin conexiunea
administratorului cu o variabilă `actor`. Include o operație pozitivă în domeniul
propriu, ca să nu confundăm un runtime complet nefuncțional cu izolarea reușită.

1. SQL A: citire/scriere canar în A reușește; aceeași operație în B/control plane
   e refuzată. SQL B: simetric. Verificare cu numele complet al bazei vecine,
   nu doar prin API-ul ERP. A nu creează baze/loginuri și nu modifică drepturi.
2. OS A/B: citire și scriere în storage propriu reușesc; în storage-ul și fișierul
   de cheie al vecinului eșuează. Traversal și symlink/junction către vecin sunt
   refuzate. Testul nu folosește același utilizator OS pentru ambele runtime-uri.
3. Runtime → control plane: conexiune SQL, fișiere cu secrete, API operator și
   endpoint de worker refuzate. Port loopback nu înlocuiește autentificarea.
4. Operator read-only: consultare trial permis, trial nescope-uit și comandă
   lifecycle refuzate; revocare/expirare verificată și după operații asincrone.
5. Worker vechi: lease/generație depășită nu poate confirma sau autoriza un efect;
   identitatea workerului nu devine administrator SQL/OS general.
6. Gateway: hostname necunoscut sau trial expirat nu ajunge la A/B; sesiunea,
   invitația și fișierul lui A nu funcționează pe B. Nu există rută aleasă de client.
7. Backup/restore: runtime A nu citește backup B; restore A folosește destinație
   nouă, cheia potrivită și verifică decriptarea, fără a modifica B.

## 5. Siguranța fixture-ului viitor

Mai întâi inventariem suportul local pentru identități SQL/OS și drepturile
necesare. Fixture-ul care creează identități sau schimbă ACL-uri are opt-in
distinct, plan explicit de resurse generate și cleanup strict pe acele resurse.
Nu reutilizează conturi, directoare ori baze ERP, parole din env-ul instalației
sau utilizatorul real ca runtime izolat. Nu dezactivează autentificarea pentru test.

Fixture-ul SQL curent `server/tests/support/demo-trial-sql-fixture.js` folosește
identitatea Windows curentă prin Integrated Security. Acesta dovedește tranzacții
SQL în scope-ul testului, NU separarea identităților A/B. Nu îl raportăm drept
test ACL. Lipsa drepturilor de creare a identităților blochează proba, nu justifică
schimbarea configurației SQL Server sau a drepturilor OS fără acord explicit.

## 6. Oprire și recuperare

Oprirea API-ului blochează cereri noi; oprirea workerului nu confirmă joburi
neterminate. Lease-ul se reatribuie numai după regulile registrului, cu generație
nouă. Un proces/lock activ nu este preluat prin simplul timeout al unei cereri.
Audit indisponibil blochează consultarea/exportul conform probelor existente.
Procedura de recuperare de test nu devine automat procedură de operare Linux.

Păstrăm separat accesul expirat, retenția și ștergerea. 15 zile de la activare
este valabilitatea trialului, nu autorizație de ștergere a tuturor backupurilor.
Nicio rută de ștergere reală nu este activată prin acest contract.

## 7. Acceptanța incrementului și pașii următori

Închis aici: contractul propus și matricea probelor negative documentate pe baza
codului existent. Neînchis: toate probele de identitate SQL/OS reală din secțiunea 4.
Nu s-au creat conturi, modificat ACL-uri sau rulat comenzi SQL administrative.

Următorul pas: inventar read-only al posibilităților mediului local și proiectarea
fixture-ului de izolare, cu planul exact al mutațiilor înainte de execuție. Alegerea
providerului de autentificare și a mediului de pilot rămâne decizie explicită.
Nu există arhive noi ori schimbare de versiune în această etapă.
