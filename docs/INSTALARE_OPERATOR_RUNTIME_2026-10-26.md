# Operator runtime privat — etapă controlată

## Scop și limite

- Probe VPS precedente confirmate: autentificare parolă/TOTP, consultare și logout
  prin `infraflow_demo_auth`, fără SA.
- Noul pachet montează runtime-ul în serviciul privat existent pe loopback 4280.
- Nu există rute de login publice, UI, creare de companii sau provisioning.
- `/health/operator` citește contul prin procedură și verifică decriptarea cheii;
  nu consumă TOTP și nu dovedește încă autentificarea prin HTTP.
- `/health/ready` rămâne intenționat 503. ERP-ul pe 4180 nu este repornit.

## Credenziale

Se păstrează cheia existentă root:root 0600, fără regenerare. Instalatorul cere
UUID-ul operatorului și parola SQL EXISTENTĂ `infraflow_demo_auth`, cu confirmare.
Nu cere SA, parola operatorului sau TOTP. Creează exclusiv două fișiere root 0600:
`/etc/infraflow-demo-platform/operator-sql.password` și `operator-id`.

Drop-in-ul nou 30-operator-runtime.conf folosește trei `LoadCredential=`. Datele
nu sunt incluse în argumente sau variabile de mediu. Copiile runtime sunt citite
din `/run/credentials/infraflow-demo-platform.service`, cu validare de fișier
regulat, UID neprivilegiat, mode 0400, un singur link, fără urmărire symlink.

Referință oficială:
[systemd.exec — Credentials](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials).
Implementarea reală și metadatele pe systemd 255 trebuie confirmate pe VPS.

## Instalare și revenire

1. Transfer și SHA-256, urmate de confirmarea explicită înainte de instalare.
2. Extragere într-un director temporar nou. Nu se rulează npm și nu se atinge ERP.
3. `sudo python3 scripts/linux/install-demo-platform-operator-runtime.py --install-confirmed`
   din pachetul extras (folosește calea absolută dacă directorul curent diferă).
4. Preflight verifică identitatea serviciului și reader health, refuză ținte deja
   existente. Creează release separat `operator-runtime-v1`, cu driverul existent
   al platformei referit prin symlink root-owned; nu folosește dependențele ERP.
5. Verifică SQL/cheie fără TOTP, apoi repornește DOAR infraflow-demo-platform.
6. Confirmă health operator și SQL. Dacă activarea eșuează, elimină doar drop-in-ul
   creat de această invocare și încearcă revenirea la reader-ul anterior.
7. La orice eșec: nu relua automat. Release-ul și credentialele rămân pentru
   diagnostic; nu există ștergere automată sau suprascriere de fișiere existente.

Testele Python locale pe Windows verifică generarea configurației și crearea
exclusivă; O_NOFOLLOW și permisiunile Linux necesită acceptanță VPS. Nu se declară
livrare sau instalare reușită doar pe baza testelor locale.

## Diagnostic real și corecție systemd 255

Prima activare a eșuat; ROLLBACK_READER_OK confirmat, ambele servicii healthy.
Proba temporară a putut deschide credentialul, dar validatorul a respins uid=0,
mode=0440, nlink=1. Nu este o eroare de parolă. Grupul nu fusese afișat.

Sursa oficială v255, `src/core/exec-credential.c`, `write_credential`, preferă
fișier root cu ACL_READ pe UID-ul serviciului și folosește proprietarul serviciului
ca fallback când ACL nu este suportat. Masca ACL apare ca group-read în stat.
Referință: https://github.com/systemd/systemd/blob/v255/src/core/exec-credential.c

Validatorul acceptă acum exact UID serviciu/0400 sau root:root/0440, fără biți
speciali, fără hardlink/symlink și fără acces others. Nu acceptă root:alt-grup/0440.
Citirea runtime rămâne la calea fixă systemd. Nu se modifică permisiuni manual.

Pachetul de probă v2 creează release separat, păstrează v1 intact și folosește o
unitate tranzitorie cu LoadCredential și hardening pentru SQL read-only. Nu
înlocuiește drop-in-uri, nu repornește serviciile existente, nu cere parole noi
și nu consumă TOTP. Metadatele UID/GID/mode se afișează fără conținut de fișiere.
24/24 teste Node locale trecute, sintaxă Python/Node verificată; proba Linux reală
urmează. Acceptanța grupului root și a întregului flux rămâne neconfirmată pe VPS.

Confirmare VPS ulterioară: toate cele trei credentiale root:root/0440/nlink=1,
OPERATOR_RUNTIME_SYSTEMD_PROBE_OK și PROBE_COMPLETE_NO_EXISTING_SERVICE_RESTART.
Activarea separată a release-ului v2 a fost confirmată ulterior prin
OPERATOR_RUNTIME_ACTIVATED, OPERATOR_HEALTH_OK și SQL_READER_HEALTH_OK.
Doar serviciul privat a fost repornit; nu s-a consumat TOTP.
