# Demo privat pe companie — plan de implementare

Data: 22 octombrie 2026. Bază tehnică: 2.12.735.
Stare actualizată la 24 octombrie: **prototip local TEMP/JSON verificat;
nu este implementat sau activat pe Demo-ul public**. Sursa curentă: 2.12.736.
Verdictul consolidat și porțile de livrare sunt în
`docs/ACCEPTANTA_PROTOTIP_DEMO_PRIVAT_2026-10-24.md`.

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

## 22. Prelungirea sincronizată a trialurilor active (2026-10-24)

`extendAccess` validează mai întâi comanda prin modelul registrului: administrator
de platformă, revizie curentă, timp valid și termen strict mai mare. Acesta este
context de încredere în harness, NU autentificare de superadmin pentru un API
public. Pentru această etapă se acceptă numai trialul în starea `active`.

Sub lockul registrului, adaptorul contactează procesul de test prin endpointul
loopback `synthetic-extension`, protejat cu nonce. Procesul verifică rezervarea
din registru și contul, apoi citește/scrie prin helperul ERP original. Nu se
editează fișierul de date dintr-un al doilea proces în timp ce ERP-ul rulează.
Schimbă numai termenul contului, adaugă markerul comenzii și auditul administrativ;
parola, rolul și prima activare sunt păstrate. Abia după confirmarea ERP se
salvează noul termen în registru.

Cele două fișiere NU constituie o tranzacție atomică. Dacă răspunsul sau
confirmarea registrului se pierde după scrierea ERP, retry-ul cu aceeași comandă
recunoaște markerul și nu repetă auditul. Aceeași identitate cu alte valori se
refuză. Comanda deja confirmată în registru returnează `already_applied`, fără
o nouă prelungire sau reverificare completă a ERP-ului. Filtrul de acces continuă
să folosească registrul vechi până la confirmare, deci o scriere ERP izolată nu
acordă singură acces dincolo de vechiul termen.

Probe noi cu proces real: scriere ERP → întrerupere simulată → refuz comandă
modificată → retry corect → audit unic; parola și activarea nemodificate;
reconcilierea la vechiul termen nu mai oprește trialul; restart și login cu
aceeași parolă. Autoritatea/revizia/termenul invalide sunt respinse înainte de
callback. Endpointul fără nonce răspunde 404. Suita dedicată: **6/6**, zero skip.
Sintaxă/diff check trecute; audit expuneri: 467 fișiere, zero constatări.
Rularea combinată cu `--test-concurrency=2`: **19/19**, zero skip, inclusiv
Chrome. Nu au rămas procese de test active.

Limite: necesită procesul gestionat încă disponibil; nu repară automat un ERP
cu termen schimbat și proces deja oprit. Nepotrivirea rămâne refuzată de
reconcilierea normală, nu se ascunde prin rescriere. Trialurile `expired` sau
`purge_pending` sunt refuzate de acest nou flux; reactivarea lor urmează separat.
Comanda brută `command/extend` rămâne disponibilă modelului de test, dar nu
sincronizează ERP și nu trebuie folosită drept flux complet administrativ.
Nu există încă UI/API de producție, autentificare administrativă externă,
persistare SQL sau distribuție publică. Versiunea/arhivele rămân 2.12.736.

Următorul pas: reluarea controlată a prelungirii când procesul este oprit și
reactivarea unui trial expirat, fără modificarea parolei și fără resetarea datelor.

## 23. Reactivare după expirare/opriere și reluarea prelungirii (2026-10-24)

Fluxul sincronizat acceptă acum `active`, `expired` și `purge_pending`, conform
modelului de revizii; `purging`/`deleted` rămân refuzate înainte de efecte.
Nu șterge și nu recuperează date deja eliminate. Un cont dezactivat explicit,
date/cheie lipsă sau un marker de activare nepotrivit sunt în continuare refuzate.

Dacă procesul nu rulează, adaptorul verifică administrativ comanda pe registrul
curent, proprietarul, resursele și datele existente înainte să pornească harnessul.
Această cale de recuperare nu folosește un seed nou. Verificarea normală `ensure`
rămâne strictă și nu poate porni un trial expirat fără contextul comenzii validate.
Procesul pornit pentru recuperare nu acordă acces ERP cât registrul este expirat:
filtrul obișnuit refuză loginul până la confirmarea noului termen în registru.

Același mecanism poate relua o prelungire al cărei marker ERP a fost salvat,
dar registrul încă nu a confirmat-o, inclusiv după oprirea procesului. Markerul
trebuie să corespundă exact comenzii originale; nu schimbă parola, prima activare
sau profilul companiei și nu dublează auditul. Metadatele runtime neconcordante
sau o rezervare rămasă după kill continuă să necesite recuperarea explicită
descrisă anterior, nu se fură automat.

Probele noi folosesc procese reale: expirare și oprire → pornire administrativă
→ scriere ERP → întrerupere înainte de confirmarea registrului → login refuzat
→ oprire → adaptor nou → retry → login cu aceeași parolă. Reactivarea din
`purge_pending` schimbă revizia și refuză o comandă veche `begin_purge`.
Nu s-a executat nicio ștergere de date în aceste probe.

Prima rulare a arătat că un refuz de validare oprea procesul existent prin
cleanup-ul generic și pierdea sesiunile. Corecție: cleanup-ul de eroare oprește
numai copilul pornit chiar de apelul eșuat; o comandă invalidă nu oprește o
instanță existentă. Rerularea dedicată: **8/8**, zero skip.
Suita combinată cu `--test-concurrency=2`: **21/21**, zero skip, inclusiv Chrome.
Sintaxă/diff check trecute; audit: 467 fișiere, zero constatări. Zero procese de
test rămase active după verificări.

Limite: test local TEMP/JSON și context administrativ de încredere, nu UI/API
public cu autentificare superadmin. Cele două fișiere nu sunt o tranzacție
atomică și nu sunt validate la pierdere de alimentare. Nu s-au schimbat Demo-ul
public, serviciile instalate, versiunea sau arhivele 2.12.736.

Următorul pas: politica de retenție și planul de curățare în dry-run, înainte
de implementarea și autorizarea separată a ștergerii efective.

## 24. Politică de retenție și plan pur dry-run (2026-10-24)

`scripts/lib/demo-retention-plan.js` calculează un plan fără I/O: nu importă
filesystem, SQL, procese sau un executor de ștergere. Fără politică explicită,
rezultatul este blocat (`retention_not_enabled`). Nu s-a ales o durată implicită
pentru instalări. Valorile de 2/7 zile din teste sunt exemple sintetice, nu
politică comercială sau recomandare legală.

Politica are `enabled`, `dataRetentionDays`, `backupRetentionDays`; duratele sunt
numere întregi între 0 și 3650, cu refuz al câmpurilor necunoscute/overflow.
Termenele se raportează la ultima expirare din registru. Datele și backupurile
au termene distincte; cheia este păstrată cel puțin până la termenul cel mai
lung. Candidatura pentru curățarea completă apare numai după ambele termene și
numai în `expired`/`purge_pending`. Un trial încă `active`, chiar depășit în timp,
trebuie mai întâi reconciliat, nu devine candidat doar pe baza ceasului.

Planul listează cele șase clase logice de resurse: bază, storage, runtime,
routing, backupuri, cheie. Nu conține căi de ștergere sau comenzi SQL/shell.
Include revizia și o amprentă a legării resurselor/stării/termenului/politicii.
Revalidarea regenerează toate câmpurile relevante; prelungirea, politica schimbată,
ținte/câmpuri injectate sau resurse greșite invalidează planul. Amprenta nu este
semnătură de autorizare. `executionAllowed` rămâne **false**, inclusiv pentru un
candidat ajuns la termen.

Înainte de orice execuție viitoare rămân obligatorii: revizie curentă, dovada
proprietății resurselor, oprire autentificată, inventar complet de backupuri și
autorizare explicită a execuției. Planificatorul nu inventariază backupuri și nu
certifică faptul că o instanță este oprită. Nu persistă politica în aplicație și
nu instalează un scheduler. Nu schimbă starea trialului.

Verificări dedicate: **14/14** cu modelul registrului, zero skip. Proba TEMP
compară binar registrul, baza, cheia și un backup înainte/după planificare și
revalidare: neschimbate. Audit expuneri: 468 fișiere, zero constatări; diff check
trecut. Demo-ul public, serviciile instalate și arhivele 2.12.736 sunt neatinse.
Suita combinată cu `--test-concurrency=2`: **35/35**, zero skip, inclusiv Chrome.
Zero procese de test rămase active după verificări.

Următorul pas: inventarul verificabil al resurselor locale și previzualizarea
administrativă, încă fără executor de ștergere. Duratele reale de retenție și
autorizarea ștergerii trebuie stabilite explicit înainte de activarea lor.

## 25. Inventar local read-only și previzualizare statică (2026-10-24)

`server/tests/support/demo-resource-inventory.js` verifică exclusiv directoare
TEMP sintetice în NODE_ENV=test. Citește registrul și legarea bazei JSON la
trial/proprietar. Verifică tipul și dimensiunea fișierelor înainte de parsare și
refuză fișiere simbolice/nesigure pentru resursele citite. Nu urmărește recursiv
directoare și nu acceptă căi de resurse furnizate de client.

Cheia este verificată numai ca prezență/tip; conținutul, hash-ul cheii și ACL-urile
nu sunt citite/certificate. Parolele, nonce-ul runtime, cheia, username-ul și
calea TEMP nu sunt incluse în raport. Baza JSON este citită intern pentru legare,
dar raportul nu exportă obiectul DB sau câmpurile de autentificare. Fingerprint-ul
rezultatului este de comparație a observațiilor, nu certificat sau autorizare.

Pentru runtime cu descriptor și rezervare coerente se verifică trialul și
proprietarul, apoi health-ul cu nonce. Un proces care răspunde apare ca pornit,
nu ca eligibil pentru ștergere. Lipsa descriptorului nu dovedește oprirea;
un runtime care nu răspunde rămâne neverificat. O operație/rezervare în curs,
resurse neclasificate sau o bază nepotrivită apar ca blocaje.

Storage, backupuri și rutare nu sunt inventariate complet de harnessul actual.
Lipsa directorului nu dovedește lipsa copiilor externe. Aceste clase rămân
explicit neverificate și blochează curățarea. Nu s-a introdus un manifest fictiv
și nu se declară eliberate resurse doar pentru că nu au fost localizate.

`scripts/lib/demo-retention-preview.js` generează HTML static, fără JavaScript,
formular sau buton de execuție. Include starea retenției, duratele/termenul,
resursele și blocajele, cu text escapate și CSP restrictiv. Este un artefact local,
NU o pagină montată în ERP și NU un API administrativ public. Exemplul generat:
`installer/output/qa/demo-retention-preview.html`; capturi desktop/mobil cu
același prefix. Inspectat vizual și fără overflow la 390px.

Probe dedicate: **6/6**, zero skip, inclusiv un proces real verificat prin health
fără oprire sau expunerea nonce-ului. Comparația binară arată fișiere neschimbate
după inventar și render. Sunt testate legarea greșită, resurse lipsă/nesigure,
operație în curs, intrări neclasificate, escaparea HTML și refuzul în producție.
Sintaxă/diff check trecute; audit expuneri: 470 fișiere, zero constatări.
Suita combinată cu `--test-concurrency=2`: **41/41**, zero skip, inclusiv Chrome.

Limite: observație read-only parțială, nu snapshot atomic/distribuit. Cheile,
backupurile externe, rutarea și izolarea OS nu sunt certificate. `executionAllowed`
rămâne false. Demo-ul public, serviciile instalate și pachetele 2.12.736 sunt
neatinse. Nu s-a adăugat ștergere sau scheduler.

Următorul pas: inventarul backupurilor sintetice cu legare și integritate
verificabile, apoi integrarea lui în raport; fără ștergere efectivă.

## 26. Inventarul backupurilor sintetice și integritatea locală (2026-10-24)

`server/tests/support/demo-backup-inventory.js` citește numai subdirectorul
`backups` al unui director TEMP sintetic, în NODE_ENV=test. Nu creează copii,
nu restaurează, nu dezarhivează și nu șterge. Formatul este exclusiv de test,
NU formatul backupurilor SQL/ZIP/TAR din instalații.

Contractul local: `manifest.json` cu `format=infraflow-synthetic-backup-manifest-v1`,
`trialId` și `files`; fiecare intrare are numai `name`, `bytes`, `sha256`.
Payloadul JSON are `format=infraflow-synthetic-json-backup-v1`, `trialId` și
`database`, al cărui `settings.demoTrialId` trebuie să corespundă. Sunt verificate
dimensiunea, SHA-256 și ambele legări de trial, nu numai numele fișierului.
Manifestul nu este semnat: coerența manifest/hash nu certifică proveniența
împotriva unui atacator local care le poate modifica pe ambele.

Fișierele trebuie să fie obișnuite, fără linkuri simbolice/hardlinkuri. Numele
sunt basename JSON limitate, fără căi, nume Windows rezervate sau duplicate,
inclusiv diferențe doar de litere mari/mici. Nu sunt urmărite directoare din
manifest. Limite: 256 KiB manifest, 100 copii, 64 MiB/copii, 128 MiB total,
1001 intrări în director. Tipul/metadatele sunt reverificate după citire;
manifestul și lista directorului sunt comparate din nou la final.

Copiile lipsă, modificate, ale altui trial, nesigure sau intrările neclasificate
produc refuz/blocaj. Un director gol fără manifest nu dovedește că nu există
backupuri. Un manifest valid verifică numai copiile locale declarate; cele
externe rămân explicit neverificate și blochează curățarea. Nu reprezintă un
snapshot atomic față de scriitori externi și nu demonstrează restaurabilitatea.

Raportul general include numărul copiilor verificate și al intrărilor locale
neclasificate, fără numele copiilor, conținut, parole, chei sau hash-uri de payload
în ieșire. HTML-ul indică explicit lipsa probei de restaurare. Exemplu separat:
`installer/output/qa/demo-backup-preview.html`. `executionAllowed` rămâne false.

Probe dedicate împreună cu inventarul general: **13/13**, zero skip. Sunt
testate integritate, proprietate, copie lipsă, cale injectată, nume rezervat,
duplicat, limită, hardlink și director în loc de fișier. Comparația binară arată
copii/manifest neschimbate după verificare. Sintaxă/diff check trecute;
audit expuneri: 472 fișiere, zero constatări.
Suita combinată cu `--test-concurrency=2`: **48/48**, zero skip, inclusiv Chrome.

Demo-ul public, serviciile instalate, versiunea și arhivele 2.12.736 sunt neatinse.
Următorul pas: probă de restaurare sintetică într-un director nou și izolat,
fără suprascrierea instanței originale, înainte de orice discuție despre purge.

## 27. Probă de restaurare JSON în director nou (2026-10-24)

`server/tests/support/demo-backup-restore.js` pregătește exclusiv un director
TEMP nou, generat intern. Nu acceptă o destinație furnizată de client și nu poate
suprascrie sursa. Selecția copiei trece prin aceeași validare integrală de
manifest, hash, nume, legare și intrări neclasificate; payloadul verificat este
returnat intern din aceeași citire, fără a fi exportat în raportul de inventar.

Snapshotul este comparat cu registrul curent: trial activ, proprietar unic cu rol
Demo restrâns, cont activ, marker de activare și termen concordante. Restaurarea
nu pornește un trial nou și nu adaugă 15 zile. Contul dezactivat sau trialul
expirat sunt refuzate. Registrul existent este copiat separat pentru trialul
selectat; aceasta NU este recuperarea unui control plane pierdut din backup.

Pregătirea scrie numai în directorul nou: registry/JSON, o cheie de TEST nouă și
o chitanță de scop. Nu copiază cheia sursă, PID-uri, nonce-uri sau rutare publică.
Nu pornește singură un proces. Proba pornește apoi harnessul pe alt port/PID și
folosește autentificarea și setup-ul originale ERP. UUID-ul logic al trialului
este păstrat numai în cele două directoare JSON izolate; nu se creează o a doua
rută sau o bază SQL cu același nume.

Sunt verificate: login cu parola din snapshot; hash/parolă, configurare, module
și termen păstrate; sesiuni nereutilizabile între procese; originalul funcțional
după oprirea copiei; registry/DB/cheie/manifest/backup sursă identice binar.
Teste negative: destinație injectată, selecție nesigură/lipsă, inventar incomplet,
conținut modificat, proprietar dezactivat și trial expirat. Probe dedicate de
restaurare: **3/3**, zero skip; cu inventarul backupurilor: **10/10**.

Rezultatul sanitizat se găsește în `installer/output/qa/demo-restore-probe.json`.
Este marcat explicit `json-auth-setup-only`, fără aprobare pentru producție.
Cheia fiind nouă, nu certifică decriptarea setărilor existente, atașamentele,
storage-ul, backupurile SQL sau toate modulele ERP. Harnessul nu montează
schedulerul de integrări. Niciun email sau serviciu extern nu este contactat.
Nu există garanție de snapshot atomic/distribuit ori rezistență la întreruperea
alimentării. Manifestul nesemnat nu dovedește proveniență împotriva unui scriitor
local privilegiat.

Prima suită combinată: **50/51**, Chrome timeout la alerta conflictului de
revizie. Testul browser verifică acum explicit răspunsul PATCH 409 și codul
`revision_conflict`, înaintea alertei; nu schimbă logica aplicației sau timeout-ul.
Rerularea Chrome individuală a trecut; apoi suita combinată cu
`--test-concurrency=2`: **51/51**, zero skip. Verificarea suplimentară a markerului
de aplicare setup din snapshot față de registru a trecut în cele trei probe de
restaurare. Zero procese de test rămase active.
Sintaxă/diff check trecute; audit expuneri: 474 fișiere, zero constatări.

Demo-ul public, serviciile instalate și arhivele 2.12.736 rămân neatinse.
Următorul pas: inventarul și proba de copiere/restaurare a fișierelor ERP
sintetice, separat de JSON și fără ștergere, înainte de un purge complet.

## 28. Inventar și copiere/restaurare storage sintetic (2026-10-24)

`server/tests/support/demo-storage-inventory.js` verifică un format plat de test
în `storage/manifest.json`, cu `format=infraflow-synthetic-storage-v1`, `trialId`
și `files`. Fiecare fișier are numai basename, bytes și SHA-256. Nu este formatul
actual al atașamentelor din toate modulele ERP și nu înlocuiește autorizarea pe
document/entitate.

Sunt acceptate numai fișiere obișnuite cu extensii limitate txt/pdf/png/jpg/bin,
fără căi, nume Windows rezervate, duplicate case-insensitive, symlink/hardlink
sau directoare în loc de fișiere. Nu se validează semantica PDF/imaginilor și nu
se deschid/servesc/execută. Limite: 100 fișiere, 16 MiB/fișier, 64 MiB total,
manifest 256 KiB și 1001 intrări locale. Fișierul gol este permis și verificat
prin hash. Metadatele, manifestul și lista directorului sunt reverificate.

Inventarul este read-only. Datele modificate/lipsă, manifestul altei companii sau
intrările neclasificate refuză copia. Raportul returnează numai stări/numere/
dimensiuni, fără conținut, nume de fișiere sau hash-uri individuale. Conținutul
este capturat în memorie numai pentru operația internă de copiere verificată.

`restoreSyntheticStorage` generează intern un director TEMP nou; nu acceptă o
destinație furnizată de client și nu poate suprascrie sursa. Scrie exclusiv
fișierele validate și manifestul, apoi le verifică din nou. Nu copiază registry,
chei, credențiale sau runtime și nu pornește aplicația. Cleanup-ul unui eșec
poate elimina numai ținta TEMP nou creată de acea operație, nu datele sursă.

Proba verifică sursă → copie izolată → a doua copie izolată, cu identitate binară
pentru fișiere text, binare și goale, plus manifest. Sursa rămâne neschimbată.
Teste negative: integritate, lipsuri, trial greșit, căi injectate, duplicate,
limite, hardlinkuri/directoare, manifest absent, intrări neclasificate și mod
producție. Cu inventarul general: **13/13**, zero skip.

Raportul general și HTML-ul includ noua stare storage, dar păstrează blocajul
`storage_entity_access_unverified`. Integritatea unui fișier nu dovedește dreptul
de descărcare, legarea lui la o entitate reală sau decriptarea. Nici manifestul
nesemnat nu certifică proveniența față de un atacator local privilegiat. Nu este
un snapshot atomic cu JSON și nu certifică o restaurare ERP completă.

Artefacte de test: `installer/output/qa/demo-storage-restore-probe.json` și
`installer/output/qa/demo-storage-preview.html`. Sintaxă/diff check trecute;
audit expuneri: 476 fișiere, zero constatări. Demo-ul public, serviciile instalate,
versiunea și arhivele 2.12.736 sunt neatinse; niciun purge implementat/executat.
Suita combinată cu `--test-concurrency=2`: **58/58**, zero skip, inclusiv Chrome.

Următorul pas: snapshot sintetic comun JSON + storage cu verificarea referințelor
dintre ele, înainte de a considera restaurarea coerentă pe entități.

## 29. Restaurare comună JSON + storage și referințe (2026-10-24)

`scripts/lib/demo-snapshot-references.js` verifică un snapshot marcat explicit
prin `syntheticSnapshot`: format `infraflow-synthetic-joint-snapshot-v1`, trialId
și SHA-256 al manifestului storage. Manifestul și octeții capturați/verificați
trebuie să corespundă acestei legări. Un JSON vechi nu poate fi combinat accidental
cu alt manifest sau cu fișiere modificate. Markerul nu este semnat și nu reprezintă
o protecție împotriva unui atacator care poate rescrie ambele componente.

Verificarea folosește câmpurile Documente `documents.documents`, `id`, `creat_de`,
`fisier_draft_path` și `fisier_final_path`, în convenția strictă de test
`storage/<basename>`. Documentele trebuie să aibă ID-uri distincte; referințele
trebuie să aparțină proprietarului trialului, să fie prezente în storage și să
nu fie duplicate. Fiecare fișier declarat trebuie referit: orfanele sunt refuzate.
Formatele/căile reale mai complexe și atașamentele din alte module nu sunt
acoperite. Acest verificator NU este o regulă nouă pentru documentele existente.

`server/tests/support/demo-joint-restore.js` validează ambele componente înainte
de pregătire, creează ținta JSON nouă prin helperul existent, verifică din nou
JSON-ul efectiv pregătit față de octeții storage capturați, copiază numai fișierele
validate și reverifică ținta. Nu acceptă destinație externă, nu suprascrie sursa și
nu pornește singur procese. Cleanup-ul unui eșec poate elimina numai directorul
TEMP nou creat, înainte de pornire, nu datele originale.

Proba integrată folosește activare/login reale, pregătește documentul-fixture
cât procesul sursă este oprit, apoi verifică restaurarea într-un al doilea proces.
Parola funcționează, tokenul sursă este refuzat în copie, documentul indică
fișierul corect, conținutul este binar identic, iar originalul rămâne funcțional.
Registry, DB, cheie, manifest și backupuri/fișiere sursă sunt comparate binar.
Nu se face download prin endpointul de Documente în această etapă.

Probe dedicate: **4/4**, zero skip. Sunt refuzate manifestul nepotrivit,
conținutul schimbat, referința lipsă/externă, autorul greșit, ID-urile/referințele
duplicate și fișierele orfane. Rezultatul sanitizat este în
`installer/output/qa/demo-joint-restore-probe.json`, cu `entityAccessVerified=false`,
`decryptionVerified=false`, `productionRestoreApproved=false`.
Sintaxă/diff check trecute; audit expuneri: 478 fișiere, zero constatări.
Prima suită combinată: **61/62**, Chrome timeout la afișarea mesajului unei
invitații reutilizate. Testul verifică acum explicit răspunsul 401 și codul
`invitation_invalid`, fără modificarea aplicației sau a timeout-ului. Rerularea
Chrome individuală a trecut; cauza timeout-ului intermitent nu este stabilită.
Rerularea combinată cu `--test-concurrency=2`: **62/62**, zero skip. Zero procese
de test rămase active după verificări.

Limite: verificare de coerență a unui fixture, nu un mecanism de captură atomică
a unei instanțe live, nu restaurare MSSQL/control plane pierdut și nu autorizare
de acces. Cheia de test este nouă; datele criptate și toate modulele ERP nu sunt
certificate. Nicio ștergere, publicare, modificare de serviciu ori arhivă nouă;
Demo-ul public și pachetele 2.12.736 sunt neatinse.

Următorul pas: proba HTTP a accesului autorizat/refuzat la fișierele documentelor
restaurate, înainte de a declara fluxul complet pe entitate.

## 30. Acces HTTP la fișierul restaurat — adaptor exclusiv de test

Harness-ul montează acum rutele originale Documente: dosarul propriu răspunde
200, iar documentul altui autor este refuzat cu 403. Loginul, sesiunile și
drepturile efective sunt cele originale. Fixture-ul parcurge configurarea și
aplicarea modulului Documente; autentificarea singură nu activează modulul.
Prima probă a refuzat corect accesul cu 403 deoarece fixture-ul nu aplicase
modulul; a fost completat fixture-ul, fără relaxarea permisiunilor.

Rutele originale inspectate nu oferă download pentru câmpul `fisier_draft_path`.
`server/tests/support/demo-restored-file-router.js` este, explicit, un adaptor
nou de test, NU un endpoint livrat. Folosește `requireAuth` și
`authHasPermission` originale, apoi o politică mai restrictivă: numai autorul
documentului. Nu reproduce accesul prin departament, partajări sau circuit.
Este montat numai în serverul sintetic, după poarta de valabilitate a trialului.

Cererea selectează ID-ul și varianta draft/final, niciodată o cale de fișier.
Octeții returnați sunt cei capturați și verificați de inventarul storage;
manifestul și referințele comune JSON/storage sunt reverificate. Nu există
`express.static`, cale primită din query sau redeschidere separată pentru send.
Răspunsul este attachment/octet-stream, `nosniff`, `no-store`.

Matricea HTTP verifică: modul neactivat 403; proprietar și octeți identici 200;
fără token 401; tokenul instanței sursă în restaurare 401; alt autor/document
inexistent/variantă lipsă/query cu path 404; storage direct 404; fișier modificat
sau lipsă 409; trial expirat 403 chiar dacă procesul încă rulează. Originalul,
backupurile și cheia sursă rămân identice binar. Expirarea este aplicată numai
copiei sintetice, fără ștergere. Nu sunt certificate toate permisiunile ERP,
MSSQL, criptarea sau restaurarea de producție.

Regresie combinată: **62/62**, zero skip, inclusiv Chrome. Audit expuneri:
**479 fișiere, zero constatări**; diff check trecut. Zero procese sintetice
rămase active. Raportul QA păstrează `entityAccessVerified=false` pentru fluxul
de producție și adaugă rezultate separate pentru adaptorul HTTP și vizibilitatea
nativă a dosarului. Versiunea și arhivele 2.12.736, serviciile instalate și
Demo-ul public sunt neatinse.

Următorul pas: completarea matricei negative pentru modul dezactivat și
permisiune retrasă după autentificare, inclusiv în copia restaurată. Abia apoi
se poate decide separat dacă produsul are nevoie de endpoint nativ de fișiere.

## 31. Retragerea drepturilor unei sesiuni deja autentificate

Proba comună exercită acum, atât în sursă cât și în copia restaurată, retragerea
`documents:view_own` și dezactivarea modulului `documents` după login. Fiecare
modificare produce 403 la două cereri consecutive, atât pentru dosarul prin
ruta originală Documente, cât și pentru fișier prin adaptorul sintetic. Ruta
originală `/session` rămâne 200: refuzul este de autorizare, nu un logout mascat.
Restabilirea politicii readuce 200 și aceiași octeți, cu același token, fără login
sau restart. Cealaltă instanță păstrează accesul 200 la dosar și fișier pe durata
restricției; la final fișierele sursă sunt comparate binar cu starea inițială.

Modificarea fixture-ului live trece prin scriitorul DB din propriul proces de
test, nu prin rescriere externă concurentă a JSON-ului. Endpointul administrativ
`/synthetic-test-policy` există numai în harness-ul NODE_ENV=test, managed,
legat la loopback și protejat de nonce-ul per-pornire. Acceptă numai acțiunile
fixe `revoke_permission`, `disable_module`, `reset`, fără identitate, cale sau
permisiuni arbitrare în cerere. Nonce greșit și tokenul proprietarului fără nonce
primesc 404. Nonce-ul nu este inclus în raportul QA.

Nu a fost necesară modificarea autorizării de producție. Această probă verifică
rolul restrâns Demo și furnizorul JSON, nu toate rolurile, permisiunile din
departamente/circuit sau sincronizarea MSSQL. Fișierul rămâne servit exclusiv
de adaptorul de test descris în secțiunea 30; nu certifică un download nativ.
Raportul QA adaugă `existingSessionPolicyRevocationVerified=true`, păstrând
`productionFileEndpointVerified=false`.

Probe dedicate: 4/4 trecute. Prima regresie combinată a avut 60 probe trecute
și un eșec la nivelul fișierului `demo-runtime-recovery.test.js`, fără diagnostic
detaliat; nu este declarat remediat. Recuperarea a trecut individual 2/2,
apoi rerularea combinată a trecut **62/62**, zero skip, inclusiv Chrome.
Cauza eșecului intermitent rămâne nestabilită. Auditul expunerilor: 479 fișiere,
zero constatări; verificările de sintaxă și diff au trecut.
La verificarea finală a existat un proces sintetic rămas activ; a fost identificat
prin descriptor și health autentificat, apoi oprit prin `/synthetic-stop`.
Inventarul final: zero procese sintetice active. Nu au fost oprite servicii ERP.

Următorul pas: investigarea eșecului intermitent/cleanup-ului la recuperare,
apoi verificarea persistenței restricțiilor după restartul instanței
sintetice, cu sesiunea veche refuzată și login nou care nu recuperează dreptul
retras. Fără schimbări în serviciile instalate, Demo-ul public sau arhive.

## 32. Diagnostic și cleanup pentru coordonatorul sintetic

Cele cinci repetări inițiale ale testelor de recuperare/restaurare au trecut
30/30. Ulterior, proba nouă de oprire în timpul provisionării a surprins o ieșire
anormală a coordonatorului: 3221226505 (`0xC0000409`), pe Node v24.15.0/Windows.
Microsoft documentează acest cod ca fail-fast, fără ca numărul singur să indice
cauza: https://learn.microsoft.com/en-us/cpp/intrinsics/fastfail . Nu este
demonstrat că aceasta este cauza exactă a eșecului la nivel de fișier din
secțiunea 31; nu se declară rezolvat un defect nativ Node/Windows.

Helperul `demo-coordinator-client.js` înregistrează exit înaintea trimiterii
comenzii și diferențiază exit înainte de ready, mesaj ready invalid, timeout,
eroare IPC și exit anormal. Erorile includ numai cod/stare, nu payload, stderr
sau nonce. Cleanup cere oprire prin IPC, inclusiv în timpul provisionării;
copilul este oprit înainte de ieșirea coordonatorului. Un timeout/exit anormal
rămâne eșec, iar fixture-ul nu este șters ca și cum ar fi fost curățat.

Coordonatorul nu mai folosește `process.exit()` în callbackuri: închide IPC și
lasă procesul să iasă natural prin `exitCode`. Pentru pierderea simulată a
coordonatorului, adaptorul eliberează handle-ul/IPC al copilului după health
autentificat, fără oprirea instanței; noul adaptor trebuie să adopte același PID.
Aceasta este o simulare controlată, nu un test de crash OS/pană de curent.
Referință Node: https://nodejs.org/api/process.html#processexitcode și
https://nodejs.org/api/child_process.html#subprocessdisconnect .

Cleanup-ul încearcă separat oprirea tuturor adaptoarelor, colectează erorile,
așteaptă dispariția procesului cunoscut și abia apoi elimină directorul TEMP.
O rezervare cu PID străin/nonce nepotrivit nu este preluată ori omorâtă.
Sunt adăugate cinci probe deterministe IPC și două probe reale: cleanup după
pierderea coordonatorului înainte de adoptare și cleanup cerut înainte de ready.
Cinci repetări revizuite ale grupului recuperare/restaurare/IPC: **65/65**, fără
skip. Aceste rezultate nu înlocuiesc diagnosticul nativ încă incomplet.

Regresia completă cu Chrome: **69/69**, zero skip. Ultima rerulare dedicată:
**9/9**; zero procese sintetice rămase active. Audit expuneri: **481 fișiere,
zero constatări**. Sintaxa și diff check au trecut. Niciun timeout de test
existent nu a fost mărit pentru a ascunde eșecul; oprirea noului coordonator
folosește aceeași limită explicită ca așteptarea ready.

Urmează verificarea persistenței restricțiilor după restartul instanței sintetice.
Schimbările sunt limitate la infrastructura de test și documentație; versiunea,
serviciile instalate, Demo-ul public și arhivele 2.12.736 nu sunt modificate.

## 33. Restricții păstrate după restart în sursă și în restaurare

Proba comună verifică acum patru restarturi reale: permisiunea retrasă și
modulul dezactivat, separat în sursă și în copia restaurată. După fiecare restart:

1. PID-ul și nonce-ul de control sunt noi; nonce-ul anterior primește 404 la
   comanda de restabilire a dreptului, fără efect.
2. Tokenul anterior primește 401 la dosar, fișier și `/session`.
3. Loginul original cu parolă validă emite token nou, cu `/session` 200, dar
   dosarul și fișierul rămân 403. Restricția este verificată și pe discul JSON.
4. Cealaltă instanță rămâne accesibilă cu sesiunea ei curentă.
5. Numai comanda explicită de restabilire, cu nonce-ul noii porniri, readuce 200;
   tokenul vechi rămâne 401, inclusiv după această restabilire.

Adaptorul administrativ exclusiv de test acceptă suplimentar `enable_module`
și `restore_permission`, cu efect fix pe Documente/rolul Demo. Aceste acțiuni nu
primesc căi, utilizatori sau permisiuni arbitrare. Resetul bazat pe memoria
procesului nu este folosit ca dovadă de persistență după restart. Nu există
endpoint administrativ nou în aplicația livrată.

Inițial, comparația binară finală a întregii baze a eșuat: loginurile noi adaugă
audit și actualizează `devices.lastSeenAt` prin codul original. Testul a fost
separat explicit pe etape, fără eliminarea generică a verificării sursei:

- restaurarea și proba fără restart păstrează toate fișierele sursă identice;
- după proba cu restart sunt permise exact două audituri `auth_login_reusit`
  pentru owner, păstrând prefixul de audit inițial;
- numai `devices.lastSeenAt` poate varia în afara auditului; toate celelalte
  câmpuri ale DB sunt comparate integral după restabilirea politicii;
- registry, cheie, manifesturi, fișierul și backupurile rămân identice binar.

Raportul QA diferențiază `sourceUnchangedByRestore` de
`sourceRestartProbeAddedLoginMetadataOnly` și adaugă
`policyRevocationSurvivesRestartVerified` și
`oldSessionAndControlNonceRefusedAfterRestart`. Nu declară download nativ,
restaurare MSSQL sau aprobare pentru producție. Probe dedicate: **4/4**, zero
skip, fără mărirea timeout-ului existent de 60 secunde.

Regresia completă: **69/69**, zero skip, inclusiv Chrome. Auditul expunerilor:
**481 fișiere, zero constatări**; sintaxa și diff check au trecut. Inventarul
final: zero procese sintetice active. Nu se generează arhive noi pentru probe
care nu modifică aplicația livrată.

Etapa rămâne locală/TEMP/JSON. Următorul prag este consolidarea acceptanței
prototipului și a blocajelor reale de livrare, înaintea implementării control
plane-ului/provisionării MSSQL, nu activarea directă în Demo-ul public.

## 34. Verdict consolidat și următorul increment

`docs/ACCEPTANTA_PROTOTIP_DEMO_PRIVAT_2026-10-24.md` separă probele locale,
limitele lor, porțile neînchise de livrare și ordinea etapei SQL. Starea de la
începutul planului este actualizată: prototip local verificat, nu pilot public.

Suita extinsă include suplimentar store/setup/aplicare: **87/87**, zero skip,
inclusiv Chrome; audit 481 fișiere, zero constatări; diff check trecut și zero
procese sintetice active. Proba SQL opt-in istorică nu a fost rerulată și nu
certifică noul lifecycle. Nu s-au făcut modificări de runtime sau arhive.

Următorul increment: contract și persistență tranzacțională SQL pentru registrul
platformei, cu unicitate/CAS, comenzi și joburi durabile, într-un mediu explicit
de test. Provisionarea reală, gateway-ul și executorul de ștergere rămân porți
separate, nu efecte implicite ale trecerii de la JSON la SQL.

## 35. Primul adaptor SQL tranzacțional, exclusiv de test

Implementat și verificat pe SQL Server Express local: registry cu CAS global,
proiecții de trialuri, comenzi, evenimente și outbox `pending` salvate atomic.
Schema se află în `db/control-plane-test-migrations`, în afara migrărilor ERP;
adaptorul din `server/core/demo-trial-sql-test-store.js` refuză runtime-ul normal
și bazele fără prefixul/numele strict de test. Nu este importat de `app.js`.

Probe SQL reale: **9/9**, zero skip, folosind conexiuni independente. Sunt
verificate concurența, aceeași revizie, unicitatea aprobării, retry idempotent,
rollback înainte de commit și confirmare simulată pierdută după commit. Nu s-a
simulat o pană de curent ori pierderea conexiunii în mijlocul COMMIT-ului.

Detalii, comandă de rulare, baza de test păstrată și limite:
`docs/REGISTRU_DEMO_SQL_PROBA_2026-10-24.md`. Store-ul gestionează momentan
queue/read/command, nu wizard/invitații sau prelungire sincronizată cu ERP.
Folosește un snapshot global și proiecții, nu schema finală scalabilă. Executorul
Windows PowerShell/System.Data de test nu reprezintă driverul serviciului Linux.

Nu există executor al outbox-ului, lease sau operații fizice pe companii.
Următorul increment este claim/lease/generație pentru joburi și refuzul unui
worker vechi. Demo-ul public, orchestratorul JSON, serviciile instalate și
arhivele nu au fost modificate.

Regresie separată a prototipului existent: **87/87**, zero skip, inclusiv Chrome.
Audit expuneri 484 fișiere, zero constatări; sintaxă/diff check trecute.

## 36. Claim/lease și generație pentru outbox SQL de test

Migrarea nouă `002_trial_job_leases.sql` și helperul central
`demo-trial-sql-job-test-store.js` adaugă revendicare exclusivă pe trial/revizie,
termen de lease, generație și confirmare idempotentă. Două conexiuni concurente
nu obțin același job. După reatribuire, vechea generație nu confirmă nici dacă
workerul are același ID; la termen exact accesul de confirmare este expirat.
O revizie nouă invalidează și un job anterior cu lease încă neexpirat.

**16/16 probe SQL**, zero skip, incluzând regresia registrului. Prima încercare
a refuzat migrarea 002 cu eroare SQL 102; sintaxa EXEC pentru numele constrângerii
a fost corectată și toate probele au fost rerulate, nu sărite. Baze de test și
limite: `docs/JOBURI_DEMO_SQL_LEASE_2026-10-24.md`.

Nu există daemon, handler real sau autentificare publică de worker. Ceasul este
injectat numai pentru test. Lease-ul protejează confirmarea SQL, nu certifică
împiedicarea efectelor fizice ale unui worker vechi. Urmează reînnoirea lease-ului
și un handler sintetic idempotent pentru reluare după confirmare pierdută.

Regresie existentă rerulată separat: **87/87**, zero skip, inclusiv Chrome.
Audit expuneri: 486 fișiere, zero constatări; sintaxă/diff check trecute;
zero procese sintetice active la final. Versiunea și arhivele rămân neschimbate.

## 37. Heartbeat și reluare fără dublarea efectului sintetic

Helperul SQL oferă acum `renewJob`, cu identitate/generație/revizie și CAS pe
termenul anterior. Prelungirea este admisă doar înainte de expirare și nu poate
scurta lease-ul; două heartbeaturi concurente au un câștigător. O generație sau
revizie veche nu poate recupera dreptul de lucru prin heartbeat.

`003_synthetic_effect_receipts.sql` și `applySyntheticEffect` modelează efectul
ca un rând SQL unic pe trial/revizie, cu autoritate reverificată la scriere.
Reluarea după omiterea confirmării folosește client/generație noi și regăsește
efectul existent, fără dublare. Nu este un executor de resurse externe.

Contract, limite și comanda de test: secțiunea 7 din
`docs/JOBURI_DEMO_SQL_LEASE_2026-10-24.md`. Urmează un ciclu complet de worker
sintetic; nu activarea pe VPS. Versiunea, arhivele și serviciile sunt neatinse.

## 38. Ciclul workerului exclusiv sintetic

`demo-sql-worker-cycle.js` execută un ciclu finit de claim, heartbeat, efect SQL
sintetic și confirmare. Nu există daemon sau handler extern. Sunt validate
identitatea și răspunsurile etapelor; eșecul heartbeatului oprește efectul, iar
eșecul efectului oprește confirmarea. Punctele fixe de întrerupere sunt numai
injecții de test, nu operații administrative expuse.

Proba reală SQL întrerupe ciclul după persistarea efectului, refuză alt worker
înainte de termen, apoi reia cu generație/client noi fără efect dublat. O
întrerupere după confirmare nu redeschide jobul. Nu este simulată o pană OS/rețea;
efectul rămâne un receipt SQL unic, nu o instanță ERP.

Contract și probe: secțiunea 8 din `docs/JOBURI_DEMO_SQL_LEASE_2026-10-24.md`.
Urmează observabilitate read-only pentru stările jobului și receipt, fără
credenciale sau comenzi de relansare/ștergere. Pilotul și arhivele sunt neatinse.

Rezultat al etapei: **19/19 probe**, zero skip, cu SQL real (ciclu și regresia
reînnoirii). Audit expuneri 489 fișiere, zero constatări; sintaxă/diff check
trecute și zero procese sintetice active. Nu s-a rerulat întreaga suită ERP.

## 39. Raport read-only pentru joburi și receipt-uri

Store-ul SQL de test oferă acum `readJobReport`, cu stare persistată/derivată,
motiv, generație, termene, receipt și generația primei aplicări. Un lease expirat
este diagnosticat fără a-i schimba starea, iar un job cu revizie depășită este
separat de cel curent. Nu sunt selectate secrete, workerId, aprobări sau payload.

Prezentarea este un obiect strict și HTML static fără acțiuni; nu este ecran
montat în ERP. Sunt refuzate datele corupte și rezultate peste limita explicită
de 100 rânduri; nu există încă paginare. Citirea ia lockuri tranzacționale scurte,
dar nu modifică datele. Nu oferă autoritate de execuție.

**9/9 probe trecute**, zero skip, inclusiv SQL real cu comparație integrală a
tabelelor înainte/după raport. Audit expuneri 491 fișiere, zero constatări;
sintaxă/diff check trecute. Detalii: secțiunea 9 a documentului joburilor.
Urmează filtre/paginare read-only și consistența paginilor. Versiunea și
arhivele, serviciile instalate și Demo-ul public nu sunt modificate.

## 40. Filtre și paginare read-only

Store-ul SQL de test oferă separat `readJobReportPage`, cu filtre pe starea
efectivă și receipt, dimensiune 1–100 și cursor keyset pe revizie. Totalul
trialului, totalul filtrat și rezumatul numai al paginii sunt distincte.
Metoda integrală și rendererul ei nu sunt transformate implicit într-o pagină.

Amprenta metadatelor și contextul fix detectează schimbările între pagini,
inclusiv heartbeat/receipt fără revizie nouă. Cursorul vechi produce
`job_report_changed`, nu o combinație ascunsă de date noi și vechi. Cursorul nu
este credențială sau snapshot istoric; nu există autentificare publică de operator.

Prima probă SQL a descoperit lista goală null; reprezentarea a fost corectată
la `[]`, păstrând validările. Detalii și limite de volum/lockuri:
secțiunea 10 din `docs/JOBURI_DEMO_SQL_LEASE_2026-10-24.md`.
Urmează previzualizare/export static paginat, fără acțiuni administrative.

Rerulare finală: **17/17**, zero skip, inclusiv SQL real și regresia raportului
integral. Audit expuneri 493 fișiere, zero constatări; sintaxă/diff check trecute.
Nu se schimbă pachetele sau serviciile instalate și nu se activează pilotul.

## 41. Previzualizare și export static paginat

Exportul complet colectează de la prima pagină, refuză amprente/context/totaluri
diferite, duplicate, final prematur și limita depășită. Nu declară un succes
parțial. Previzualizarea distinge pagina inițială/continuarea de selecția completă;
HTML-ul numerotează paginile și afișează filtre/totaluri fără acțiuni administrative.

Sunt generate HTML/JSON pentru proba SQL și HTML/capturi desktop/mobil pentru
fixture. Chrome verifică lipsa resurselor externe, controalelor interactive și
depășirii orizontale a paginii mobile. Nu sunt capturi ale aplicației publice.
Detalii și limite: secțiunea 11 a documentului joburilor.

Urmează contractul de acces al operatorului și autorizarea citirii într-un
harness autentificat. Nu se expune raportul public și nu se schimbă arhivele.

Probe combinate **16/16** cu SQL și Chrome; rerularea exportului final **8/8**,
zero skip. Capturile au fost inspectate; audit expuneri 494 fișiere, zero
constatări; sintaxă/diff check trecute și zero procese sintetice active.

## 42. Citirea raportului prin identitate separată de operator

Harness HTTP numai de test, cu tokenuri opace preemise și realm/permisiune/scope
explicit. Superadminul ERP și administratorul companiei Demo nu devin operatori.
Citirea/exportul verifică sesiunea înainte și după fiecare pagină; revocarea sau
expirarea nu divulgă un export parțial. Nu există comenzi administrative.
Detalii și limite de autentificare: secțiunea 12 a documentului joburilor SQL.
Urmează identitatea operatorului și auditul consultărilor pentru serviciul separat,
nu publicarea harness-ului. Demo-ul public, runtime-ul instalat și pachetele nu
sunt modificate.

## 43. Identitate operator și contract de audit (25 octombrie 2026)

Adaptor de identitate exclusiv de test: proof verificat out-of-band, tokenuri
aleatoare păstrate prin hash, TTL, revocare și invalidare la schimbarea drepturilor.
Harness-ul cu resolver cere un sink de audit; raportul nu este divulgat dacă
salvarea auditului eșuează sau autoritatea este retrasă în timpul salvării.
Nu există încă furnizor real login/MFA ori jurnal durabil. Urmează persistența
auditului și probe de eșec/restart. Detalii: secțiunea 13 a documentului joburilor.
ERP, Demo public, versiune și arhive neschimbate.

## 44. Persistența jurnalului de consultare în test

Sink JSONL limitat și validat, writer exclusiv și confirmare fsync, cu recitire
în proces nou după închidere normală. HTTP cu identitate separată nu livrează
raportul dacă sink-ul eșuează. Datele trunchiate/secvențele invalide sunt refuzate.
Nu se declară recuperare automată după crash ori garanție power-loss/exactly-once.
Urmează recuperarea controlată pentru lock stale; detalii și limite în secțiunea
14 a documentului joburilor SQL. Demo public și pachetele rămân neatinse.

## 45. Recuperare explicită a writerului de audit în test

Lock cu PID/nonce și barieră comună pentru deschidere/recuperare. Reluarea cere
proces absent, jurnal valid și confirmarea neschimbată a amprentei; lockul vechi
este arhivat local pentru diagnostic. Fără procese omorâte sau evenimente șterse.
25 probe trecute, SQL opt-in sărită. Limite și probe: secțiunea 15 a documentului
joburilor. Urmează consultare/export cu SQL, identitate și jurnal persistent
integrate în aceeași probă. Nu se publică ori actualizează aplicația în această etapă.

## 46. Probă integrată pentru consultarea operatorului

Identitate separată și token generat → HTTP → export în trei pagini din SQL de
test → jurnal persistent. Probele includ refuz înainte de SQL pentru lipsa
drepturilor, indisponibilitatea jurnalului și revocare după citire, fără divulgarea
raportului. Registrul SQL este comparat înainte/după. Detalii: secțiunea 16 din
documentul joburilor SQL. Urmează consolidarea acceptanței și blocajelor pentru
pilot, nu publicarea automată. Versiune/arhive/instanțe instalate neschimbate.

## 47. Acceptanță consolidată și ieșirea din etapa de raportare

`docs/PORTI_PILOT_DEMO_PRIVAT_2026-10-25.md` separă dovezile locale de cele
necesare în producție și menține NO-GO public. Raportul inițial marchează acum
explicit rezultatele/pașii istorici; nu pretinde rerularea tuturor suitelor.
Urmează contractul serviciului separat și matricea negativă de izolare SQL/OS,
nu extensii cosmetice ale raportului. Alegerea furnizorului real de autentificare,
mediului și retenției rămâne explicită înainte de activare.

## 48. Contractul serviciului și matricea negativă de izolare

`docs/CONTRACT_SERVICIU_DEMO_PRIVAT_2026-10-25.md` definește separarea operator,
worker, adaptor privilegiat, gateway, runtime A/B și backup. Include intrările
admise, autoritatea, ținta de acces și probe negative sub identități reale.
Fixture-ul SQL existent folosește identitatea Windows curentă și nu este dovadă
de ACL A/B. Căile DDL/bootstrap din db.js cer separare înainte de reducerea
drepturilor runtime. Nu s-au creat conturi sau modificat permisiuni SQL/OS.
Urmează inventarul read-only al mediului și planul fixture-ului dedicat.

## 49. Inventar local și plan pentru identități distincte

`docs/INVENTAR_IZOLARE_DEMO_LOCAL_2026-10-25.md`: SQL Express activ, autentificare
SQL disponibilă, conexiune curentă sysadmin; sesiune OS neelevată. Node observat
24.15.0, nu Node 20 declarat. Nicio mutație SQL/OS în inventar. Planul propune
trei baze-canari și două loginuri strict de test, cu conexiuni autentificate real
și cleanup pe manifest; cere confirmare înainte de setup. Proba OS rămâne separată.

## 50. Izolare SQL locală cu loginuri distincte

Proba autorizată a creat trei baze-canari și două loginuri minime, a verificat
conexiuni reale A/B, operații proprii, refuzuri între baze/CP și parole greșite.
Test final trecut fără skip; cleanup confirmat. Eșecurile inițiale ale fixture-ului
și runId-urile sunt documentate în inventarul local, secțiunea 6. Nu s-au schimbat
schema ERP sau configurația SQL Server. Urmează planul identităților OS/ACL;
izolarea fișierelor și mediul Linux nu sunt încă probate.

## 51. Pregătirea probei OS — blocaj de context administrativ

Checker read-only: `scripts/windows/check-demo-os-isolation.ps1`. Contextul actual
nu este elevat; identități OS distincte/ACL/logon neprobate. Planul și scope-ul de
autorizare sunt în `docs/PLAN_PROBA_IZOLARE_OS_2026-10-25.md`: două conturi locale
temporare, director nou și canari/chei fictive, probe sub SID real și cleanup strict.
Nu se creează conturi și nu se modifică ACL-uri până la confirmare și context
administrativ dedicat. Nu se încearcă elevare sau schimbare de politici implicită.

## 52. Script OS pregătit pentru execuție administrativă autorizată

Scope confirmat. `scripts/windows/test-demo-os-isolation.ps1` pregătit cu opt-in,
conturi/SID distincte, director/canari noi și cleanup strict. Parser părinte/copil
și refuzul fără elevare verificate. Proba reală nu a fost executată în sesiunea
neelevată; se cere rezultatul utilizatorului din PowerShell Administrator.
Comanda, criteriile passed/cleanup și limitele profilelor sunt în planul OS.

## 53. OS blocat; curățare confirmată; decizie de rutare verificată

Ambele rulări cu profil restant au fost curățate prin scripturile dedicate,
conform capturilor utilizatorului. Proba Windows rămâne blocată de politica de
execuție a contului temporar; fără Bypass sau schimbare de politici.
`docs/PROBA_RUTARE_DEMO_2026-10-25.md` descrie noul resolver și harness HTTP
exclusiv de test: host/trial/runtime din registru, expirare și legări verificate,
fără selectors client ori forwarded headers. 14/14 probe cu regresia modelului;
nu este proxy real. Urmează două runtime-uri sintetice cu destinații server-side.

## 54. Două listener-e HTTP sintetice legate de rutarea trialului

Harness dedicat transmite numai proba JSON la servere loopback înregistrate
server-side. A/B separate, fără selectors client, propagare cookie/Authorization
sau fallback către vecin. Refuz înainte de conectare pentru necunoscut/expirat;
revalidare înainte de divulgare, timeout, limită răspuns și redirect refuzat.
25/25 probe cu regresiile, zero skip. Nu sunt procese ERP separate sau gateway
de producție. Detalii/limite în PROBA_RUTARE_DEMO_2026-10-25.md. Urmează sesiunile
sintetice legate de instanță și refuzul reutilizării pe vecin.

## 55. Sesiuni sintetice host/trial/runtime în gateway-ul de test

Tokenuri aleatoare hash-only, TTL și revocare; A/B nu își pot reutiliza sesiunea
pe vecin, iar refuzul apare înainte de contactarea runtime-ului. Sesiunea este
reverificată după răspuns; expirarea/revocarea opresc divulgarea. Nu se propagă
cookie/Authorization spre runtime. Fără login, cookie browser sau auth ERP reală.
Detalii în proba rutării. Urmează invalidarea la generație nouă de runtime.

## 56. Generație runtime în sesiunile sintetice

Înregistrare CAS, generație internă și refuzul reutilizării unui listener retras.
Close/relisten pe același port nu reactivează tokenurile; înlocuirea A nu afectează
B. Identitatea țintei este reverificată înainte de divulgare. 36/36 probe cu
regresii, zero skip. Nu este restart de serviciu real sau persistență SQL.
Urmează contractul de coordonare/persistență a generației în control plane,
distinct de revizia lifecycle și de generația lease-ului unui job.

## 57. Generație runtime persistentă în SQL de test

Migrare 004 numai pentru control-plane-test, store cu citire, avans CAS și receipt
idempotent. Numărător/epocă distincte de lifecycle și lease job. 7/7 probe reale
trecute, zero skip; concurență, retry vechi, rollback, ack pierdut și B neafectat.
Regresii rutare/sesiuni/model 36/36 separat. Detalii/bază în
`docs/GENERATII_RUNTIME_SQL_2026-10-25.md`. Nu este încă legat de sesiunile gateway;
urmează adaptorul de citire/validare SQL fail-closed. Fără actualizare de instalat.

## 58. Validarea sesiunilor prin generația SQL curentă

Adaptor de test între sesiuni volatile și readRuntimeGeneration; leagă listenerul
și tokenul de generație+epocă. Gateway-ul așteaptă autorizarea asincronă, fără
fallback la eroarea SQL. Nu folosește receipt istoric. Probele și limitele sunt
în GENERATII_RUNTIME_SQL_2026-10-25.md. Sesiunile reale ERP și serviciile instalate
nu sunt modificate. Urmează închiderea ferestrei de expirare/rutare pe durata
validării SQL asincrone, fără promisiune de tranzacție distribuită cu socketul.

## 59. Expirare și schimbare rută în timpul autorizării asincrone

Revalidare după autorizer înainte de conectare și după autorizerul final înainte
de divulgare. Probe deterministe cu cititor SQL simulat: termen exact, revizie
schimbată și lifecycle retras, vecin neafectat. 44 probe trecute, 1 SQL opt-in
sărită; nu se declară SQL real rerulat. Detalii în GENERATII_RUNTIME_SQL.
Urmează deadline/anulare la control plane lent și client deconectat. Nu se
promite atomicitate între ultima verificare și socket; fără schimbări publice.
