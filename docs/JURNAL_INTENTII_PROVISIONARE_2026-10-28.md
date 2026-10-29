# Jurnal durabil de intenții — increment local

Migrarea 010 depinde de 009, țintește exclusiv baza platformei și nu acordă
drepturi. Nu se livrează sau aplică automat pe VPS. Nu schimbă joburile existente,
conturile, gate-ul execution_ready sau datele de activare.

Procedura record_step_intent acceptă exact jobId, generation,
expectedJobRevision, leaseToken, step, intentId. Validarea și inserarea se fac
într-o tranzacție cu lock pe job și companie. Lease-ul trebuie să fie curent,
neexpirat după ceas SQL, cu hash/token și USER_NAME corecte, trial neactivat și
revizie concordantă. Tokenul nu se persistă în jurnal și nu este returnat.

Pași enumerați: os_identity, tenant_directories, tenant_key, sql_database,
sql_login, schema_bootstrap, runtime_unit. Nicio cale, comandă sau parolă în payload.

Cheia durabilă este job/generație/pas, iar intentId este unic. Aceeași intenție
poate fi recitită idempotent numai după revalidarea lease-ului curent. Alt intentId
pentru aceeași cheie este conflict. Un pas existent dintr-o generație anterioară
cere reconciliere, nu este relansat automat. Revizia jobului nu se modifică prin
înregistrarea intenției. Proprietarul SQL și ora SQL sunt înregistrate în rând.

Starea unică disponibilă este intent_recorded. Nu există completed/success și
nici grant de execuție: executionAllowed=false în toate receipt-urile.

Limite: acesta este primul strat al jurnalului, nu protocol complet de execuție.
Nu există încă rezultatul verificat al efectului extern, reconciliere autorizată,
autoritate adaptor, fencing atomic la executor sau planificare durabilă de retry.
Toate trebuie implementate și probate înainte de deschiderea gate-ului.

Testele statice verifică limitele migrației; proba nativă separată verifică
comportamentul SQL în baza sintetică, fără să dovedească încă identitatea SQL
reală a unui viitor adaptor privilegiat.

## Rezultate locale

130 teste Node trecute; audit fișiere: 599 scanate, zero constatări.
Prima probă nativă (INFRAFLOW_TEST_TRIALS_B135322116A1) a trecut verificările
de intenție, dar s-a oprit la aserțiunea care compara bit-ul SQL cu textul 0.
Helperul necesita CONVERT(int,execution_ready); schema nu a fost modificată pentru
a ascunde eroarea. Cleanup confirmat pentru această bază.

Rerularea INFRAFLOW_TEST_TRIALS_721664FEDAC0: opt grupuri trecute, passed=true,
cleanup=true. Confirmate: retry identic fără duplicare, intentId conflictual,
token greșit, payload suplimentar și pas necunoscut refuzate; lease eliberat
refuzat; generație nouă cere reconciliere; SELECT direct refuzat utilizatorului
fixture-ului. Gate-ul de execuție a rămas 0.

## Extensie concurență și rollback

Proba INFRAFLOW_TEST_TRIALS_A539803B1452 a trecut zece grupuri, passed=true,
cleanup=true. Două intenții diferite pentru același job/generație/pas au avut
exact un câștigător și un conflict 52812. Două retrimiteri concurente identice
au primit același receipt și au creat un singur rând. Triggerul de test care
aruncă 52899 a anulat inserarea complet; după eliminarea lui, aceeași intenție
a putut fi înregistrată. Reaplicarea migrației 010 este idempotentă.

Testele statice focalizate au trecut; auditul a scanat 599 fișiere fără constatări.
Nu sunt încă probate: granturi ale unui login adaptor real, race concurent pe
același intentId între joburi distincte și reconcilierea unui efect extern real.
Migrarea rămâne locală, fără pachet VPS nou sau modificarea gate-ului de execuție.
