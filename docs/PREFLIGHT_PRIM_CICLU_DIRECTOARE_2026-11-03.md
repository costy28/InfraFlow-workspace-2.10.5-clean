# Prim ciclu SQL directoare — verificări și backup, nu execuție

Acest pachet nu conține lansator de modificare a jobului. Ordine:

1. SHA și extragere nouă.
2. preflight-demo-directory-first-cycle.sql: numai citire, schema019–021,
   toate tabelele directoarelor goale și nicio intenție tenant_directories,
   job queued/revizie7/generație3 fără lease și activare, dovadă OS anterioară
   observed_created UID992/GID983, executor/acceptare/delegare corelate.
3. verify-demo-worker-directory-scope.sql: numai metadate, exact cinci RPC.
4. sudo python3 probe-demo-tenant-directories.py --inspect-only: observă NSS
   și jurnalul OS completat, inventariază opt căi fără să creeze nimic.
5. Backup separat COPY_ONLY/CHECKSUM și RESTORE VERIFYONLY, după verificări.

Nicio cerere de lease/intentie/pregătire, nicio parolă nouă, grant sau restart.
VERIFYONLY nu reprezintă test de restaurare efectivă. Dacă starea nu corespunde,
oprește și verifică; nu adapta automat reviziile și nu relua operații vechi.

Execuția ciclului real va fi livrată și confirmată separat. Intenția este să
pregătească numai evidența SQL, fără directoare tenant sau activare. Un lease
eliberat invalidează contextul live; o încercare SQL pregătită astfel este de
review, NU autorizație ulterioară pentru mkdir și NU se reia automat.
