# Pachet schema adaptor 010–012 — aplicare controlată

Conține trei migrări locale probate nativ, un preflight numai citire și un script
de backup separat. Nu conține instalator automat, runtime, parole, granturi,
creare login sau comenzi de job. Nu repornește platforma ori ERP-ul.

1. Transfer și verificare SHA-256 a arhivei.
2. Extrage într-un director nou din home; nu aplica încă migrările.
3. Preflight cu SQLCMD/SA pe INFRAFLOW_DEMO_PLATFORM: baseline 009, schema nouă
   absentă, jobul pilot queued/revizie 3/generație 1/execution_ready=0, fără lease,
   compania queued/revizie 1/neactivată, șapte rezervări și un audit.
4. Backup explicit COPY_ONLY CHECKSUM, nume unic în /var/opt/mssql/data și RESTORE
   VERIFYONLY CHECKSUM. Păstrează calea afișată. Nu este probă de restaurare efectivă.
5. Confirmare umană separată înainte de orice migrare. Se aplică 010, apoi 011,
   apoi 012, câte una, cu -b și confirmarea markerului. La eșec nu se continuă,
   nu se reia automat și nu se șterge schema sau resursele parțiale.
6. Verifică migrările, tabelele noi goale și snapshotul jobului neschimbat.
   Drepturile runtime și conturile rămân neschimbate.

010: jurnal de intenții, nu rezultate ale efectelor externe. 011: proiecție de
consultare a rezervărilor. 012: bilete temporare single-use pentru review, nu
autorizație de creare OS/SQL. Toate receipt-urile păstrează executionAllowed=false,
CHECK execution_ready=0 rămâne intact. Nicio perioadă de 15 zile nu începe.

Probe anterioare documentate în workspace: jurnal/concurență/rollback, proiecție
și drepturi negative, bilete/replay/expirare și două loginuri SQL autentificate
temporare. Acestea nu înlocuiesc verificarea drepturilor/credentialelor și proba
completă Linux-systemd-Node-SQL, încă de montat după acceptarea schemei.

Nu schimba parola SA/lease și nu modifica serviciile pentru această aplicare.
Backupul verificat se păstrează; restaurarea nu este automată și ar necesita
decizie separată, deoarece poate elimina modificări ulterioare ale platformei.
