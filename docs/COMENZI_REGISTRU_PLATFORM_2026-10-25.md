# Comenzi controlate registru — pregătire locală

Migrare 002_trial_commands.sql în directorul separat demo-platform-migrations.
Nicio aplicare VPS în acest increment. Migrarea refuză DB greșit și lipsa
migrării 001; application lock/tranzacție, proceduri create împreună cu markerul
de migrare. Nu creează loginuri/roluri/granturi EXECUTE ori drepturi DML.

## Proceduri

- queue_trial: approval/company/command validate, identificator trial NEWID,
  lock pe aprobare, aceeași comandă și digest returnează receipt-ul original.
  Aceeași aprobare cu comandă/date diferite este refuzată, nu duplicată.
  Trial queued, receipt și eveniment revision=0 sunt în aceeași tranzacție.
- activate_trial: row lock, verificare expected_revision, numai din
  awaiting_activation; timp SYSUTCDATETIME și expirare DATEADD(day,15,...).
  Receipt și eveniment în aceeași tranzacție. Retry identic nu recalculază data;
  command_id reutilizat pentru alt request este refuzat.

Identitatea auditului este ORIGINAL_LOGIN(), adică identitatea SQL, nu un
operator uman autentificat. Nu se acceptă actor/now/expiresAt din payload.
Autorizarea operatorilor și corelarea identității umane sunt încă neimplementate.
Nu se expun procedurile prin HTTP. Dreptul EXECUTE va fi acordat ulterior strict
pe procedură unor identități separate pentru aprobare și activare.

Nu există aici tranziții worker către provisioning/awaiting_activation, efecte
de provisionare, invitații, chei, runtime-uri sau ștergere. Testul stării pregătite
folosește setup SQL administrativ numai în baza temporară, nu dovada unui worker.

## Probe

11/11 teste Node locale au trecut (structură/politici/serviciu/conector).
Prima probă SQL a refuzat și identificatori valizi cu cratimă din cauza
semanticii SQL LIKE pentru clasa de caractere folosită. Observație izolată prin
SELECT read-only în master; baza temporară 9B09C837182F a fost curățată.
Corectat prin eliminarea cratimelor numai din expresia de validare, apoi clasa
de caractere fără cratimă; ID-ul și digestul nu sunt modificate.

Rerularea reală pe INFRAFLOW_TEST_TRIALS_475EE0F209A5 a trecut toate cele șapte
grupuri de assertions ale scriptului extins (nu șapte teste node:test): include
regresia 001, aplicare/reaplicare 002, queue concurent identic fără duplicate,
payload schimbat refuzat, activare prematură refuzată, două activări concurente
cu un succes/un conflict de revizie, retry cu receipt original, command_id
reutilizat refuzat, un singur eveniment de activare și termen exact de 15 zile.
Un trigger temporar exclusiv de test a provocat eroare la audit; noul trial nu
a rămas în DB după rollback. Triggerul a fost eliminat în baza de test.

Script: passed=true,cleanup=true,error=null. DROP exclusiv pe baza temporară
creată în run și absența verificată; fără KILL/SINGLE_USER, fără loginuri noi,
fără conexiune VPS. Guardul de nume a fost singurul literal substituit în memoria
probei; corpul SQL livrabil a rămas identic. 11 teste locale trecute separat;
audit 532/zero. Nu am validat încă EXECUTE sub identități SQL separate sau Linux.

Migrarea 002 este pregătită pentru aplicare autorizată separat pe baza platformei,
fără granturi, loginuri noi ori restart. Nu se activează încă nicio companie reală.
