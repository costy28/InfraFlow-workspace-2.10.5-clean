# Registru Demo — prima probă SQL tranzacțională

Data: 24 octombrie 2026. Cod exclusiv de test, **neconectat la aplicația publică**.
Nu înlocuiește încă magazia JSON și nu implementează întregul control plane.

Extensia ulterioară pentru claim/lease/generație este descrisă în
`docs/JOBURI_DEMO_SQL_LEASE_2026-10-24.md`. Secțiunile de mai jos păstrează
limitele primului increment; nici extensia nu activează un executor real.

## 1. Livrabil

- `server/core/demo-trial-sql-test-store.js`: adaptor pentru `initialize`, `read`,
  `queue`, `command`, peste reducerul existent și executarea SQL explicită.
- `db/control-plane-test-migrations/001_trial_registry.sql`: schemă separată de
  `db/migrations`; runnerul ERP nu o aplică automat.
- `server/tests/support/demo-trial-sql-fixture.js`: conexiuni independente la
  `.\SQLEXPRESS`, Windows Integrated Security; nu citește conexiunea ERP din env.
- `server/tests/demo-trial-sql-store.test.js`: garduri și probe pe SQL real.

Fabrica și fiecare execuție refuză alt `NODE_ENV` decât `test` și alt nume decât
`INFRAFLOW_TEST_TRIALS_<12 caractere hex majuscule>`. Fixture-ul permite `master`
numai pentru comanda exactă de creare a bazei noi, generate aleatoriu în această
rulare. Nu acceptă un server extern, utilizator/parolă sau nume de bază ales din
browser. Aceasta este o protecție de test, nu autentificarea viitorului operator.

## 2. Model de persistență implementat

| Tabel | Responsabilitate |
| --- | --- |
| `dbo.demo_registry` | Snapshot JSON canonic și revizie globală CAS, un singur rând |
| `dbo.demo_trials` | Proiecții pe trial: aprobare, resurse, stare, revizie și snapshot |
| `dbo.demo_commands` | ID comandă și digest, unic pe trial |
| `dbo.demo_events` | Eveniment/audit al reducerului, unic pe trial și revizie |
| `dbo.demo_outbox` | O înregistrare `reconcile_trial`, `pending`, pe trial/revizie |

Există constrângeri SQL de unicitate pentru aprobare și fiecare tip de resursă,
chei străine pentru comenzi/evenimente/joburi, verificări de stare și JSON valid.
Coloanele identităților text folosesc comparație binară pentru a nu introduce
deduplicare case-insensitive diferită de reducerul JavaScript.

Acesta este deliberat un prim adaptor cu **snapshot global și proiecții**, nu
schema finală scalabilă a platformei. Toate scrierile concurează pe revizia
globală; o coliziune recitește și reaplică reducerul, maximum opt încercări.
Revizia trialului și digestul comenzii păstrează regulile de conflict/idempotentă.
Retry-ul identic fără schimbare nu scrie și nu adaugă job sau audit.

## 3. Tranzacția

1. Se citește snapshot-ul și revizia globală; se validează cu modelul existent.
2. Reducerul calculează candidatul fără efecte externe.
3. `UPDATE ... WHERE store_revision=@expected` acceptă o singură versiune curentă.
4. În aceeași tranzacție se scriu snapshot-ul, proiecția trialului, comanda,
   evenimentul și înregistrarea outbox.
5. Orice eroare revine prin `ROLLBACK`; numai `COMMIT` publică toate schimbările.

Se folosesc `SET XACT_ABORT ON`, `TRY/CATCH` și `THROW`, conform
[documentației Microsoft](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-xact-abort-transact-sql).
Protecția împotriva scrierilor pierdute este CAS-ul executat în SQL, nu faptul că
apelurile ar veni din același proces. Testul folosește procese PowerShell/conexiuni
SQL independente, inclusiv apeluri concurente.

Niciun email, proces ERP, comandă shell de provisionare ori ștergere nu rulează
în această tranzacție. Joburile sunt numai înregistrări persistente. Nu există
worker, lease, claim/ack sau executor conectat la outbox în acest increment.

## 4. Probe și limite

Rulare explicită SQL din 24 octombrie: **9/9 trecute, zero skip**. Baza nouă
păstrată pentru inspecție este `INFRAFLOW_TEST_TRIALS_09CC7C5372A1`; nu este o
bază ERP și nu conține credențiale ale clientului. Nu s-au folosit/dropat baze
existente. Procesul de test s-a încheiat normal, fără a porni vreun serviciu ERP.

Regresia JSON/browser existentă a fost rerulată separat: **87/87**, zero skip,
inclusiv Chrome. Sunt două rulări distincte, nu o suită unică de 96 probe.
Audit expuneri: **484 fișiere, zero constatări**; sintaxa și diff check trecute.

Scenarii: trialuri distincte concurente fără lost update; aceeași revizie cu un
câștigător; retry concurent identic; aceeași aprobare cu două ID-uri concurente;
eroare injectată înainte de commit; confirmare simulată pierdută după commit;
constrângere SQL pentru aprobare duplicată, inclusiv fără reducer.

În proba de rollback se compară registrul și numărul de trialuri/comenzi/
evenimente/joburi. În proba după commit se recreează clientul și se repetă
aceeași comandă: starea persistă și înregistrările nu se dublează.

**Nu s-a omorât conexiunea sau procesul SQL în mijlocul COMMIT-ului.** Eroarea
înainte de commit este un `THROW` controlat; confirmarea pierdută este simulată
după răspunsul SQL. Nu rezultă o certificare pentru power loss, backup, crash OS,
HA sau comportamentul unui driver Linux. Jurnalul reducerului nu este încă audit
de operator autentificat: `actor.kind` continuă să fie intrare de test de încredere.

Executorul de probă folosește Windows PowerShell/System.Data, cu payload limitat
la 20 KB și timeouturi explicite. Nu este driverul Node/pool-ul viitorului serviciu
Linux. Nu sunt implementate aici setup/invitații/prelungirea sincronizată cu ERP,
retenția ori rutarea. Nu se schimbă orchestratorul JSON existent.

## 5. Rulare explicită

```powershell
$env:INFRAFLOW_TEST_TRIAL_SQL='1'
node --test server/tests/demo-trial-sql-store.test.js
```

Flagul permite crearea unei baze **noi de test** pe instanța locală fixă.
Schema și datele de test sunt păstrate pentru inspecție; nu există DROP automat.
Fără flag, proba SQL este sărită; testul gardurilor rulează fără conexiune SQL.
Nu declarați „SQL validat” pornind de la o rulare în care proba a fost sărită.
Erorile executorului expun numai codul categoriei și numărul SQL, nu credențiale,
payload ori textul complet al excepției PowerShell.

## 6. Următorul increment

Contract/implementare SQL pentru claim, lease și generația jobului, cu două
conexiuni și refuzul confirmării unui worker vechi. Efectele rămân simulatoare
până la propriile probe de izolare SQL/OS și rutare. Abia după completarea
contractului se poate adapta orchestratorul; nu se activează pilotul public.
