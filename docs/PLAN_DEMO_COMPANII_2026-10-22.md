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

## 9. Progres — persistență sintetică pe laptop

`scripts/lib/demo-trial-store.js` adaugă o magazie de test, permisă exclusiv în
directoare temporare `infraflow-trial-store-*`, nu în instalații reale. Serializează
operațiile prin lock exclusiv între procese, citește starea curentă sub lock,
aplică validatorul/revizia, apoi scrie un fișier temporar cu flush și îl redenumește.
Nu există operații SQL sau provisionare/ștergere de instanțe.

`server/tests/demo-trial-store.test.js` folosește procese Node separate pentru:
trialuri distincte fără pierdere de date, conflict pe aceeași revizie, retry
identic fără audit duplicat și două companii concurente pe aceeași aprobare.
Mai verifică refuzul registrului corupt, lockul abandonat, directoarele reale
și păstrarea exactă a fișierului când o comandă este refuzată.

Limite explicite: aceasta este o magazie locală de test, nu backendul final al
control plane-ului. Nu este validată pentru NFS/SMB, pană de curent, ACL-uri de
producție sau recuperarea unui lock abandonat. Un crash cu lock existent cere
diagnostic manual; nu se folosește timeout-ul pentru a fura lockul. Închiderea
procesului după rename și înainte de răspuns se tratează prin retry-ul aceleiași
comenzi persistate, nu prin repetarea unor efecte externe.

Nu există autentificare reală în această interfață; actorul din model rămâne o
intrare de test. Nu este încă gateway, worker ori registru de producție. Etapa
următoare este proba cu două instanțe sintetice separate și verificări negative
de acces, nu expunerea magaziei de test pe internet. Nu se schimbă runtime-ul
ERP sau arhivele 2.12.735.

## 10. Progres — două instanțe reale de aplicație pe laptop

Proba opt-in:
`INFRAFLOW_TEST_TWO_DEMOS_SQL=1 node --test server/tests/demo-two-instances.test.js`.
Rezultat: **1/1 trecut, 24 cereri HTTP**, aproximativ 176 secunde.
Baze sintetice distincte: `INFRAFLOW_TEST_DOCS_94EA4CB15A4B` și
`INFRAFLOW_TEST_DOCS_1BD59D3877D5`.

Două copii temporare ale runtime-ului real `server/app.js`, două porturi loopback,
storage și APP_KEY proprii, licențe sintetice semnate exclusiv pentru fiecare
copie. Același username și UUID de administrator există intenționat în ambele,
dar parolele și sesiunile diferă. Scheduler oprit, fără integrări externe.

Verificări A → B și B → A:

1. Tokenul celeilalte instanțe este refuzat în sesiune, document și download (401).
2. Parola administratorului celeilalte instanțe nu autentifică utilizatorul local.
3. Administratorul local citește numai documentul propriu; UUID-ul străin nu
   permite citire sau editare (404), nici cu același UUID de utilizator.
4. Linkul fișierului model din cealaltă companie nu funcționează cu tokenul local;
   fișierul propriu se descarcă și este identic octet cu octet.
5. Oprirea procesului A lasă sesiunea și documentul B funcționale și nemodificate.
   Ambele procese sunt oprite în `finally`; copiile/bazele sintetice sunt păstrate.

Limite: pregătirea instanțelor este în harness, nu prin registru/provisioner de
producție. Conexiunile SQL folosesc identitatea Windows a testului, nu identități
SQL dedicate cu ACL verificate. Nu s-au probat izolarea OS, gateway-ul, cookie-uri
pe hostname-uri distincte, linkuri publice fără autentificare, toate modulele,
expirarea live sau ștergerea reală a instanței A. Backendul este MSSQL app_state,
cu modul relațional extins oprit. Acest rezultat nu certifică multi-tenant public.

Următorul pas rămâne rolul de administrator al companiei și configurarea inițială
protejată. Testul de față a folosit intenționat superadmin local pentru atacurile
negative între procese; acesta nu este rolul ce va fi acordat solicitantului Demo.
Nu s-a schimbat runtime-ul ERP și nu s-au regenerat pachetele 2.12.735.

## 11. Progres — contractul administratorului și al setup-ului

Model offline: `scripts/lib/demo-company-setup.js`. Rol propus minimal
`demo_company_admin`, cu permisiuni operaționale explicit enumerate, fără
`settings:manage`, `users:manage`, `system:view`, `audit:manage` sau superadmin.
Testul folosește motorul real `authHasPermission` pentru a verifica aceste
refuzuri. Nu s-a instalat rolul implicit în ERP sau în Demo-ul public.

Setup-ul propus separă profilul de module și finalizare. Profilul acceptă numai
nume companie, țară, locale, monedă și fus orar. Modulele trebuie să se afle în
lista permisă furnizată de serviciu și în catalogul canonic. Nu acceptă licență,
termen, roluri, utilizatori ori APP_KEY. Reluarea profilului păstrează modulele;
finalizarea cere pașii anteriori și nu modifică registrul sau cele 15 zile.

`demo-company-setup.test.js`: **6/6**; împreună cu registrul și persistența
sintetică: **21/21 teste trecute**. Verifică și proprietar/companie greșite,
rol suplimentar privilegiat, cont inactiv, expirare exactă și revizie veche.
Țara/moneda sunt verificate sintactic, nu prin validarea completă a tuturor
jurisdicțiilor; alegerea lor nu activează automat reguli fiscale noi.

Limită importantă: contextul, proprietarul, starea setup și lista de module sunt
intrări de test considerate de încredere. Nu sunt autentificare sau autorizare
server-side livrată. Clientul viitor nu va putea transmite aceste valori ca
autoritate; ruta trebuie să le derive din sesiune/registrul persistent. Progresul
setup nu este încă legat tranzacțional de magazie. Rolul minimal nu reprezintă
încă administrarea completă a angajaților/invitațiilor/fluxurilor companiei.

Pasul următor: adaptor HTTP numai în instanța sintetică, cu autentificare reală,
progres persistent și verificări negative, înainte de UI-ul wizard-ului. Runtime-ul
2.12.735 și pachetele existente nu se schimbă în această etapă.

## 12. Progres — adaptor HTTP cu autentificare reală și progres persistent

Adaptor exclusiv sintetic în `scripts/lib/demo-company-setup-router.js`, montat
numai de `server/tests/support/demo-setup-http-server.js`, nu în `server/app.js`.
Folosește originalele `auth-routes` și `requireAuth`: parolă verificată real,
token opac și Map de sesiuni în proces. Compania este legată în configurația
serverului, proprietarul/lista modulelor se citesc din registrul pe disc, iar
identitatea curentă vine din sesiune. Browserul poate transmite numai pasul,
inputul și revizia așteptată. Ora este stabilită de server.

Magazia sintetică salvează profilul, modulele, revizia setup și auditul minimal
al pașilor în aceeași secțiune protejată de lock. Refuzurile nu salvează progres.
Bindingul setup nu este expus prin HTTP. Nu sunt scrise setările ERP: finalizarea
acestui contract nu aplică încă profilul/modulele în baza aplicației.

Proba `demo-company-setup-http.test.js`: **18 cereri HTTP, două procese succesive,
test trecut**. Verifică lipsa autentificării, parola greșită, alt proprietar cu
același rol, context/termen falsificate în body, revizie învechită, modul nepermis,
reluarea după restart, refuzul tokenului vechi, finalizarea și refuzul unui trial
în starea expired cu sesiune încă validă. Termenul trialului nu se modifică.
Nu s-a avansat ceasul pentru proba HTTP; limita exactă de timp rămâne testată
separat în model. Suita combinată setup/registru/magazie: **22/22 trecute**.

**Blocaj de securitate descoperit:** normalizarea legacy din `core/db.js` promovează
un utilizator când lipsește un superadmin activ. Prima rulare a testului a fost
refuzată deoarece proprietarul fusese promovat și nu mai corespundea rolului
restrâns. Fixture-ul are acum un cont tehnic sintetic superadmin distinct, cu
parolă aleatoare necunoscută solicitantului, pentru a verifica restul traseului.
Aceasta nu rezolvă promovarea automată pentru produs. Nu trebuie presupus că
poate fi livrat un trial fără tratarea explicită a acestui comportament și a
recuperării administrative; nu se introduc conturi ascunse cu parole comune.

Limite: server Express de test cu JSON temporar și magazie locală, nu runtime-ul
complet `app.js`/MSSQL și nu un serviciu public. Fără creare automată de instanțe,
invitații reale sau UI wizard. Adaptorul verifică `NODE_ENV=test`; aceasta este
doar o barieră de harness, nu mecanism de autorizare de producție.

Următorul pas: rezolvarea controlată a promovării legacy pentru instanțele Demo
private și verificarea rolului restrâns în runtime-ul complet, înainte de UI.
Nu s-a modificat runtime-ul instalat și nu s-au regenerat pachetele 2.12.735.

## 13. Corecție 2.12.736 — fără promovarea automată a rolului restrâns

`server/core/bootstrap-admin-policy.js` centralizează politica folosită de
normalizarea DB și helperul setup. Rolul rezervat `demo_company_admin`, principal
sau suplimentar, este exclus din candidații recuperării automate. Username-ul
`admin` nu ocolește excluderea. Recuperarea legacy a celorlalți utilizatori și
administratorii expliciți existenți rămân neschimbați. Nu se introduc conturi
tehnice sau parole predefinite și nu se retrogradează conturi deja superadmin.

Proba HTTP de setup trece acum fără contul tehnic din fixture: **18 cereri,
două procese succesive**. Suita locală combinată: **44/44 teste trecute**.
Varianta restrânsă a probei cu două instanțe `app.js`/MSSQL a trecut:
**26 cereri HTTP**, circa 200 secunde, baze sintetice
`INFRAFLOW_TEST_DOCS_EF8989772A4A` și `INFRAFLOW_TEST_DOCS_EB344116075F`.
Ambele instanțe au numai administratorul restrâns, fără superadmin tehnic.
Sesiunile declară rolul rezervat și nu includ drepturile de setări, utilizatori,
sistem sau audit administrativ. Probele de acces negativ dintre companii și
funcționarea lui B după oprirea lui A au trecut. Procesele sunt oprite.

Pentru proba fișierelor, rolul fixture-ului primește suplimentar dreptul local
`documents:templates`; aceasta nu modifică rolul minimal propus pentru solicitant.
Backend: MSSQL app_state, fără modul relațional extins. Limitele SQL/OS/gateway
descrise anterior rămân. Build React și audit 457 fișiere/zero constatări trecute.

UPDATE 756, versiune 2.12.736: schimbare runtime limitată la politica de bootstrap.
Nu activează setup-ul sintetic în aplicație, nu configurează control plane-ul și
nu elimină automat roluri deja elevate. Un trial fără superadmin local necesită
în continuare procedură de recuperare a operatorului, care nu este implementată
prin acest patch. Instalațiile reale nu sunt repornite sau actualizate aici.

## 14. Interfață wizard sintetică — verificată în Chrome

Pagină de dezvoltare separată: `client/synthetic-demo-setup.html` și componentele
din `client/synthetic/`, fără rută în App, meniu, service worker sau auth context
ERP. Folosește controalele și tema comune. Preview-ul de test configurează Vite
și Tailwind numai pentru această intrare și proxy numai spre API-ul sintetic.
Nu adaugă dependențe aplicației; proba folosește Playwright disponibil extern.

Pași: profil companie → module permise citite de la server → sumar/confirmare.
Tokenul sintetic are cheie sessionStorage distinctă de ERP. Termenul vine din
registru și nu este editabil. Finalizarea afișează explicit că este progres de
test salvat, nu aplicarea profilului/modulelor în ERP.

`demo-company-wizard-browser.test.js` a trecut în Chrome headless: login real,
parolă greșită, pași salvați, refresh/reluare, selecții păstrate, conflict de
revizie și reîncărcare explicită, confirmare persistentă și refuz la expirare.
Capturile desktop/mobile au fost inspectate; la 390 px nu există overflow
orizontal. Prima captură a arătat lipsa stilurilor în harness, corectată prin
configurarea Tailwind/CWD de preview, fără schimbarea configurației de producție.

Capturi: `installer/output/qa/demo-wizard-profile.png` și
`installer/output/qa/demo-wizard-mobile.png`. Date exclusiv sintetice.
Regresie API/model/magazie: 15/15 în rularea focalizată, fără teste sărite.
Build obișnuit trecut: **120 fișiere dist comparate identic cu ZIP-ul 2.12.736**;
HTML-ul sintetic este absent din dist. Nu se reconstruiesc arhivele existente.

Limite: backend JSON și registru temporar, nu setup montat în `app.js`/MSSQL.
Tokenul de activare/invitația nu sunt conectate, nu există conturi trial reale,
provisioner public sau aplicare atomică a configurației în ERP. Modelul de țară
nu certifică legislația locală, iar selecția modulelor nu creează încă date ERP.
Procesele preview/API și browserul sunt închise în finally, datele temporare sunt
eliminate numai din directorul sintetic verificat.

Următorul pas: aplicarea controlată, idempotentă, a configurației confirmate în
instanța sintetică proprie, cu audit și refuzul modificării licenței/expirării;
abia apoi integrarea invitației și a provisionării. Demo-ul public rămâne intact.
