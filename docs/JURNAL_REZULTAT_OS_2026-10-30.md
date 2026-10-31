# Migrarea 016 — rezultat observat și incertitudine

VPS a confirmat schema 015, zero acceptări/evenimente și job queued/5/2/gate 0.
Această etapă nu creează conturi și nu acordă drepturi noi.

016 adaugă os_identity_results, os_identity_result_events și RPC-ul
record_os_identity_result. Doar identitatea SQL fixă infraflow_demo_os_executor
poate trece verificarea internă; migrarea nu creează loginul și nu îi acordă EXECUTE.
Tokenul trebuie să corespundă delegării deja acceptate de același executor.

Rezultate permise:

- observed_created: UID/GID pozitive, canonice, nezero; încă necesită lease-ul,
  generația/revizia și termenul acceptării valabile, companie neactivată.
- uncertain: UID/GID trebuie să fie explicit null. Poate fi înregistrat după
  pierderea lease-ului, fără a transforma acel caz într-un succes.

Raportul și auditul sunt atomice și append-only. Orice a doua raportare cere
verificare, nu suprascriere sau retry automat. Un raport nu finalizează jobul,
nu marchează resursa ca adoptată și nu activează trialul. executionAllowed=false,
reconciliationRequired=true sunt explicite. Nu există useradd sau SQL din payload.

## Reconciliere

Clasificatorul local os-identity-reconciliation.js distinge inspecția lipsă,
resursa absentă, resursa parțială, conflictul de politică/UID/GID și observația
compatibilă cu jurnalul. Nu citește OS și nu este montat în serviciul VPS.
Orice clasificare cere review; lista acțiunilor automate este goală. Inclusiv un
cont aparent identic fără proveniență confirmată nu poate fi adoptat automat.
Rezolvarea administrativă auditată și colectorul OS efectiv sunt încă pași viitori.

## Limite

Un raport SQL este declarația executorului autorizat, nu dovadă independentă de
creare OS. Testele SQL folosesc date sintetice, fără useradd. Înaintea primului
efect real mai sunt necesare executorul restrâns, scope-ul lui și testul Linux.
Nu promitem atomicitate SQL+Linux sau exactly-once în prezența unui crash.

Pachet: migrare + preflight citire + backup COPY_ONLY/CHECKSUM și VERIFYONLY +
această notă. Ordine: hash, preflight, backup, confirmare, aplicare, post-verificare.
Fără restart ERP/platformă și fără schimbarea parolelor.

## Validare locală

168 teste Node trecute; audit advisory 622 fișiere, zero constatări.
Proba nativă INFRAFLOW_TEST_TRIALS_0ED7F02BEDEB: zece grupuri trecute,
passed=true/cleanup=true. Alte identități, UID zero, token greșit și outcome cu
spațiu sunt refuzate; audit failure anulează raportul; termenul pierdut refuză
observed_created, dar permite uncertain; duplicatele nu suprascriu jurnalul.
Durata lease-ului a fost extinsă la cinci minute numai în fixture-ul SQL pentru
suita lungă PowerShell-per-query; termenul acceptării a fost apoi expirat explicit
pentru cazul negativ. Codul de producție păstrează lease-ul de 60 secunde.
Prima probă 7C34C157693E a refuzat acceptarea după expirarea lease-ului de test;
cleanup=true. Ambele baze temporare au fost eliminate. Niciun efect OS executat.
