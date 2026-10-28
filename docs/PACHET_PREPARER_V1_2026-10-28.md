# Preparer v1 — login și credențială, fără solicitare job

Prerechizite VPS: schema 009, operator trial:prepare verificat și platforma sănătoasă.
Pachetul nu montează o rută nouă, nu acordă alte scope-uri și nu repornește servicii.

Ordinea se execută în pași separați, după verificarea hash-ului și confirmarea rezultatelor:
1. Inventar read-only: login/user infraflow_demo_preparer și destinații libere;
   servicii existente sănătoase. Dacă există resurse, nu relua/recrea automat.
2. Backup nou verificat al bazei platformei.
3. create-demo-platform-preparer-login.py --create-confirmed cere parola SA și
   o parolă NOUĂ distinctă pentru preparer, de două ori. Creează atomic login/user
   și drepturi, verifică doar metadate. Așteptat PREPARER_LOGIN_VERIFIED.
4. Salvează parola separat în manager. Nu reutiliza lease, registrar, auth sau operator.
5. sudo prepare-demo-platform-preparer.py --prepare-confirmed cere parola SQL
   EXISTENTĂ preparer. Creează /etc/infraflow-demo-platform/preparer.password
   root:root 0600 și release separat preparer-check-v1.
6. Proba tranzitorie infraflow-preparer-check folosește LoadCredential și identitatea
   OS existentă infraflow-demo-platform. Verifică numai identitatea/drepturile SQL.
   Așteptat PREPARER_CREDENTIAL_SQL_OK, PREPARER_SECRET_PREPARED,
   NO_RESTART_NO_JOB_CREATED. Nu instalează drop-in sau worker.

Runtime-ul preparer citește doar preparer-password din directoarele systemd fixe,
validează descriptorul/metadatele și suprascrie bufferul temporar. Nicio parolă nu
are fallback din ERP/env; driverul poate păstra șirul în memorie, nu se promite
zeroizare integrală a procesului.

La eroare trimite numai etapa și codul generic. Nu relua instalatoarele, nu afișa
secretul, planuri JSON, parole sau stdout/stderr brut. Resursele parțiale sunt
păstrate pentru inspecție, fără ștergere automată.

Testele locale pure nu certifică rularea Linux/systemd. Proba SQL nativă cu login
temporar verifică separat SQL-ul generat, drepturile și comportamentul procedurii;
acceptanța pe VPS rămâne de făcut. Pachetul nu este update ERP.

Validare locală confirmată: 115 teste Node, 4 teste Python și 12 grupuri SQL native
trecute. SQL-ul generat de instalator a creat loginul și drepturile atomic și a
refuzat recrearea lui; verificarea nativă a trecut. Baza sintetică
INFRAFLOW_TEST_TRIALS_55AE96F1EB8F și loginul temporar au fost eliminate confirmat
(passed=true, cleanup=true). Auditul fișierelor nu are constatări. Avertismentul
TLS DEP0123 pentru IP rămâne cunoscut, fără a fi declarat remediat.
