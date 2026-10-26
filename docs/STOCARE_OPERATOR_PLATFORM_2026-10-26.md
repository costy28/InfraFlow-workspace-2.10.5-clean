# Operator — stocare SQL și criptare, increment local

Fișiere: 003_operator_security.sql și server/demo-platform/operator-store.js.
Nicio aplicare pe VPS, niciun operator/login/secret/cheie permanentă creată.

## Separare

Migrarea folosește schema operator_security, nu platform. Loginul existent
platform_reader are SELECT numai pe platform, nu primește acces la conturi,
hashuri, secretul TOTP criptat, buget sau audit de operator. Se creează numai
accounts/audit și markerul migrării. Nu acordă drepturi și nu creează identități.
O identitate separată pentru auth și proceduri restrânse va fi necesară înainte
de deployment; adaptorul curent cere executor injectat, nu credențiale ERP.

Secretul TOTP este AES-256-GCM, nonce random 12 bytes, tag 16 bytes. AAD conține
formatul, UUID-ul și revizia operatorului: schimbarea acestora sau a cheii/datei
criptate refuză decriptarea. Cheia are 32 bytes, copie privată zeroizată la
shutdown, nu este stocată SQL sau returnată de API. Protecția și persistența
fișierului cheii pe Linux și inventarul backupurilor NU sunt implementate aici.
Revizia schimbată cere recriptare cu noul AAD pentru cont încă activ; nu se
face fallback la un secret sau la o cheie implicită. hash-ul parolei rămâne
scrypt, nu reversibil. Tabelul nu stochează parola în clar.

## Atomicitate

reserveAttempt folosește row lock/tranzacție și ceas SQL, 5 încercări în
fereastră fixă de 15 minute. Bugetul nu se resetează la autentificare reușită
sau recrearea adaptorului. Ora de browser nu este utilizată pentru resetare.
claimTotpCounter folosește UPDATE condiționat enabled/revision/last_counter și
pasul SQL curent/precedent; două instanțe nu pot consuma același counter.
Actualizarea bugetului/counterului și evenimentul corespunzător sunt în aceeași
tranzacție: eroarea auditului trebuie să anuleze modificarea. Evenimentele nu
conțin parola, hashul, secretul, codul OTP, ciphertextul sau tokenul de sesiune.

Adaptorul nu are fallback dacă SQL sau criptarea eșuează. Sesiunile browser nu
sunt persistate; nucleul le pierde la restart, intenționat. Funcțiile store
nu sunt API HTTP și nu conferă singure autentificare/autorizare.

## Validare curentă și limite

22/22 teste Node locale, zero skip. Audit expuneri: 537 fișiere, zero constatări.
Probe unitare AEAD (nonce, key/id/revision, tamper), input/payload fără secret,
erori mascate și shutdown. Proba SQL reală cu buget/counter/izolare de schemă și
rollback audit este în curs; rezultatul se adaugă după finalizare și cleanup.

### Rezultat SQL real încheiat

Proba extinsă a trecut pe INFRAFLOW_TEST_TRIALS_1E7F311A56AA. Migrarea originală
a refuzat baza greșită; numai literalul guardului DB_NAME a fost substituit
în memoria probei, restul SQL neschimbat. Aplicare și reaplicare 003 trecute.
Secretul cifrat a fost recitit/decriptat corect prin adaptorul SQL real.
8 rezervări concurente prin două adaptoare: exact 5 permise; adaptor nou tot
refuză peste limită. Două revendicări concurente același counter: exact una
reușită, iar un al treilea adaptor refuză replay. Identitate USER WITHOUT LOGIN
din baza temporară cu SELECT pe platform: citirea operator_security a fost
refuzată cu 229. Nu sunt loginuri sau ACL Linux create în această probă.

Trigger exclusiv de test pentru eroare audit: reserveAttempt și claimCounter
au fost refuzate, attempt_count a rămas 0 și last_counter -1. S-a folosit setup
administrativ temporar pentru aceste valori; nu există reset de buget public.
Trigger eliminat, apoi baza temporară DROP fără KILL/SINGLE_USER; absența bazei
verificată. passed=true,cleanup=true,error=null. Nouă grupuri de assertions în
scriptul extins, nu nouă teste node:test; includ regresiile anterioare 001/002.
Nu s-a făcut login complet parolă+TOTP prin acest adaptor SQL ori restart OS.

Rămân: fișier cheie și restaurare, proceduri/login auth minimal, CLI înrolare
cu confirmare TOTP, recuperare, jurnal complet al refuzurilor, rute și browser
cu TLS/Origin/Host/cookie, validare pe Linux. Logarea cererilor limitate poate
crește auditul; retenția și limitarea la nivel HTTP sunt încă necesare.
Nu declarăm platforma publicabilă și nu legăm încă writer-ele de interfață.
