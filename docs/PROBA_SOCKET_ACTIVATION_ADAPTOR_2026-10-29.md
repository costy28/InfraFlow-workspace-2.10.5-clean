# Probă socket-activation systemd — canar, fără SQL

Precondiții VPS confirmate: adaptor 993:984 și worker 994:985; proba kernel a
trecut, iar credentiala-canар a fost livrată adaptorului cu sursa root-only refuzată.

Pachetul creează numai unitățile tranzitorii proprii
infraflow-demo-adapter-activation-check.socket/.service, dacă ambele sunt absente,
și socketul /run/infraflow-demo-adapter-activation-check.sock, dacă este absent.
Fișiere temporare /run/infraflow-adapter-activation-probe-*, fără instalare în /etc.

systemd-run --socket-property pornește numai socketul; serviciul trebuie să fie
inactive până la conexiunea workerului. Prima conexiune activează receptorul
non-root 993:984, primește listenerul pe FD3 și canarul prin LoadCredential.
Verifică LISTEN_PID/FDS, metadata/canар și refuzul sursei înainte de acceptare.
PrivateNetwork împiedică accesul la SQL; listenerul Unix este moștenit de la host.
Backendul rămâne exclusiv canar în memorie, cu UUID-uri sintetice; nu importă SQL.

Workerul primește receipt canar fără autoritate de execuție; root este refuzat de
SO_PEERCRED, nobody de ACL. Proba oprește exclusiv perechea proprie de unități pe
care a creat-o; nu folosește restart, reset-failed sau modificări de conturi.
Cleanup numai după confirmarea opririi/absenței ambelor unități, cu unlink/rmdir
exacte, fără ștergere recursivă. Eșecul parțial păstrează starea pentru review.

Marcaje așteptate:
- SYSTEMD_SOCKET_LAZY_START_OK
- SYSTEMD_ACTIVATED_WORKER_CANARY_OK
- SYSTEMD_SOCKET_ROOT_DENIED_OK
- SYSTEMD_SOCKET_DAC_DENIED_OK
- SYSTEMD_ACTIVATION_CLEANUP_OK
- NO_SQL_NO_REAL_SECRETS_NO_EXISTING_SERVICE_RESTART

Nu validează încă bridge-ul Node, loginul SQL real cu LoadCredential, canalul
clientului Node și nici crearea vreunei resurse tenant. Nu modifică jobul real
sau schema VPS. La rezultat neconfirmat, nu relua automat proba.

Referință oficială: https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html
Socket options nu se combină cu --wait; perechea temporară este oprită explicit
numai de harness-ul care a confirmat crearea ei. Nu se afișează valori de credențiale.

## Confirmare VPS primită

Utilizatorul a raportat toate cele șase marcaje așteptate: socket activ înainte
de serviciu, prima conexiune worker a activat receptorul cu credentiala-canар,
root și nobody refuzate, cleanup complet, fără SQL/credențiale reale/restarturi
existente. Aceasta validează perechea temporară Python-canар, nu bridge-ul Node
cu SQL și nici crearea de resurse tenant.
