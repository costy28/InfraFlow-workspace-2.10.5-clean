# Job durabil și rezervări — pregătire locală, neaplicată pe VPS

## Baza verificată pe VPS

Trial b1100b43-48d0-42fa-8a1d-73b1286f8242, aprobare pilot:20261027-001,
queued/revizie0/bindings corecte/fără activare. Inventarul primit de la utilizator:
DB și login SQL libere, utilizator/grup Linux libere, unitate not-found, directoare
per UUID /var/lib și /etc libere. Acesta este un snapshot, nu rezervare/autoritate
permanentă. Adaptorul viitor trebuie să reverifice coliziunile înainte de efecte.

## Migrare 006 locală

Tabele separate: provision_jobs, resource_reservations, provision_request_audit.
Procedură unică request_provision_job, fără granturi/loginuri/conturi noi și fără
modificarea procedurilor de înregistrare/activare. Nu se creează job doar prin
aplicarea migrării; este necesară o cerere autorizată ulterioară.

Payload exact: trialId, expectedRevision, operatorId, operatorRevision, commandId.
Nu acceptă nume DB, căi, port, shell/SQL, release sau parole din payload. Operatorul
este verificat sub lock până la commit: enabled, revizie și scope trial:prepare.
Acest drept este distinct de trial:queue. Contul infraop actual NU este actualizat
automat; configurarea scope-ului, auditului auth și reviziei/cheii TOTP rămâne un
pas separat. API-ul actual nu primește acest drept sau procedura nouă.

În aceeași tranzacție: job unic pe trial, șapte rezervări unice (DB, SQL login,
identitate OS, storage root, config root, unitate systemd, key_ref), receipt și
audit uman corelat, eveniment lifecycle și incrementul reviziei trialului.
Manifestul este derivat în SQL din UUID, conform planului local. Port și release
rămân NULL, execution_ready=0 impus inclusiv prin constraint. Starea trialului
rămâne queued, fără activated_at/expires_at; cele 15 zile NU încep.

Retry identic verifică întâi operatorul și întoarce receipt-ul vechi fără dublare.
Alt payload/command pe un trial deja rezervat produce conflict. Coliziunea dintre
identități OS trunchiate este refuzată și nu adoptă resursele trialului vecin.
Eșecul auditului anulează jobul, rezervările, receipt-ul, evenimentul și revizia.

## Limite explicite

Lease owner/hash/expiry, generație și job_revision sunt numai structură pregătită;
NU există încă proceduri claim/renew/finish și nu este pornit un worker. Nu se
pretinde protecție dovedită împotriva unui worker vechi până la acele proceduri și
probe. Nu există încă adaptorul SQL/OS privilegiat sau migrarea ERP curată.

Nicio acțiune pe VPS în acest increment. Nu există nou buton sau pachet de activare.
Probe locale numai în DB temporară INFRAFLOW_TEST_TRIALS_*, USER WITHOUT LOGIN și
EXEC strict, fără resurse OS/loginuri SQL de server sau date ERP existente.

Prima probă SQL locală pe INFRAFLOW_TEST_TRIALS_883129E8744E a refuzat migrarea cu
SQL468 (collation între tabela variabilă de resurse și cheia BIN2 din registru).
Cleanup confirmat. Definițiile kind/value ale tabelei variabile au fost corectate
cu aceeași collation BIN2 explicită și regresia structurală acoperă acel caz.
Proba completă se reia pe altă bază nouă, nu pe starea eșuată.

Proba corectată pe INFRAFLOW_TEST_TRIALS_1A1AE908DBFF a trecut toate cele șase
grupuri: guard/apply/reapply, scope separat, concurență/idempotentă/job + șapte
bindings + audit atomic fără activare, payload/revizie/acces direct/execuție
refuzate, coliziune OS refuzată și rollback integral la eșec audit. passed=true,
cleanup=true; nicio bază sintetică restantă în această probă.

62 teste Node locale și audit expunere (565 fișiere, zero findings) trecute.
Lease/worker nu sunt validate sau autorizate de acest rezultat. Migrarea 006
rămâne numai locală, neaplicată pe VPS.
