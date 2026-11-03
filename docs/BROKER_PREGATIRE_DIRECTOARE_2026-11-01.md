# Broker separat pentru pregătirea directoarelor — local

Fișier: server/demo-platform/directory-preparation-sql-broker.js.
Protocol privat stdin/stdout JSON Lines, mesaje și răspunsuri limitate la
4096 bytes, ID secvențial, envelope exact. Nu ascultă rețeaua și nu execută
comenzi OS sau SQL arbitrar. Comenzi: init(binding), check, prepare(tokens),
shutdown. Nu poate claim/release/renew lease sau înregistra intenții/rezultate.

Init creează clientul separat cu binding imutabil, dar nu face SQL. Check
verifică numai metadate. Prepare face un singur apel parametrizat către
prepare_tenant_directories, cu validarea strictă a receiptului și scope cinci.
Tokenurile nu sunt returnate. O eroare invalidează brokerul, fără retry.
Shutdown așteaptă operația în curs, închide clientul o singură dată și refuză
succesul întârziat. Intrare parțială/supradimensionată sau envelope invalid
închide canalul. Buffer-ele sunt golite; șirurile JS nu au garanție de ștergere.

CLI-ul acceptă numai Linux, fără argumente, INVOCATION_ID canonic, UID994/
GID985 fără grupuri suplimentare și credențiala systemd din calea fixă
/run/credentials/infraflow-demo-directory-preparer.service/sql-password.
Handshake-ul init returnează invocationId pentru corelarea unității.

Nu este instalat pe VPS. Nu schimbă brokerul OS vechi sau checkerul de
metadate deja verificat. Controlul lansării și proprietății unității systemd,
limitarea duratei și legarea la jurnalul persistent trebuie implementate în
portul de lansare înainte de operația reală.

Cinci teste locale cu driver simulat: flux permis, refuz comenzi/reinit,
IPC secvențial fără token în răspuns, mesaje invalide și cleanup la trunchiere
sau depășire. Nu sunt o probă reală SQL/systemd.
