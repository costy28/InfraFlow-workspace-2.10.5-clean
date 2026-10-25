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
