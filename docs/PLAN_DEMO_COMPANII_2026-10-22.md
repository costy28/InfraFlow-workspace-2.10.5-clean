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

## 15. Aplicare idempotentă în ERP-ul sintetic

`scripts/lib/demo-company-apply.js` pregătește schimbarea numai pentru un setup
confirmat și un trial activ. Verifică bindingul `settings.demoTrialId`, proprietarul
și rolul actual recitite din ERP, revizia setup și modulele permise. Revalidează
profilul/modulele înainte de aplicare. Nu preia câmpuri suplimentare din browser.

Adapterul de test folosește `core/db.readDb` și `core/db.writeDb` originale, numai
cu JSON în director temporar `infraflow-trial-store-*`. Schimbă cele cinci câmpuri
de profil și `modules_enabled`, păstrând restul stării. Un marker cu trial/revizie/
digest și un singur audit minimal se salvează în aceeași stare ERP. Confirmarea
se copiază apoi în registru sub lock. GET-ul setup expune confirmarea, iar UI-ul
o păstrează după refresh. Aplicarea este o confirmare separată de salvarea setup.

Retry-ul recunoaște markerul ERP și nu adaugă alt audit. Dacă ERP-ul a fost salvat,
dar răspunsul/confirmarea în registru s-au pierdut, retry-ul poate completa
registrul. Dacă profilul/modulele au fost schimbate ulterior, refuză cu conflict
în loc să le suprascrie. Licența, utilizatorii, secretele și termenul nu sunt editate.

Verificări trecute:

1. `demo-company-apply.test.js`: **4/4**, inclusiv întrerupere simulată după salvarea
   ERP și înainte de confirmarea registrului, urmată de retry fără audit duplicat.
2. Proba HTTP extinsă: **26 cereri, trei procese succesive**, autentificare reală,
   aplicare/retry, protecții de intrare, marker păstrat după repornire și refuz la
   expirare. JSON ERP verificat separat pentru profil/module și păstrarea conturilor/licenței.
3. Wizard Chrome: confirmare separată, aplicare efectivă în JSON-ul ERP de test,
   audit unic, status păstrat după refresh; probele anterioare de conflict/mobil
   și expirare au trecut în aceeași rulare.
4. Suita setup/registru/magazie/aplicare: **26/26** în rularea combinată;
   proba browser este separată. Audit de expunere: 459 fișiere/zero constatări.

Limite obligatorii: nu este o tranzacție atomică între registru și ERP. Scrierea
JSON originală nu garantează toleranță la întreruperea alimentării. Callback-ul
ERP este sincron într-un singur proces web; alți scriitori externi ai aceluiași
fișier nu sunt coordonați de lockul registrului. Un fișier corupt se refuză, nu
se reinițializează automat. Pentru MSSQL/producție sunt necesare tranzacție,
control concurență și reconciliere confirmate pe backendul respectiv.

Nu s-a montat endpointul în `server/app.js`, nu s-a aplicat nimic pe un client
real și nu s-au activat joburi, invitații sau expirarea tuturor rutelor ERP.
Țara/moneda nu certifică legislație locală; celelalte setări regionale/fiscale nu
sunt rescrise automat. Runtime-ul livrat și pachetele 2.12.736 rămân neschimbate.

Următorul pas: invitația unică legată de trial și activarea controlată în mediul
sintetic, fără a reporni termenul și fără a expune provisionerul pe Demo-ul public.

## 16. Invitație unică și activare sintetică

Magazia de test poate emite un token aleatoriu de 256 biți pentru trialul aflat
în `awaiting_activation`, cu proprietar deja legat de setup. Păstrează numai
SHA-256 al tokenului, emis/la ce termen, identificatorul invitației și consumul.
Tokenul clar este returnat o singură dată apelantului de test. Un retry al
emiterii cu același ID nu îl dezvăluie din nou; dacă răspunsul a fost pierdut,
este necesară înlocuirea explicită cu ID nou, care invalidează tokenul anterior.
Emisia nu este expusă printr-un endpoint public și nu trimite email.

`scripts/lib/demo-invitation-router.js` este montat exclusiv în harnessul JSON,
nu în `app.js`. POST-ul de activare primește numai token, parolă și confirmare.
Trialul este ales din configurația serverului, proprietarul din registru/ERP.
Nu acceptă companie, rol, zile sau termen de la client. Refuză suprascrierea unui
cont deja activ fără markerul aceleiași activări și nu permite schimbarea rolului.
Folosește politica reală de parole, hash-ul original și loginul original ERP.

Activarea contului salvează un marker ERP și audit fără token/parolă în clar.
Registrul consumă invitația și stabilește exact 15 zile de la prima activare
salvată. La întreruperea dintre fișiere, retry-ul poate folosi markerul existent,
dar nu schimbă parola aleasă și nu repornește termenul. Tokenul deja consumat,
expirat sau înlocuit este refuzat. Linkul este valabil 24h, cu refuz la egalitatea
exactă cu termenul. Două consumări concurente nu activează de două ori.

Harnessul pune un filtru de stare trial înaintea rutelor obișnuite de autentificare
și setup: înainte de activare sau după expirare nu permite acces la acestea.
Filtrul nu este instalat în ERP-ul public. Markerul ERP fără confirmare în registru
nu deblochează accesul în harness; o activare întreruptă care ajunge la expirarea
invitației poate necesita intervenție controlată, încă neimplementată.

Verificări: `demo-invitation.test.js` **4/4**, inclusiv o probă cu **12 cereri HTTP,
două porniri**: acces înainte de activare refuzat, câmpuri injectate/token greșit,
parolă slabă/neconfirmată, activare, login, replay și reluare după restart. Contul
rămâne restrâns, auditul activării este unic și datele nu conțin parola în clar.
Rularea combinată modele/setup/registru/aplicare/invitații: **30/30**; proba Chrome
a wizard-ului a trecut separat după introducerea filtrului de trial.
Audit expuneri: 460 fișiere/zero constatări. Sintaxă/diff check trecute.

Limite: niciun email, URL public, pagină de activare sau token de producție creat.
Tokenul se trimite în corp POST în test, nu prin query string/jurnale. Invitația
nu este încă legată de aprobarea WordPress sau de un provisioner real. Lipsesc
rate limiting-ul public, identificarea originilor/hostname și backendul SQL
tranzacțional. Două fișiere JSON nu sunt o tranzacție distribuită și nu sunt
validate pentru pierdere de alimentare sau scriitori externi necoordonați.

Următorul pas: pagina sintetică de activare și proba browserului pentru traseul
invitație → parolă → login → wizard. Nu se activează nimic pe Demo-ul public și
nu se reconstruiesc pachetele 2.12.736 pentru aceste adaptoare de test.

## 17. Activare în browser și traseu complet sintetic

Intrarea separată de dezvoltare include pagina de alegere și confirmare a
parolei. Invitația este citită din fragmentul URL, apoi fragmentul este imediat
înlocuit cu `#activate`. Tokenul rămâne temporar în memoria paginii, nu în
localStorage/sessionStorage sau în URL-urile cererilor; activarea îl trimite în
corpul POST. Reîncărcarea înainte de activare cere redeschiderea linkului original.
Redeschiderea în aceeași filă este tratată prin evenimentul `hashchange`.

Succesul afișează utilizatorul și termenul; nu autentifică automat. Continuarea
trece prin loginul original ERP, apoi wizard și aplicarea separată a configurării.
Confirmarea wizard-ului și retry-urile nu repornesc cele 15 zile.

Proba Chrome a trecut integral: nepotrivire parole, activare unică, login greșit
și corect, configurare, conflict de revizie, reluare după refresh, afișare mobilă,
aplicare, audit unic, refuzul invitației reutilizate și refuz după expirare.
Prima rulare a identificat navigarea în același document fără actualizarea stării;
handlerul `hashchange` a fost adăugat, iar rerularea a trecut: **1/1**, fără skip.
Testele HTTP invitație/setup au trecut împreună: **5/5**. Captura de activare,
fără parolă sau token, este în `installer/output/qa/demo-activation.png`.

Build-ul obișnuit și auditul de expunere au trecut: 460 fișiere, zero constatări.
Pagina rămâne exclusiv în preview-ul sintetic, nu în aplicația instalată.
Nu s-au trimis emailuri, nu s-au conectat WordPress/provisioner/gateway și nu
s-a schimbat Demo-ul public. Rate limiting-ul public și persistarea SQL
tranzacțională rămân necesare înainte de o integrare reală.

Următorul pas: orchestrarea locală controlată aprobare → instanță → invitație,
înainte de integrarea publică. Pachetele livrate 2.12.736 rămân neschimbate.

## 18. Coordonator local pentru aprobări (contract de adaptor)

`scripts/lib/demo-approval-orchestrator.js` leagă în magazia temporară aprobarea,
rezervarea trialului, proprietarul/modulele, starea provisioning, confirmarea
adaptorului și emiterea invitației. Nu implementează provisionarea unei instanțe.
Adaptorul injectat `ensureInstance` trebuie să fie idempotent și să verifice
instanța la fiecare reluare. Confirmarea trebuie să corespundă trialului,
proprietarului și tuturor resurselor rezervate, cu `healthy: true`.

Legarea proprietarului/modulelor este salvată înainte de apelul adaptorului;
schimbarea lor la retry este refuzată. La excepție sau confirmare greșită,
trialul rămâne provisioning și nu primește invitație. Reluarea reapelează
adaptorul, fără a dubla tranzițiile salvate. Invitația emisă anterior nu își
dezvăluie tokenul la retry. Activarea și termenul de 15 zile nu pornesc aici.

Teste: trei probe dedicate trecute; împreună cu invitațiile **7/7**, zero skip,
inclusiv testul existent cu 12 cereri HTTP/două porniri. Testele noi folosesc
un adaptor simulat: nu dovedesc sănătatea unui proces SQL/ERP nou provisionat.
Apelul paralel este refuzat în aceeași instanță de coordonator. Nu există încă
lease distribuit între coordonatori/procese; lockul magaziei protejează numai
operațiile individuale, nu callback-ul extern. Nu utiliza acest coordonator ca
serviciu public sau worker concurent de producție.

Nu s-au creat baze SQL, servicii OS, conturi reale sau emailuri. Fără endpoint
public, restart/deploy ori arhive noi. Urmează adaptorul local concret și proba
integrată a reluării, înainte de conectarea la WordPress sau Demo-ul public.

## 19. Adaptor concret local: proces separat, JSON și health verificat

`server/tests/support/demo-local-instance.js` pregătește fișierele temporare
`instance.json` și `instance.key`, fără a le suprascrie la reluare. Verifică
rezervarea server-side din registru și legarea proprietarului/modulelor înainte
de efecte. Cheia aleatoare este distinctă per director; este un fișier local de
test, nu un secret manager sau dovada unor ACL Windows de producție.

Pornește efectiv un proces Node pe loopback/port dinamic, cu mediu restrâns,
folosind harnessul de autentificare/setup, NU întreaga aplicație `app.js`.
Sonda health a harnessului citește baza JSON, verifică trialul/rolul și cere un
nonce per pornire; fără nonce răspunde 404. Invitația se emite numai după ce
adaptorul confirmă răspunsul procesului. Numele SQL/storage/runtime din rezervare
rămân identificatori logici: acest adaptor NU creează baze SQL, storage ERP,
servicii systemd/Windows sau rute publice.

Proba integrată pornește două procese cu proprietar/username identic, dar date,
chei și porturi separate. Simulează întreruperea după health și înainte de ready;
retry-ul reutilizează procesul în viață. Oprirea/reluarea înainte de activare
păstrează cheia, parola nealeasă și invitația originală. Tokenul altui trial este
refuzat, iar o sesiune de pe A nu autentifică pe B. Activarea fixează 15 zile și
nu poate fi relansată prin coordonator.

Proba Chrome folosește acum acest adaptor și coordonator, nu baza de test
pregătită separat: aprobare → proces → health → invitație → parolă → login →
wizard → aplicare → refresh. Prima rulare combinată a expirat așteptând titlul
de după refresh; nu s-a stabilit o cauză certă. Testul verifică acum explicit
statusul API și chitanța de aplicare după refresh. Rerularea individuală și apoi
rularea combinată au trecut: **11/11**, zero skip. Audit: 463 fișiere, zero
constatări. Sintaxă și diff check trecute.

Limitări: adaptorul este exclusiv pentru NODE_ENV=test și directoare TEMP
prefixate. Nu adoptă procese după căderea coordonatorului și nu are lease între
procese; o nouă instanță a adaptorului nu trebuie pornită peste una existentă.
Nu certifică izolarea OS, uploaduri sau toate modulele ERP. Datele de test sunt
curățate numai după oprirea proceselor, cu verificarea căii. Nu s-au modificat
instalările, Demo-ul public, versiunea sau arhivele 2.12.736.

Următorul pas: recuperarea controlată a instanței după pierderea coordonatorului
și blocarea provisionării concurente, înainte de un adaptor MSSQL/deployment.

## 20. Recuperarea coordonatorului și revendicarea unică a procesului de test

Harnessul gestionat creează exclusiv (`wx`) `runtime.claim` înainte să asculte
pe port. Rezervarea aparține procesului instanței, nu coordonatorului. După
listen salvează `runtime.json` prin rename, cu PID, port local, trial, proprietar
și nonce de control. Fișierele cu nonce nu trebuie afișate sau exportate.
Două porniri concurente în același director nu pot dobândi aceeași rezervare.
Încercarea pierzătoare este refuzată; o reluare poate adopta instanța câștigătoare.

Un adaptor nou verifică potrivirea descriptor/rezervare și răspunsul health
autentificat: PID, trial, proprietar și provider JSON. PID-ul/portul singure nu
sunt autoritate. Pornirea este detached, ascunsă pe Windows, ca instanța să poată
supraviețui coordonatorului. Prima probă de cădere a identificat oprirea copilului
pe Windows fără această opțiune; după corecție, căderea reală a coordonatorului
și adoptarea aceluiași PID/port au trecut.

Oprirea unui proces adoptat folosește exclusiv endpointul loopback protejat cu
nonce. Nu se aplică kill unui PID din descriptor. Cleanup-ul forțat rămâne numai
pentru handle-ul copilului creat direct de adaptor. La oprire normală, instanța
își șterge numai fișierele de control al căror nonce îi aparține.

Dacă procesul a fost terminat forțat, rezervarea nu este furată automat.
`recoverStoppedInstance(expectedNonce)` cere nonce-ul exact, consistența
fișierelor și dovada că PID-ul nu mai există; un PID viu, inclusiv reutilizat,
sau o eroare de permisiune blochează recuperarea. Un lock exclusiv separat
serializează recuperările. Un descriptor corupt sau nepotrivit se refuză, nu se
repară prin suprascriere. Aceasta este o API internă de test, nu endpoint public.

Verificări combinate: **13/13**, zero skip, inclusiv Chrome și două probe noi:
coordonator pierdut → același proces adoptat fără token/termen nou; adaptoare
concurente → o instanță; proces terminat → refuz până la recuperarea explicită.
Nonce greșit, descriptor modificat și recuperare cerută pentru proces viu sunt
refuzate. Audit expuneri: 466 fișiere, zero constatări; sintaxă/diff check trecute.

Limite: exclusiv TEMP/JSON, harness parțial, loopback și trialuri încă în
provisioning/awaiting_activation. Nu este un supervisor pentru toate stările
active/expirate și nu certifică rezistență la pierderea alimentării sau atacator
local cu acces la fișiere. `mode: 0600` nu certifică ACL Windows. Nu există
automatizare systemd/Windows, gateway, provisionare SQL sau cleanup de producție.
Nu s-au modificat Demo-ul public, serviciile instalate sau arhivele 2.12.736.

Următorul pas: reconcilierea proceselor deja active și a trialurilor expirate,
cu probe locale înainte de adaptorul MSSQL/deployment.

## 21. Reconciliere locală pentru trialuri active și expirate

Magazia temporară oferă `reconcileRuntime`, exclusiv pentru workerul sintetic
de încredere. Sub lock, verifică starea/timpul și serializează decizia cu
modificările administrative din aceeași magazie. Un trial încă activ poate
adopta sau reporni harnessul folosind datele și cheia existente; verifică
markerul activării, proprietarul, parola existentă și concordanța termenului
contului cu registrul. Datele/cheia lipsă nu sunt regenerate pentru un trial activ.

La egalitatea cu termenul, salvează mai întâi tranziția `expired`, apoi cere
oprirea autentificată. Dacă oprirea eșuează, registrul rămâne expirat și filtrul
HTTP refuză accesul, inclusiv cu o sesiune existentă. Retry-ul reia oprirea fără
al doilea eveniment de expirare. Trialurile `expired`/`purge_pending` nu sunt
repornite prin ensure. Oprirea păstrează baza JSON și cheia: NU este purge.

Lockul rămâne deținut în timpul callback-ului extern. O comandă concurentă
refuzată/expirată trebuie reîncercată după o citire curentă; o comandă veche
de prelungire este refuzată prin revision conflict. Lockul rămas după o cădere
nu se fură automat. Nu există tranzacție distribuită sau protecție față de
scriitori care ocolesc această magazie.

Patru probe noi: adoptare/restart activ cu hash/termen păstrate și sesiune veche
invalidă; date lipsă fără seed nou; expirare exactă și oprire fără ștergere;
eșec la stop cu acces refuzat și retry; lock pe durata efectului și ceas invalid.
Prima aserțiune de identitate binară după re-login a identificat auditul normal
de autentificare, nu pierdere de date; verificarea binară este acum înainte de
loginul nou și separat înainte/după oprirea pentru expirare.

Audit expuneri: 467 fișiere, zero constatări. Sintaxă/diff check trecute.
Prima rulare complet paralelă: 16/17, Chrome timeout la navigarea inițială;
probele noi au trecut. Rerularea cu `--test-concurrency=2`: **17/17**, zero skip,
inclusiv Chrome, fără creșterea timeout-urilor. Nu au rămas procese de test active.

Limite: apel explicit de test, fără scheduler periodic instalat, numai harness
JSON parțial pe loopback. Nu reprezintă oprirea automată pe Demo-ul public.
Prelungirea exclusiv în registru poate produce nepotrivire cu termenul contului;
adaptorul refuză pornirea în loc să ascundă acest lucru. Urmează prelungirea
controlată/sincronizată, apoi retenția și ștergerea verificată separat.
Nicio modificare în serviciile instalate, versiune sau arhivele 2.12.736.
