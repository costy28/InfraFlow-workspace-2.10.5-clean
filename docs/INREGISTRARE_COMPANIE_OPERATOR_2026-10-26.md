# Înregistrare companie — client restrâns, încă neactivat

Registrul UI pe VPS a fost instalat și captura utilizatorului confirmă pagina
Companii demo cu rezultat gol. Nu există încă companii de test create.

## Increment local

`trial-registrar.js` este client SQL separat, neimportat de serviciu sau HTTP.
Identitate fixă infraflow_demo_registrar pe INFRAFLOW_DEMO_PLATFORM, loopback1433;
nu folosește loginul auth, reader, SA sau credentiale ERP.

Acceptă exact approvalId/companyName/commandId. Identificatorul aprobării este o
referință explicită de solicitare, nu se derivă din numele companiei; commandId
trebuie păstrat identic pentru reconcilierea/idempotenta aceleiași cereri.
Parametri MSSQL și singura procedură permisă platform.queue_trial. Nu activează
trial, nu creează bază de date, storage, runtime, utilizator sau invitație.

Înaintea apelului verifică identitatea, absența sysadmin/CONTROL, dreptul EXEC
queue_trial, lipsa EXEC activate_trial, SELECT/DML direct pe trials și acces ERP.
Doar CONNECT SQL / VIEW ANY DATABASE sunt acceptate ca drepturi server.
Pool fix cu un singur apel în lucru; cererile paralele nu sunt puse în coadă.

Receipt-ul returnat este proiectat la id/state=queued/revision=0/createdAt UTC.
Conflict SQL este raportat generic; orice eroare de transport/receipt după apel
este rezultat neconfirmat, fără retry automat. Tranzacția poate fi deja comisă.

## Poartă obligatorie înainte de formular și instalare

Procedura 002 existentă scrie actor_ref=ORIGINAL_LOGIN(), deci reține identitatea
SQL tehnică. Auditul operator actual reține acțiunea trial.queue, dar nu corelează
atomic operatorId/revision/approvalId/commandId și receipt-ul. Nu se prezintă ca
audit uman complet și nu se activează formularul bazându-ne doar pe aceste două
jurnale independente.

Urmează contractul/migrarea pentru auditul comenzii legat de operator, apoi CSRF,
confirmare explicită și tratarea rezultatului incert în UI. Credentialul registrar
nu este încă livrat serviciului; activatorul rămâne complet separat. Nu se lărgesc
granturile reader/auth și nu se schimbă parola unui login existent.

Validare locală: cinci teste noi (input, drepturi/identitate, proiecție receipt,
parametri/procedură/concurență/shutdown, transport fără retry). Nu s-a apelat
queue_trial pe VPS și nu s-a efectuat nicio modificare SQL sau de serviciu.

## Increment următor: audit atomic operator (înlocuiește contractul client de mai sus)

Migrare separată 005_operator_queue_audit.sql, limitată la baza platformei,
neaplicată pe VPS. Creează platform.operator_command_audit și o procedură nouă,
platform.queue_trial_by_operator; nu modifică procedurile 002 și nu creează login
sau granturi. Verifică proprietarul comun al schemelor pentru ownership chaining.

Noua procedură primește JSON exact cu operatorId/operatorRevision din sesiunea
autorizată, plus approvalId/companyName/commandId. Operatorul este recitit cu
UPDLOCK/HOLDLOCK și trebuie să fie enabled, la revizia cerută și cu trial:queue.
Row lock-ul rămâne până la commit, serializând revocarea cu această comandă.
Identificatorii din browser nu au voie să suprascrie identitatea sesiunii: viitorul
adaptor trebuie să le respingă și să adauge operatorId/revision numai server-side.

În aceeași tranzacție: trial queued, receipt în trial_commands, eveniment cu
actor_ref=operator:UUID, audit corelat cu operator/revizie/aprobare/comandă/digest
și identitate SQL tehnică, plus eveniment trial.queue în jurnalul operatorului.
Oricare eșec anulează toate aceste efecte. Retry identic întoarce receipt-ul
anterior fără alt audit; payload schimbat, alt command pentru aprobare legată sau
același command pe altă aprobare sunt conflicte. Revocarea este verificată și la
reluarea comenzii. Nu se creează nicio resursă de demo.

Clientul local trial-registrar.js folosește acum numai queue_trial_by_operator,
cu JSON parametrizat. Cere EXEC pe aceasta și refuză EXEC pe queue_trial veche,
activate_trial, SELECT/DML direct și acces ERP. Granturile registrar actuale de pe
VPS nu corespund încă acestui contract: schimbarea lor va fi un pas separat,
confirmat explicit, fără schimbări de parole. Clientul nu este montat în HTTP.

Proba locală SQL rulează exclusiv pe o bază nouă INFRAFLOW_TEST_TRIALS_*, cu
USER WITHOUT LOGIN temporar și EXEC limitat, fără acces direct pe ambele scheme.
Versiunea inițială a probei a trecut pe INFRAFLOW_TEST_TRIALS_30F07B6578AB și baza
a fost eliminată: guard/apply/reapply, retry idempotent, audit uman atomic,
payload/revizie/acces direct refuzate, cont disabled/scope și rollback la trigger
de audit eșuat. Varianta extinsă adaugă concurență pentru aceeași comandă.

Varianta extinsă a trecut pe INFRAFLOW_TEST_TRIALS_EBC29E15660F: două apeluri
concurente identice au produs același receipt, o singură companie și un singur
audit pentru acea comandă. Cinci grupuri SQL passed=true, cleanup=true.
44/44 teste Node ale platformei trecute; audit expunere 556 fișiere, zero findings.
Nicio migrare/grant/comandă pe VPS în acest increment.

## Formular și coordonator local — 2026-10-27

VPS: migrarea 005 și drepturile au fost aplicate ulterior, iar loginul registrar
real a fost verificat doar pentru metadate. Nu există încă credential de registrar
livrat serviciului și nu s-a creat nicio companie prin procedura nouă pe VPS.

Coordonatorul trial-registration.js acceptă din browser numai approvalId,
companyName,commandId,confirmed=true. Respinge câmpuri de operator. Identitatea și
revizia provin din authorize(trial.queue) cu CSRF, apoi sunt verificate din nou
atomic în SQL. După comitere, răspunsul este condiționat de sesiunea încă validă;
revocarea după comitere este rezultat incert, nu afirmație că nu s-a scris.

HTTP POST /operator/trials/register există numai când un coordonator explicit
este injectat. În această etapă service.js NU îl instanțiază. Capacitatea din UI
este vizibilă numai când coordonatorul există și sesiunea are scope trial:queue.
Login/resume returnează capacitatea fără a dezvălui tokenul de sesiune.

Formular cu referință solicitare aprobată, denumire, commandId și checkbox explicit
privind limita «doar registru». CommandId este generat o singură dată și păstrat
în memorie; poate fi introdus manual pentru reconciliere. Nicio stocare browser
și nici retry automat. La rezultat incert se blochează editarea propunerii, se
afișează identificatorul și o reluare explicită trimite exact același payload.
Operatorul trebuie să noteze identificatorul și datele înainte să închidă pagina;
aceasta avertizează la închidere dacă rezultatul este incert.

Smoke Chrome local cu motor real auth și registrar fixture: răspuns pierdut după
commit simulat, reluare manuală cu exact aceeași comandă, două apeluri și o singură
înregistrare în ledger fixture. Login/reload/logout/mobile trecute. Nu este test
de scriere SQL reală sau de Cloudflare. Urmează livrarea protejată a credentialului
registrar, probe fără scriere și activare controlată, înaintea primei companii.
