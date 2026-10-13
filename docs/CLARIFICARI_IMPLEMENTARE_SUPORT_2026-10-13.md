# InfraFlow — clarificări pentru conversația „Implementare & Suport”

Data verificării: 13 octombrie 2026  
Versiune sursă verificată: `2.12.684`

Acest document corectează și completează răspunsurile din conversația partajată
„INFRAFLOW – IMPLEMENTARE & SUPORT”. Concluziile de mai jos sunt bazate pe
implementarea curentă din sursă; unde comportamentul depinde de mediul clientului,
este marcat explicit ca test de acceptanță, nu ca garanție generală.

## 1. Modelul On-Premise recomandat

**Răspuns corectat:** model mixt, dar cu o delimitare obligatorie în fișa de
implementare.

- Clientul furnizează și administrează infrastructura: hardware/VM, sistem de
  operare licențiat, rețea, firewall, spațiu, redundanță și accesul tehnic aprobat.
- InfraFlow instalează și configurează aplicația, conexiunea la SQL Server,
  serviciul de pornire, modulele și mecanismul aplicației de backup/update.
- Administrarea SQL Server și a copiilor externe revine părții nominalizate în
  contract. Nu trebuie presupus automat că este responsabilitatea InfraFlow.
- Pentru clienții fără personal IT, administrarea infrastructurii trebuie tratată
  ca serviciu separat, cu limite și acces documentate.

Nu este recomandată formula „se stabilește de la caz la caz” fără matrice semnată,
deoarece lasă neclar cine intervine la lipsă spațiu, SQL indisponibil, certificat
expirat sau backup eșuat.

## 2. Poate InfraFlow folosi o instanță SQL Server partajată?

**Da, tehnic este suportat.** Conexiunea permite configurarea separată a
`DB_SERVER`, `DB_DATABASE`, a modului de autentificare și a contului SQL. InfraFlow
poate folosi propria bază într-o instanță în care există și alte baze.

Acceptarea configurației trebuie condiționată de:

1. bază de date distinctă pentru InfraFlow;
2. cont dedicat, cu drepturi limitate la baza InfraFlow;
3. versiune/ediție SQL Server compatibilă și capacitate suficientă;
4. backup și restore testate pentru baza InfraFlow;
5. lipsa modificărilor asupra bazelor celorlalte aplicații;
6. monitorizarea CPU, RAM, I/O, spațiului și a limitelor SQL Server Express;
7. acceptarea de către client a riscului de concurență pentru resurse.

Separarea bazelor oferă izolare logică, nu izolare de performanță. Pentru Hosted
sau pentru un client cu sarcină critică, instanța dedicată rămâne opțiunea mai
predictibilă.

## 3. Cum pornește și cum se recuperează backend-ul?

### Windows

Instalarea curentă folosită în exploatarea On-Premise pornește backend-ul prin
Task Scheduler (`InfraFlow ERP`), sub contul `SYSTEM`, la startup și la logon.
Launcherul `start-server.bat` repornește procesul Node după 15 secunde dacă acesta
se oprește, iar task-ul are suplimentar până la cinci încercări de restart.

În sursă există și instalare alternativă ca serviciu Windows prin NSSM. Pentru o
instalație concretă trebuie consemnat un singur mecanism activ și verificat; nu se
declară generic „Windows Service” dacă instalarea respectivă rulează prin task.

### Linux

Unitatea `infraflow.service` este activată la boot și folosește
`Restart=on-failure`, cu relansare după 5 secunde. Ea pornește după rețea și după
serviciul SQL Server local, atunci când acesta există.

### Ce este confirmat și ce rămâne test de acceptanță

- pornire automată după boot: implementată pe ambele platforme;
- pornire manuală: disponibilă pe ambele platforme;
- relansare după ieșirea procesului: implementată;
- revenire după pană de curent: se verifică pe infrastructura clientului;
- pornire când SQL Server este întârziat/indisponibil: se verifică;
- reconectare după întreruperea SQL: se verifică în test controlat;
- jurnale și alertare la buclă de crash: se verifică înainte de go-live.

Prin urmare, răspunsul corect nu este doar „pornește singur”, ci „mecanismul de
restart există și trebuie probat în mediul livrat”.

## 4. Cum se actualizează InfraFlow în prezent?

### Serverul aplicației

Există două căi controlate:

1. **actualizare manuală din Setări** — ZIP pe Windows și TAR.GZ pe Linux;
2. **actualizare online din catalogul central semnat** — disponibilă conform
   licenței și canalului Stable/Preview, cu descărcare verificată SHA-256.

Aplicarea nu este complet nesupravegheată: un utilizator autorizat verifică
pachetul și confirmă explicit update-ul. Înainte de aplicare se creează backup,
iar serviciul este repornit controlat.

- Pe Linux, workerul systemd aplică pachetul, verifică sănătatea și face rollback
  automat dacă aplicarea eșuează.
- Pe Windows, updaterul creează backup și repornește controlat, dar fluxul curent
  nu trebuie prezentat ca rollback automat echivalent cu Linux. Restaurarea este
  o procedură separată dacă validarea post-update eșuează.

Politica operațională trebuie să păstreze canalul Stable la clienți, Preview numai
intern/demo sau cu acord explicit, fereastră de mentenanță și verificare după
update.

### Clientul desktop Electron

Clientul desktop **nu are în prezent auto-update implementat**. Configurația de
build are `publish: null` și nu folosește `electron-updater`. O versiune nouă a
launcherului Electron se distribuie printr-un installer nou, instalat controlat.

Majoritatea actualizărilor de interfață vin de pe server deoarece Electron încarcă
URL-ul instalației; clientul trebuie actualizat numai când se schimbă launcherul,
configurarea locală, securitatea Electron sau compatibilitatea sa. Versiunea din
`electron/package.json` trebuie sincronizată înaintea următorului pachet complet
de client.

## 5. Corecții de formulare pentru suport și SLA

- P1–P4 și programul L–V 09:00–17:00 sunt implementate în aplicație ca ținte de
  răspuns, nu ca termene garantate de rezolvare.
- O țintă afișată de aplicație nu devine automat SLA contractual. SLA-ul poate fi
  promis numai după validarea acoperirii reale, a canalului de escaladare și a
  perioadelor de indisponibilitate planificată.
- „Update standard inclus” trebuie separat de dezvoltări custom, migrări,
  integrări speciale și intervenții asupra infrastructurii clientului.
- „Backup configurat” nu înseamnă „restaurare garantată”. Go-live cere cel puțin
  o restaurare testată și consemnată.

## 6. Procedură stabilită pentru următoarele implementări

1. se completează matricea de responsabilități Hosted/On-Premise;
2. se consemnează topologia SQL și responsabilul pentru administrare;
3. se verifică autostartul și restartul după oprire controlată;
4. se simulează indisponibilitatea temporară SQL și revenirea;
5. se execută backup și restore de probă;
6. se aplică un update de probă cu verificare post-update;
7. se confirmă separat versiunea și metoda de distribuție a clientului Electron;
8. rezultatele se atașează fișei de acceptanță înainte de go-live.

## Decizii pentru Master

1. On-Premise folosește model mixt, cu responsabilități nominalizate în scris.
2. SQL Server partajat este permis cu bază și cont dedicate, după verificare de
   capacitate și cu riscul de resurse partajate acceptat.
3. Autostartul și recovery-ul sunt funcții implementate, dar fiecare instalare
   trebuie testată înainte de acceptanță.
4. Update-ul serverului este controlat din aplicație/catalog; rollbackul automat
   este confirmat pentru Linux, nu trebuie promis identic pentru Windows.
5. Clientul Electron se actualizează momentan prin installer nou; nu există
   auto-update al clientului desktop.
