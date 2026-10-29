# Probă systemd cu credentială-canар — adaptor

Precondiție confirmată de utilizator pe VPS: infraflow-demo-adapter-review are
UID 993/GID 984, nologin, /nonexistent, fără grupuri suplimentare. Cele opt fișiere
operator/ERP sunt refuzate la deschidere; driverul MSSQL este lizibil.

Pachetul nu instalează un serviciu permanent. Creează un director temporar nou
/run/infraflow-adapter-credential-probe-* și o unitate tranzitorie proprie
infraflow-demo-adapter-credential-check.service, numai dacă numele este absent.
Nu oprește/repornește unități existente și nu aplică migrări/granturi SQL.

Canarul este un șir public fix de 32 bytes, fără valoare secretă. Fișier-sursă
root-only într-un subdirector 0700; systemd îl livrează prin LoadCredential.
Serviciul rulează ca adaptorul 993:984, cu NoNewPrivileges, ProtectSystem=strict,
ProtectHome, PrivateNetwork și limite de resurse. Nu are conexiune SQL sau parole
reale. Proba este explicit opt-in --canary-probe-confirmed, sudo și Python -B.

Copilul verifică UID/GID/grupuri, refuzul deschiderii sursei și citirea copiei din
CREDENTIALS_DIRECTORY. Metadata acceptă numai fișier regular, un link, 32 bytes,
root:root 0440 (systemd ACL) sau UID993 0400, fără biți speciali. Nu modifică
permisiunile fișierelor livrate de systemd și nu afișează valoarea canarului.

Cleanup numai după confirmarea opririi/absenței unității: unlink pentru cele două
fișiere exacte și rmdir directoare goale, fără ștergere recursivă. Dacă unitatea
este încă activă/incertă sau apare conținut neașteptat, păstrează resursele pentru
review. Nu relua automat la eroare; nu se folosește stop/reset pe servicii străine.

Marcaje așteptate: ADAPTER_SYSTEMD_CANARY_OK, ADAPTER_CANARY_CLEANUP_OK,
NO_SQL_NO_REAL_SECRETS_NO_EXISTING_SERVICE_RESTART.

Testele locale pe Windows verifică logica și comanda, nu executarea systemd.
Acceptanța socket-activation a receptorului complet și autentificarea SQL prin
credentiala reală rămân separate. Schemele 010–012 nu se aplică prin acest pachet.

Confirmare VPS primită: ADAPTER_SYSTEMD_CANARY_OK, ADAPTER_CANARY_CLEANUP_OK și
NO_SQL_NO_REAL_SECRETS_NO_EXISTING_SERVICE_RESTART. Livrarea credentialei-canар
și izolarea sursei sunt validate pentru adaptorul 993:984, nu încă socket activation.
