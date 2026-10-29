# Probă unică worker pe VPS

Utilizatorul a confirmat identitatea worker UID 994/GID 985, fără home/login și
refuzul deschiderii celor opt secrete/configurații operator/ERP. Driverul este
lizibil. Aceasta nu dovedește încă izolarea completă a viitoarelor instanțe.

Pachetul worker-check-v1 pregătește numai fișiere root-owned 0755/0644 și legătura
read-only către driverul existent. Nu montează servicii, nu citește/scrie parole,
nu face restart și nu preia joburi. Nu se rulează npm sau alte instalatoare.

Executarea ulterioară necesită snapshot SQL proaspăt și confirmare separată.
CLI cere --lease-cycle-confirmed, UUID job și revizie exactă. Rulează exclusiv
Linux UID 994/GID 985, prin unitatea tranzitorie infraflow-demo-lease-check cu
LoadCredential lease-sql-password din sursa root-only existentă. Nu se acordă
acces direct la fișierul sursă și nu se modifică permisiunile credentialelor systemd.

Un ciclu normal claim/verify/renew/verify/release întoarce jobul queued, crește
revizia cu 3 și generația cu 1. execution_ready rămâne 0; compania nu este activată,
nu se creează resurse și nu încep cele 15 zile. Progresul afișat nu este jurnal
durabil de provisioning. Nu există daemon, timer sau auto-retry.

Orice eroare sau întrerupere se tratează ca rezultat neconfirmat. Nu relua comanda:
verifică starea SQL și expirarea lease-ului. RuntimeMaxSec nu garantează release.
Tokenul privat rămâne numai în memorie și nu apare în output/argumente.

Starea reală VPS înainte de probă rămâne de reverificat: job
00f612ed-a8ac-4688-a26f-679760eee0be, queued, revizie 0, generație 0; compania
b1100b43-48d0-42fa-8a1d-73b1286f8242 queued/revizie 1/neactivată.
