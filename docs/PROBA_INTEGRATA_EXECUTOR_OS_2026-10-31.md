# Probă integrată fără creare de cont demo

Pachet privat, separat de ERP 2.12.736. Nu aplică migrări, granturi sau restarturi.
Folosește credentiala existentă `os-executor.password`, fără schimbare sau afișare.

## Ce probează efectiv

1. Inventar NSS real pentru identitatea rezervată a pilotului: trebuie să lipsească
   utilizatorul și grupul. Verifică uneltele sistemului prin `--help`, nu rulează
   groupadd/useradd.
2. Sub blocarea reală a identității, pornește o unitate systemd tranzitorie cu
   DynamicUser și LoadCredential. Verifică prin autentificare SQL nativă profilul
   exact de trei proceduri și lipsa accesului la ERP.
3. Apelează numai procedura read-only `verify_os_identity_execution_context`, cu
   intent zero și token zero, fixe. Acceptă ca dovadă de refuz exclusiv codul SQL
   54212. O eroare de rețea, alt cod SQL sau succes neașteptat NU trece proba.
4. Verifică faptul că acel refuz oprește garda înaintea oricărui runner.
5. Separat, traseul pozitiv folosește **context, observare și raportare simulate**.
   Garda recitește contextul înaintea fiecărui pas sub lock; runnerul real pornește
   doar `/usr/bin/true` de două ori. Nu este testul pozitiv al unei delegări SQL reale.
6. Eliberează lock-ul, curăță numai directorul temporar propriu sub `/run` și
   reverifică absența contului/grupului pilotului.

Nu se acceptă delegări, nu se scriu rezultate OS și nu se preia un job. Starea
`queued|5|2|0` nu este modificată. Niciun termen de 15 zile nu începe aici.

## Resurse noi și ordine

Release nou, fără suprascriere:
`/opt/infraflow-demo-platform/releases/os-integrated-check-v1`.
Conține numai codul probei SQL și verificatorul de metadate, plus legătura către
driverul MSSQL deja existent. Credentiala sursă rămâne root:root 0600.

Unitate tranzitorie: `infraflow-demo-os-integrated-sql.service`.
Nume DynamicUser: `infraflow-os-int-check` (trebuie să lipsească în NSS înaintea probei).
Nu instalează unități permanente. Codul verificatorului vechi nu este suprascris.

1. Transfer/hash/extragere.
2. Numai preflight:
   `sudo python3 -B scripts/linux/probe-demo-os-integrated.py --check-only`
   Așteaptă `OS_INTEGRATED_PREFLIGHT_OK`; fără SQL sau citirea secretului.
3. După confirmare separată:
   `sudo python3 -B scripts/linux/probe-demo-os-integrated.py --probe-confirmed`
4. Așteaptă:
   - `OS_INTEGRATED_REAL_SQL_NEGATIVE_GATE_OK`
   - `OS_INTEGRATED_NEGATIVE_PATH_NO_COMMAND_OK`
   - `OS_SIMULATED_CONTEXT_GUARD_BENIGN_RUNNER_OK`
   - `OS_INTEGRATED_CANARY_CLEANUP_OK`
   - `NO_SQL_WRITE_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART`

La eroare nu relua automat. Release-ul parțial rămâne pentru inspecție și nu se
șterge/adoptă automat. Nu transmite credentiale sau conținutul fișierelor protejate.

## Validare locală și limită

181 teste Node și 20 teste Python pentru probă/gardă/runner/executor trecute.
Audit advisory: 633 fișiere, zero constatări. Testele de SQL local folosesc un
driver simulat pentru markerul de refuz; autentificarea și refuzul efectiv pe VPS
rămân de probat. Probele separate de kernel pentru lock și timeout au fost deja
confirmate de operator pe VPS. Acest pachet nu creează și nu activează un tenant.

Root rămâne administrator de încredere. Blocarea cooperativă și garda nu fac
efectele OS și starea SQL atomice. Prima creare reală necesită protocolul separat
de delegare, aprobare locală, observare și raportare/reconciliere.
