# Demo privat pe companie — plan de implementare

Data: 22 octombrie 2026. Bază tehnică: 2.12.735.
Stare: **proiectare; nu este implementat sau activat pe Demo-ul public**.

## 1. Ce am constatat în cod

1. `server/shared/commercialDemo.js` recunoaște instalația Demo după numele bazei
   și profil, nu un tenant separat pentru fiecare solicitant.
2. `server/core/db.js` folosește conexiune, pool și snapshot pentru o instalație.
   Marcarea `demoOwnerId` la scriere nu filtrează toate citirile/configurațiile.
3. `server/core/demo-data-lifecycle.js` și acțiunea din `users-routes.js` elimină
   doar datele marcate; documentația existentă păstrează explicit datele comune
   și istorice. Aceasta nu este ștergerea unei companii complet izolate.
4. `completeInitialSetup` din `server/core/setup.js` creează superadmin, înlocuiește
   `db.users` și acceptă parametri comerciali de trial. Nu poate fi reutilizat
   ca atare într-un Demo comun sau expus pentru a controla termenul trialului.
5. Proba de recuperare izolată pe laptop a trecut pentru SQL, fișier model,
   APP_KEY și 2FA. Nu demonstrează încă orchestrarea mai multor instanțe.

## 2. Arhitectura recomandată pentru primul pilot

**O companie Demo = o instanță dedicată**: proces Node, bază SQL, director storage,
APP_KEY, sesiuni și configurație de runtime distincte. Codul și pachetele Ajutor
pot fi distribuite din același release, dar nu setările/datele mutabile.

Nu introducem acum tenant switching într-un singur proces: cache-urile, pool-ul,
sesiunile, căile de fișiere și rutele legacy nu sunt pregătite pentru acest model.
Nu sunt suficiente un `companyId` în UI ori filtre pe înregistrările noi.

| Resursă | Control | Acces solicitant |
| --- | --- | --- |
| Registru trialuri, termen, rutare | Serviciu administrativ separat | Niciun acces direct |
| Bază SQL a companiei | Provisioner + identitate runtime dedicată | Numai prin API autorizat |
| Storage / APP_KEY | Director și ACL per instanță | Descărcări doar pe entitate |
| Proces / port loopback | Supervisor | Fără administrare OS |
| Profil, module, fluxuri, utilizatori ai companiei | Instanța Demo | Rol limitat de administrator companie |
| Update, restore, conexiuni DB, secrete globale | Operator InfraFlow | Interzis |

Separarea în baze/procese nu înlocuiește ACL-urile OS și SQL. Contul runtime nu
trebuie să poată citi bazele/directoarele vecine. Migrările/provisionarea folosesc
o identitate administrativă separată, cu privilegii care nu ajung în procesul web.
Orchestratorul nu primește comenzi shell, căi sau nume SQL arbitrare de la client.

Hostname distinct și token/sesiune proprii per instanță. Gateway-ul rezolvă numai
hostname-uri înregistrate, nu un URL/port trimis de browser. Se verifică explicit
audiența ticketelor și protecțiile pentru linkuri publice/atașamente între instanțe.

## 3. Parcursul solicitantului

1. Solicitare și aprobare în fluxul WordPress existent.
2. Job idempotent pregătește instanța; la eșec nu se trimite invitație funcțională.
3. Link de activare unic, cu expirare, legat de trial; solicitantul alege parola.
4. Prima activare stabilește termenul de **15 zile** pe server, o singură dată.
   Reautentificarea, reluarea wizard-ului și recrearea conturilor nu îl prelungesc.
5. Wizard reluabil: profil companie → limbă/țară/monedă → module → configurare
   minimă pe module → exemple opționale → sumar și Dashboard.
6. Datele proprii persistă până la termen. Superadminul platformei poate prelungi
   trialul prin operație auditată; solicitantul nu poate modifica termenul.

Wizard-ul este pentru **compania trialului**, nu o configurație globală nouă la
fiecare utilizator. Utilizatorii invitați ulterior împart compania și termenul ei.
Fiecare solicitare aprobată distinctă primește o companie separată; emailul nu
este singura cheie de deduplicare. Retry-ul aceleiași aprobări nu creează duplicate.

Se refolosesc controalele/validările potrivite din wizard-ul existent, nu handlerul
care înlocuiește utilizatorii. Configurarea este autorizată de invitația trialului
și apoi de rolul companiei, nu de o rută setup publică rămasă deschisă.

## 4. Permisiuni și efecte externe

Administratorul companiei nu este `superadmin` al platformei. Are o listă explicită
de operații de configurare permise, aplicată și în API. Nu primește dreptul de
update, restaurare arbitrară, configurare DB sau editare a licenței/expirării.

Pentru pilot: SMTP/IMAP, Oblio, ANAF, WhatsApp, GPS și scheduler-ele cu efecte
externe sunt dezactivate implicit în trial. Nicio credențială a firmei noastre nu
intră în seed. Activarea unui sandbox se aprobă separat; nu emitem documente reale.
Invitația inițială este trimisă controlat de serviciul platformei.

## 5. Expirare și ștergere automată

Stări persistente propuse:

`queued → provisioning → awaiting_activation → active → expired → purge_pending → purging → deleted`

Eșecurile de provisionare/ștergere se înregistrează separat și permit retry
idempotent; nu declarăm `deleted` dacă au rămas resurse.

1. La `now >= expiresAt`, API-ul și gateway-ul refuză accesul, inclusiv sesiuni
   existente, linkuri publice și downloaduri. Ceas server UTC, nu ora browserului.
2. Se închid sesiunile și se oprește procesul. Trialul intră în coada de ștergere;
   accesul nu continuă dacă worker-ul este temporar indisponibil.
3. Worker-ul reverifică termenul/starea sub lock. O prelungire admisă înainte de
   ștergere anulează jobul vechi; nu poate concura cu o ștergere deja începută.
4. Se șterg numai resursele nominalizate în registru și dovedite ca aparținând
   trialului: baza, storage, cheia, runtime, rutarea și copii temporare/backupuri.
5. Auditul central păstrează numai dovada operației și identificatori minimali,
   nu conținutul bazei. Leadul WordPress are o politică separată; nu îl ștergem
   implicit când expiră trialul.

Intenția utilizatorului este ștergere după expirare, fără reset zilnic. Nu introducem
o perioadă ascunsă de retenție. Intervalul worker-ului și politica pentru backupuri
se stabilesc explicit înainte de activare și se comunică în pagina trialului.
Nicio ștergere automată nu este activată prin acest document.

## 6. Ordinea de execuție

1. **Fundație locală:** contract registru trialuri, validări și mașină de stări;
   fără provisionare, rutare publică sau ștergere pe serverul existent.
2. **Două instanțe sintetice pe laptop:** baze/procese/storage/chei diferite;
   verificare negativă A → B pentru API, fișiere, linkuri și sesiuni.
3. **Rol administrator companie și setup protejat:** validări server-side,
   progres persistent, retry și protecție împotriva schimbării termenului.
4. **Wizard:** UI cu pași reluabili, exemple opționale și acces doar la modulele
   selectate. Nu șterge lucrul utilizatorului la reluare.
5. **Lifecycle testat cu ceas sintetic:** activare, 15 zile, prelungire, expirare,
   job repetat, eșec intermediar și ștergerea numai a instanței expirate.
6. **Pilot Linux:** numai după măsurarea RAM/CPU/spațiului pe VPS, alegerea limitei
   de trialuri simultane și configurarea identităților/ACL-urilor. Nu promitem
   capacitate nelimitată. La limită, cererea rămâne în coadă cu mesaj explicit.

Demo-ul comun actual și conturile existente nu sunt migrate sau șterse automat.
Trecerea lor la spații private este o operație separată, cu copie de siguranță și
alegere explicită a datelor; datele comune fără proprietar sigur nu se repartizează
prin presupuneri. Nu schimbăm acum arhivele 2.12.735.

## 7. Criterii de acceptare înainte de utilizare publică

1. A nu poate citi/modifica datele, setările sau fișierele lui B, nici ca admin local.
2. Trialul nu poate atinge control plane-ul, sistemul de update sau baza comună.
3. Termenul este unic pe companie; wizard-ul nu îl resetează.
4. Expirarea blochează accesul chiar dacă worker-ul de ștergere nu rulează.
5. Retry-urile nu creează instanțe duplicate și nu șterg o instanță prelungită.
6. Ștergerea A lasă B funcțional, cu datele și fișierele identice.
7. Oprirea/pornirea serviciilor păstrează progresul și nu reînvie trialuri șterse.
8. Backupurile, secretele și integrările externe respectă politica trialului.

## 8. Progres — fundație offline, 22 octombrie

Implementat separat în `scripts/lib/demo-trial-registry.js`, fără import în
runtime: contract v1 serializabil, identități/resurse derivate determinist,
aprobare idempotentă, tranziții, activare unică de 15 zile, prelungire,
expirare și confirmări abstracte de eliberare a resurselor. Datele de intrare
nu sunt mutate; istoricul și identificatorii comenzilor sunt păstrați.

`server/tests/demo-trial-registry.test.js`: **7/7 teste trecute** pentru retry,
revizie veche, termen exact, prelungire versus job vechi, refuzul operațiilor
adminului de companie în model, eșec de ștergere și păstrarea trialului vecin.
Validarea registrului refuză resurse reatribuite sau istoric incomplet.

Acesta NU este încă un registru persistent, un serviciu de autentificare sau
un worker. `actor.kind` este intrare a simulatorului, nu o credențială. Revizia
este verificată în memorie; CAS/lock tranzacțional și unicitatea între procese
trebuie implementate la persistență. Confirmările `released` sunt doar contractul
viitorului worker, nu dovada ștergerii reale. Funcția de acces nu este conectată
la gateway/API. Nu se creează/șterge nicio bază, cheie, cale sau instanță.

Următoarea etapă: persistență izolată a registrului cu verificare atomică a
reviziei și retry concurent, înainte de legarea provisionerului pentru două
companii sintetice. Nicio migrare/activare pe Demo-ul existent și nicio versiune
runtime nouă; arhivele 2.12.735 rămân neschimbate.
