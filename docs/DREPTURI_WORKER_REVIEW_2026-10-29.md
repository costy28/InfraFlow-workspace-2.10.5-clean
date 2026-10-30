# Extindere explicită worker: lease → jurnal → emitere bilet

Se modifică numai drepturile loginului existent infraflow_demo_lease, după
confirmare separată și numai când niciun job nu este leased. Nu se schimbă parola,
fișierul lease-sql.password, identități OS sau runtime-urile instalate.

Contract țintă exact trei EXECUTE:
1. platform.provision_lease_command
2. platform.record_step_intent
3. platform.adapter_review_ticket_command

Workerul nu poate consuma biletul: procedura verifică USER_NAME al consumatorului
separat. Nu primește SELECT/DML pe tabele, consultare rezervări, creare job,
activare companie, gestionare operatori sau DDL de server/bază.

Scriptul refuză mapping lipsă, roluri/ownership excesive, drepturi efective
neașteptate sau un profil parțial (numai unul dintre jurnal/bilete). Acceptă
tranziția din profilul vechi și reaplicarea profilului nou complet, în tranzacție.
Nu anulează lease-uri și nu repară automat o stare necunoscută.

## Compatibilitate

provision-lease-sql.js și proba worker-check-v1 rămân pe contractul vechi, exact un
EXECUTE. Nu le relaxăm implicit: după extindere, vechea probă va refuza profilul
nou și NU trebuie reluată. Nu există worker permanent instalat în acest flux;
înaintea grantului trebuie reconfirmat acest fapt pe VPS. Serviciul platformei
nu montează transportul lease și nu necesită restart pentru acest grant.

Noul profil issuer din adapter-ticket-sql.js cere exact trei drepturi, dar
transportul său este numai pentru emitere bilet; orchestratorul complet care
combină lease/jurnal/canal va fi montat separat, fără reutilizarea probei vechi.
Nu rerula restrict-demo-platform-lease.sql vechi: ar reveni la profilul inițial.

## Pași VPS

Hash arhivă → preflight SQL numai citire → verificare unitate worker absentă și
job queued/revizie3/generație1/gate0 fără lease → confirmare separată → aplicare
scope SQL → verificare exact trei drepturi și snapshot nemodificat. Nu există
joburi, intenții sau bilete create de scriptul de drepturi.

Proba completă a canalului este un pas ulterior care poate crea o intenție/bilet
în jurnal și cere confirmare distinctă. Gate-ul execution_ready=0 rămâne intact.

## Rezultate locale

149 teste Node trecute; audit 612 fișiere fără constatări. Proba SQL
INFRAFLOW_TEST_TRIALS_55CA96C26DD4: nouă grupuri trecute, passed=true, cleanup=true.
Login SQL autentificat temporar a trecut de la vechile DENY la exact trei EXECUTE;
profilul nou este reaplicabil fără schimbări suplimentare. Rol db_datareader și
schimbarea granturilor în prezența unui job leased au fost refuzate. Lease,
înregistrare intenție și emitere bilet au reușit; consumul de către worker și
SELECT direct/comenzile administrative au fost refuzate. Gate-ul a rămas 0.
Loginul și baza temporară au fost eliminate confirmat. DEP0123 rămâne cunoscut.

Confirmare VPS primită: după preflight idle și acord separat, scriptul a raportat
WORKER_REVIEW_SQL_SCOPE_APPLIED. Verificarea ulterioară: 1|1|1|0|0 pentru lease/
jurnal/bilete/citire directă/activare; job queued/revizie3/generație1/gate0,
0 intenții, 0 bilete și WORKER_REVIEW_SCOPE_VERIFIED. Proba veche nu se mai rulează.
