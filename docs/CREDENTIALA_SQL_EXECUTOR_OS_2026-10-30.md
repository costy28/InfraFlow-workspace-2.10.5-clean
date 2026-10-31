# Acreditarea SQL executor — metadata only

VPS a confirmat OS_EXECUTOR_LOGIN_VERIFIED. Parola există în SQL Server, dar nu
este încă instalată ca fișier pentru runtime. Nu o schimbăm în această etapă.

Sursă nouă: /etc/infraflow-demo-platform/os-executor.password, root:root 0600.
Cod nou: /opt/infraflow-demo-platform/releases/os-executor-sql-check-v1, root-owned.
Nu se suprascriu surse/release-uri existente; orice stare parțială cere review.
Driverul este cel deja instalat în sql-reader-v1/node_modules, legat read-only.

Mai întâi parola existentă este confirmată de două ori și trimisă pe stdin privat
unei probe systemd cu DynamicUser. Numai după succes se scrie sursa root-only.
A doua probă folosește LoadCredential și verifică aceeași matrice de drepturi.
Codul SQL exportă doar check/shutdown, fără execute sau apeluri RPC.

Unități tranzitorii:
- infraflow-demo-os-sql-input-check.service, utilizator dinamic infraflow-os-sql-input;
- infraflow-demo-os-sql-check.service, utilizator dinamic infraflow-os-sql-check.

Nu se creează conturi persistente în /etc/passwd sau /etc/group. Numele dinamice
trebuie să fie libere înainte de probă; UID/GID trebuie să fie în intervalul
dinamic. Serviciile au ProtectSystem=strict, ProtectHome, Capabilities goale,
NoNewPrivileges și acces IP limitat la localhost. Nu devin executori de creare OS.

Referință oficială pentru DynamicUser/LoadCredential:
https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
Compatibilitatea efectivă cu systemd 255 pe VPS rămâne de verificat prin probă.

Helper-ul prepare-demo-adapter-review-credential.py este inclus numai pentru
safe/secure_write/validate_password; nu se execută main-ul lui și nu se schimbă
acreditarea adaptorului existent. Nu se folosesc parole în argv sau loguri.
Adminul root rămâne de încredere; nu promitem protecție față de root.

După hash, inventar și confirmare: sudo python3 -B
scripts/linux/prepare-demo-os-executor-credential.py --prepare-confirmed.
Se cere parola SQL EXISTENTĂ infraflow_demo_os_executor, nu SA sau operator.
Nu relua la eroare: codul/sursa parțială rămân pentru verificare, fără ștergere.
Niciun job, delegare, acceptare sau rezultat nu este modificat de aceste probe.

Validare locală: 172 teste Node trecute, patru teste Python pentru preparator,
audit advisory 625 fișiere fără constatări. Testele verifică profilul exact,
transportul fără RPC, concurența/shutdown, metadatele credentialei și bufferul.
Nu afirmă că DynamicUser/LoadCredential a fost deja probat pe VPS pentru acest pachet.
