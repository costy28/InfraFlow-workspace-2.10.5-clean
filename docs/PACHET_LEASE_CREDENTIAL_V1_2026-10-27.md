# Lease credential v1 — probă privată, fără worker

Prerechizite: migrările 006/007 și LEASE_LOGIN_VERIFIED deja confirmate pe VPS.
Pachetul nu creează și nu schimbă parola SQL. Se introduce parola EXISTENTĂ
infraflow_demo_lease, nu parola SA, operator, registrar sau auth.

Instalatorul creează numai:
- /opt/infraflow-demo-platform/releases/lease-check-v1 (cod root-owned);
- /etc/infraflow-demo-platform/lease-sql.password (root:root 0600).

Reutilizează dependențele private din sql-reader-v1, nu dependențele ERP.
Refuză țintele existente, symlink-uri pe calea destinațiilor și părinți neprotejați.
Rulează o singură unitate tranzitorie infraflow-demo-lease-check cu identitatea OS
existentă infraflow-demo-platform și LoadCredential. Procesul verifică metadatele
SQL, apoi se închide. Nu execută claim/renew/release, nu pornește worker și nu
modifică unitatea existentă infraflow-demo-platform sau ERP.

Ordine: transfer → verificare SHA-256 → extragere într-un director nou →
sudo python3 scripts/linux/prepare-demo-platform-lease.py --prepare-confirmed.
Comenzile exacte se dau separat după confirmarea hash-ului.

Succes așteptat: LEASE_SYSTEMD_SCOPE_PROBE_OK, LEASE_SECRET_PREPARED,
NO_RESTART_NO_JOB_CLAIMED.

La eroare nu relua instalatorul: release-ul și secretul pot exista. Nu afișa
conținutul secretului și nu copia stderr brut. Trimite numai etapa/codul generic.
Nu modifica manual fișierele /run/credentials; metadatele root:root 0440 sunt
compatibile cu ACL-urile systemd 255 și sunt validate în runtime.

Validare înainte de transfer: teste Python pure și teste Node pentru runtime.
Proba Linux/systemd reală nu a fost încă executată și rămâne criteriu de acceptare.
