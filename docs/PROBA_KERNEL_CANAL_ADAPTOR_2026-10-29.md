# Probă kernel Linux pentru canalul adaptorului

Pachet de verificare, nu instalator. Se rulează explicit prin sudo, Python -B,
cu --kernel-probe-confirmed. Nu cere parole SQL, nu instalează credențiale,
nu aplică migrări, nu schimbă grupuri/conturi și nu pornește/oprește servicii.

Folosește identitatea worker existentă UID 994/GID 985 și un director temporar
nou /run/infraflow-adapter-channel-probe-*. Socket root:985 0660, părinte root:985
0750. Procesele copil își restrâng propria identitate prin setgroups/setgid/setuid;
nu modifică identitatea sau grupurile serviciilor existente.

Probe:
1. Workerul real se conectează; receptorul folosește SO_PEERCRED real din kernel.
2. Procesul root poate traversa ACL, dar este refuzat de verificarea UID-ului.
3. Un proces nobody fără grupul worker este refuzat de permisiunile OS.
4. Workerul cu payload suplimentar leaseToken este refuzat de parser.

Backendul este exclusiv un canar în memorie, cu UUID-uri sintetice și token fix
fără valoare. Nu folosește jobul real și nu cheamă consume/SQL. Succesul nu dovedește
încă socket-activation systemd, identitatea OS a adaptorului, LoadCredential sau
fluxul complet până la SQL. Aceste acceptanțe rămân separate.

Cleanup elimină numai socketul exact și directorul gol creat de probă, fără delete
recursiv. Orice fișier neașteptat ori problemă lasă starea pentru verificare;
nu relua automat la eroare. Procesele copil proprii sunt așteptate sau oprite
individual dacă apare o eroare în timpul schimbului de date.

Rezultate așteptate: KERNEL_PEER_WORKER_ALLOWED_OK, KERNEL_PEER_ROOT_DENIED_OK,
KERNEL_SOCKET_DAC_DENIED_OK, KERNEL_MALFORMED_REQUEST_DENIED_OK,
KERNEL_PROBE_CLEANUP_OK, NO_SQL_NO_CREDENTIALS_NO_SERVICE_RESTART.

Local Windows: teste de siguranță ale harness-ului și protocolului, nu dovadă
SO_PEERCRED Linux. Rezultatul real VPS se consemnează după rularea de utilizator.

## Confirmare VPS primită — 29 octombrie 2026

Utilizatorul a raportat toate cele șase marcaje așteptate: worker permis,
root refuzat de SO_PEERCRED, nobody refuzat de ACL, payload suplimentar refuzat,
cleanup OK și nicio operație SQL/credențiale/restart. Aceasta este dovada kernel
pentru socketul temporar și handlerul cu backend canar. Nu extinde rezultatul la
socket-activation systemd sau la bridge-ul SQL real, încă neinstalate.
