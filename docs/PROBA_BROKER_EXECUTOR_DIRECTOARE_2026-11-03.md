# Executor directoare — broker izolat, proba numai metadate

Release nou /opt/infraflow-demo-platform/releases/directory-executor-broker-v1.
Unitate tranzitorie infraflow-demo-directory-executor.service, DynamicUser
infraflow-directory-exec. Sursă secret existentă directory-executor.password,
root600, livrată prin LoadCredential sub numele sql-password. Nu se cere
parolă SQL și nu se modifică sursa. Driverul existent este reutilizat.

Preflight verifică destinația absentă, părinții root fără scriere group/other
și fără symlink, metadatele secretului și unitatea/identitatea temporară libere.
Node --check verifică cele cinci fișiere sursă. Nu face SQL sau scrieri.

După confirmare pregătește cod root755/644 și execută numai init cu binding
sintetic, check și shutdown. Niciun context/report/RPC real nu este executat.
Check verifică autentificarea și exact cele două drepturi SQL ale executorului.
Nu folosește încercarea generație4 închisă pe VPS.

Brokerul operațional permite numai init/check/context/report/shutdown, cu
binding și receipt stricte prin clientul dedicat. Nu are lease, comenzi OS
sau SQL arbitrar. Eroarea oprește canalul fără retry sau raport compensatoriu.

Lansatorul: fără capabilități, ProtectSystem strict, ProtectHome, PrivateTmp/
Devices, rețea localhost, RuntimeMaxSec120. Pipe limitat4096/deadline25; stop
al unității numai când InvocationID este confirmat, nu după nume singur.

Nu creează joburi/directoare tenant/conturi și nu repornește servicii existente.
Eșecul păstrează release-ul parțial pentru review; nu relua și nu șterge automat.

Teste locale: broker/client și protocol cu driver simulat, lansator Python
cu substituenți, sintaxă JS/Python și probă de allowlist init/check. Proba
reală SQL/systemd rămâne de confirmat pe VPS; acestea nu creează directoare.
