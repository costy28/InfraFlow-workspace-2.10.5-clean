# Transport SQL pentru biletele adaptorului — local, nemontat

adapter-ticket-client.js separă emiterea și consumarea, validează intrări/receipt
exacte și nu întoarce tokenurile. Un singur apel simultan, fără coadă sau retry.
O eroare după commit poate însemna bilet consumat: nu declară lipsa mutației și
nu repetă automat. Shutdown așteaptă apelul în zbor și refuză rezultatul târziu.

adapter-ticket-sql.js fixează loopback 1433, baza platformei, criptarea TLS și
procedura adapter_review_ticket_command. Rolul issuer este numai issue, consumer
numai consume. Parola nu este în command JSON, numai în pool-ul conexiunii.
Tokenul biletului este parametru RPC, nu SQL concatenat sau argument CLI.

Profiluri de metadate explicite:
- issuer / infraflow_demo_lease: EXECUTE lease, record_step_intent, ticket command;
- consumer / infraflow_demo_adapter_review: EXECUTE review projection și ticket command.

Sunt refuzate alte drepturi vizibile pe obiectele platform/operator, drepturi
administrative server/bază, identitate diferită sau acces la ERP-ul existent.
Metadatele runtime nu înlocuiesc auditul administrativ complet de granturi și
probele de acces negativ. trustServerCertificate rămâne configurat explicit;
nu este validare PKI a certificatului, chiar dacă traficul este criptat.

Profilul issuer extinde contractul viitor față de loginul VPS curent. Nimic nu
modifică implicit acel login: runtime-ul vechi rămâne cu verificările vechi.
Nu există LoadCredential nou, transport IPC/HTTP montat ori transmitere către
un executor OS. Acesta este transport SQL separat, nu canal complet end-to-end
între servicii de producție. Toate receipt-urile rămân executionAllowed=false.

Proba nativă folosește loginuri SQL temporare autentificate, cu useri de bază
separați și parole aleatorii numai în memorie. Ea testează clientul cu RPC real
și drepturile SQL. Nu falsifică numele bazei/loginului pentru validatorul fix de
producție: adaptorul de conexiune cu ținta fixă este testat separat prin unități.
VPS-ul, schema și parolele lui nu sunt folosite în această probă.

## Rezultate

138 teste Node trecute; audit 605 fișiere fără constatări.
INFRAFLOW_TEST_TRIALS_E253622EC131: nouă grupuri SQL trecute, passed=true și
cleanup=true. Două loginuri SQL autentificate, fără sysadmin/db_owner, au emis
și consumat biletul prin clientul RPC. Consumatorul nu a primit leaseToken în
payload; refuzate replay-ul, consumul de către worker și accesul consumatorului
la procedura lease. SELECT direct pe bilete și conturi operator, activarea și
drepturile administrative au fost verificate negativ. Jobul a fost eliberat,
execution_ready=0. Ambele loginuri temporare și baza au fost eliminate confirmat.

DEP0123 (TLS ServerName IP) a apărut și rămâne deschis. Nu există încă acceptanță
Linux/systemd pentru noile identități, canal IPC între procese sau instalare VPS.
