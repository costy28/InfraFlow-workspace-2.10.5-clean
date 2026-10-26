# Primul operator — CLI privat de înrolare

Implementare locală: scripts/linux/enroll-demo-platform-operator.py și
server/demo-platform/enrollment-material.js, cu operator-credentials/store.
Nu este instalată/executată pe VPS în acest increment.

## Flux

CLI Linux root, terminal interactiv fără redirect stdout, opt-in explicit.
Folosește SA numai pentru bootstrap manual, prin SQLCMDPASSWORD în mediul
copilului, nu argv/history; nu salvează parola SA. Verifică migrarea 003 și
absența oricărui operator; refuză o cheie existentă. Parolă nouă de operator,
minimum 16 caractere, confirmată de două ori și diferită de SA.

Helperul Node primește materialul prin stdin, produce numai hash scrypt și
envelope AEAD. Nu întoarce cheia sau secretul în outputul helperului. CLI-ul
afișează secretul TOTP pentru configurare manuală numai după avertizare și
confirmarea AFISEAZA. Nu se trimit capturi sau transcript din acea secțiune.
TOTP SHA1, 6 cifre/30 secunde, maximum 3 încercări de confirmare. Fără confirmare
validă nu există scrieri de fișier sau SQL.

După confirmare: cheie nouă de 32 bytes în
/etc/infraflow-demo-platform/operator-auth.key, root:root 0600, O_EXCL/O_NOFOLLOW,
părinți root fără group/world write sau symlink, fsync fișier și director.
Cheia nu este disponibilă serviciului curent; livrarea controlată către viitorul
serviciu de autentificare este pas separat. Nu se schimbă permisiunile readerului.

SQL într-o tranzacție cu application lock: verifică din nou că nu există cont,
verifică prospețimea counterului față de ceasul SQL, creează cont enabled cu
scopes read/queue/activate/session-own, hash, secret criptat și counter deja
consumat, apoi audit operator_totp_claimed. Acest eveniment documentează
confirmarea inițială; nu este încă jurnal administrativ complet de înrolare.
Nu acceptă expiresAt/actor/browser sau conturi ERP; nu creează companii.

## Recuperare și limite

Nu există tranzacție atomică între filesystem și SQL. Cheia se persistă înainte
de cont; o eroare SQL poate lăsa numai cheia. Nu se șterge și nu se regenerează
automat. Timeout sau confirmare incertă: se verifică existența contului și
potrivirea cheii înainte de orice reluare. Lipsa cheii pentru un cont existent
blochează înrolarea, nu justifică o cheie implicită. Copia offline protejată a
cheii și restaurarea ei sunt necesare înainte de publicare, încă nevalidate.

CLI-ul folosește cont activ numai după confirmare TOTP; interfața web nu este
încă expusă. Nu există încă recovery codes/reset TOTP sau identitate SQL runtime
pentru auth. Sesiunile rămân volatile și nu sunt create prin acest CLI.

## Validare

24/24 teste Node (2 noi plus regresii), 3/3 Python. Vector RFC identic Python/
Node, output helper fără secret/parolă, verificarea hashului și decriptării,
payload invalid refuzat. Testele nu confirmă filesystem root/ACL/fsync pe Linux.
Audit expuneri 539 fișiere, zero constatări. Proba SQL reală a fluxului de cont
și autentificare completă este în curs; se consemnează după cleanup.

Prima rulare extinsă pe D95B0F16B6E8 a încheiat grupurile anterioare, dar a
eșuat cu ERR_ASSERTION în noul grup de înrolare/autentificare; cleanup confirmat.
La revizuirea testului a fost identificată regenerarea codului la proba replay,
care putea testa din greșeală un cod nou după schimbarea ferestrei TOTP.
Corectat să retrimită valoarea exactă folosită la loginul reușit; nu se marchează
această primă rulare drept trecută. Rerularea completă trebuie să confirme.

Rerulare încheiată pe INFRAFLOW_TEST_TRIALS_CE944D623532: toate cele zece grupuri
de assertions ale scriptului extins trecute, inclusiv grupul nou. SQL-ul de
înrolare a fost generat de funcția reală Python creation_sql; materialul prin
helperul real Node/scrypt/GCM. Setup-ul de test a confirmat un counter din
pasul precedent, apoi a creat contul; a doua înrolare a fost refuzată cu 51702.
createOperatorAuth cu adaptor SQL real a emis o sesiune după parolă+TOTP,
trial.read autorizat, replay-ul exact al codului refuzat. Nu a fost un browser
sau un flux manual cu telefonul; scrierea cheii POSIX nu a fost executată.
passed=true,cleanup=true,error=null; baza temporară absentă după DROP verificat,
fără KILL/SINGLE_USER. Nicio conexiune VPS și niciun operator permanent creat.

Pregătit pentru înrolare manuală autorizată separat: primul cont operator și
fișier root de cheie sunt mutații permanente, nu sunt activate prin simpla
trecere a testelor. Înainte de rulare: Authenticator disponibil, sesiune privată,
fără capturi/transcript după afișarea secretului. Nu expune serviciul public.
