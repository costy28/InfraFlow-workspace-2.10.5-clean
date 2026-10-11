# Audit permisiuni — stare în lucru, 10 octombrie 2026

Acest document nu certifică închiderea auditului și nu reprezintă o versiune livrată.
Modificările sunt locale; instalațiile active nu au fost actualizate sau repornite.

## SQL real pentru rute HR relaționale — 11 octombrie

- `INFRAFLOW_TEST_HR_SQL=1` activează proba opțională din `hr-route-access.test.js`: handler-ele reale execută SQL pe o bază SQL Express nouă cu schemă sintetică minimală. Auth/app_state sunt fixture VM, nu login HTTP real în acest test.
- Baza reușită păstrată: `INFRAFLOW_TEST_HR_B02D7E09A405`. Bazele intermediare de probă sunt păstrate; nu s-au șters baze.
- Verificate: listă proprie, filtrarea CNP/salariu coleg, transfer autorizat, departament invalid fără INSERT, angajat inexistent fără INSERT, contract REGES nepotrivit refuzat.
- Proba a determinat corectarea transferului SQL: selectarea departamentului prin ID/cod/nume păstrează codul real și ID-ul canonic, nu ID-ul drept cod.
- 48/48 teste de rute trecute, inclusiv SQL real. Nu certifică schema completă de migrări sau întreaga aplicație relațională; acestea și browser/API relațional rămân de validat. Fără deployment/restart.

## Provider MSSQL app_state isolat — 11 octombrie

- `node scripts/verify-hr-http-permissions.js --mssql` a trecut pe baza nouă `INFRAFLOW_TEST_PERMISSIONS_87ADB70F71C7`, SQL Express local, autentificare Windows integrată.
- Login real, listare proprie, sanitizare coleg, patru refuzuri HTTP și comparație listă integrală înainte/după: trecute. Scheduler dezactivat; proces temporar oprit.
- Baza fictivă este păstrată pentru diagnostic; nu s-au șters baze și nu s-a accesat baza activă. Numele generat este restrâns prin validare explicită.
- Acest test folosește MSSQL app_state cu `INFRAFLOW_SQL_RELATIONAL=0`. NU validează tabelele/rutele HR relaționale și nu este o probă UI pe MSSQL. Acestea rămân distinct de executat.

## Browser conectat la API real JSON — 11 octombrie

- `node scripts/verify-hr-http-permissions.js --ui` folosește tokenuri obținute prin login real, build temporar și proxy local GET către serverul izolat. API-urile nu sunt simulate în acest mod.
- Chrome verifică două roluri restrictive: după terminarea încărcării, pontajul propriu afișează Propriu și nu Colegul; răspunsurile listei conțin unul/două rânduri conform drepturilor, cu CNP coleg sanitizat.
- Panourile administrative și Angajat nou sunt absente, CRM este restricționat, fără excepții JavaScript. Cele patru refuzuri API sunt reverificate; fără modificarea angajaților.
- Testul a trecut. Procesele temporare sunt oprite; capturile/baza fictivă sunt păstrate în temp.
- SQL Express local este disponibil (verificare servicii read-only), dar MSSQL izolat nu a fost încă probat. Nu s-au citit credențiale și nu s-au făcut scrieri în baza activă.

## Browser cu roluri restrictive — 11 octombrie

- `scripts/verify-permissions-ui.cjs` servește build-ul temporar pe loopback și verifică în Chrome headless două roluri restrictive. API-urile sunt simulate; nu este integrare browser/API end-to-end.
- Captura a identificat panourile administrative Flux simplu HR/Asistent HR vizibile la pontaj propriu. Acum cer administrare workflow și toate drepturile sensibile, evitând acțiuni neautorizate și sumar fals pentru date neîncărcate.
- Testul confirmă taburile filtrate, lipsa panourilor și a butonului Angajat nou, lipsa cererilor REGES/conturi asociabile, blocarea CRM și lipsa cererilor CRM.
- Build și test browser trecute; capturi în director temporar. MSSQL izolat și browser cu API real rămân de validat. Fără deployment/restart.

## Prima probă HTTP izolată HR — 11 octombrie

- `node scripts/verify-hr-http-permissions.js` pornește aplicația reală pe loopback/port temporar, cu bază JSON în director temporar și scheduler dezactivat. Procesul este oprit în finally; baza de probă este păstrată local.
- Login real pentru trei roluri restrictive, refuz fără autentificare, listă proprie cu un singur angajat, sanitizare CNP/salariu coleg și patru refuzuri HTTP (asociere cont, salariu, istoric REGES, conturi asociabile): trecute.
- Comparația înainte/după confirmă că refuzurile nu modifică angajații. Scrierile normale de autentificare/audit sunt limitate la baza temporară.
- Fixture-ul conține un superadmin separat pentru a evita promovarea automată a primului utilizator la normalizare. Nu s-a schimbat această regulă în produs.
- Nu este o probă UI și nu validează MSSQL. Fără deployment sau restart al instalațiilor active.

## Filtru comun client — 11 octombrie

- Corecție critică în `canAccess`: lista evaluată conținea literal rolurile administrative, astfel că orice utilizator trecea filtrul UI. Acum se evaluează numai rolurile utilizatorului.
- Trei regresii noi verifică utilizator absent/limitat, permisiuni punctuale și roluri administrative explicite. Protecțiile API sunt independente.
- 10/10 teste focalizate UI-policy/permisiuni/navigare HR trecute, build temporar reușit.
- Pregătirea HTTP a fost întreruptă pentru această corecție; nu s-a executat încă proba HTTP/UI reală sau MSSQL izolat. Fără deployment/restart.

## Verificare cumulată și conturi asociabile — 11 octombrie

- Lista conturilor asociabile cere administrare angajați (dedicată sau HR generală) plus `users:manage`; frontend-ul nu o solicită fără aceste drepturi.
- Regresia verifică refuzurile, accesul dedicat autorizat, excluderea conturilor inactive și absența secretelor din răspuns.
- Suitele acumulate HR/permisiuni/Contracte/CRM/Referate/Tichete: 123/123 trecute. Build frontend temporar reușit.
- Aceste rezultate nu certifică închiderea auditului: HTTP/UI cu roluri reale și MSSQL izolat rămân necesare. Nu s-au creat pachete sau repornit instalații.

## Transfer departamente — continuare 11 octombrie

- Transferul acceptă administrarea HR sau dreptul dedicat administrării angajaților, coerent cu formularul de editare.
- JSON refuză departamente inexistente înainte de scriere și păstrează ID-ul canonic când se selectează prin cod/nume.
- SQL are verificări suplimentare pentru existența angajatului și a departamentului numeric înainte de UPDATE/INSERT; execuția MSSQL izolată nu este încă verificată.
- 66/66 teste handler JSON/VM și regresie HR trecute; fără deployment, restart sau pachete.

## Asociere angajat–cont — 11 octombrie

- Crearea/editarea cu `user_id`, inclusiv gol sau null, cere `users:manage` în plus față de administrarea angajaților. Această legătură acordă acces la date proprii și nu este un câmp operațional obișnuit.
- Formularul dezactivează selecția contului și elimină câmpul din payload fără acest drept.
- 45/45 teste handler JSON/VM și politică UI trecute, inclusiv refuz fără scriere, conflict existent, asociere autorizată și eliminarea legăturii; build temporar reușit.
- Transferurile rămân pentru pasul următor. Validarea HTTP/UI real și MSSQL izolat este încă necesară; fără deployment sau restart.

## Registru intern HR și REGES — continuare 11 octombrie

- Cele cinci rute de export, istoric și diagnostic cer cumulativ export REGES, acces personal sensibil și acces salarial; interfața folosește aceeași condiție.
- Exportul XML refuză contractul care nu aparține angajatului selectat, înainte de generarea fișierului sau scriere.
- Teste handler JSON/VM: 41/41 trecute; build frontend temporar și verificarea sintaxei serverului trecute.
- Nu s-a validat încă prin HTTP/UI real sau MSSQL izolat. Nu s-au creat pachete și nu s-au repornit instalații.

## Corecții verificate automat

- Contracte: filtrarea portofoliului folosește funcția existentă pentru task-uri.
- Tichete: termenul NULL nu devine data epoch și nu marchează automat un tichet nou depășit.
- Referate: dreptul de vizualizare nu permite avansarea/respingerea unei etape; stările necunoscute sunt refuzate.
- HR: acces propriu/departament/global pentru pontaj, foaie lunară, completare lună, controale săptămânale, export Nexus și planificarea turelor.
- HR: banca de ore, compensarea și cererile de concediu verifică angajatul țintă.
- HR: validarea/devalidarea în masă refuză integral selecțiile care conțin angajați neautorizați sau inexistenți.
- HR: overview și remindere limitate la departamentul aprobatorului; lipsa departamentului nu acordă acces global.
- HR: termenul general necesită administrarea pontajelor.
- HR: fișele incluse în pontaj și salariile din contractele/raportul lunar verificate sunt filtrate după drepturi.
- Interfață pontaj: tab propriu accesibil, editare pe rând și acțiuni administrative condiționate de drepturi.

## Dovezi și limite

Continuare documente HR: lista concediilor maschează detaliile certificatului pentru
colegi fără acces medical; starea verificării rămâne disponibilă pentru fluxul de aprobare.
Descărcarea certificatelor altor angajați cere `hr:medical_view`. Verificarea/respingerea
cere și administrarea concediilor. Registrul medical financiar și exportul cer drepturi
medicale și salariale; transmiterea către salarizare cere aceleași drepturi sensibile.
Generarea/arhivarea Word cere acces explicit personal și salarial înainte de citirea
șablonului, inclusiv în validarea dry-run care folosește același helper.
Cele 20 de teste ale handler-elor HR trec. Testul pozitiv Word verifică doar trecerea
controlului de acces până la eroarea de șablon absent, nu generarea unui document real.

Continuare Tichete: accesul la liste/detalii acceptă dreptul de departament sau global,
fără să solicite suplimentar dreptul propriu. Listele MSSQL și statisticile JSON/MSSQL
sunt limitate la aria vizibilă. Cele 12 teste focalizate de permisiuni și suport trec;
noua interogare MSSQL rămâne de validat pe baza de test izolată.

Suita combinată de regresie are 76 de teste trecute. Testele de rute HR execută handler-ele
reale cu autentificare și baza JSON simulate, în memorie, fără trafic HTTP și fără datele
instalației. Politicile folosesc verificarea reală a permisiunilor.
Build-ul frontend a reușit într-un director temporar de verificare.

Aceste rezultate NU probează execuția SQL a ramurilor MSSQL, autentificarea HTTP reală,
comportamentul complet al interfeței sau izolarea între organizații.

Fișiere HR: lista și descărcarea folosesc aceeași politică pentru documentele personale,
salariale și medicale; fișierele neclasificate cer toate drepturile sensibile. Accesul
propriu rămâne disponibil. Patru teste execută middleware-urile și handler-ele reale
cu DB/autentificare/storage simulate: liste filtrate, refuz înainte de verificarea
storage, predare către download pentru acces autorizat și refuz schimbare ID în Kiosk.
Nu s-a descărcat un fișier real și nu s-au testat sesiuni Kiosk reale.

Scrierile în dosar (upload, generare HTML, modificare și anulare) verifică acum și
categoria documentului. Reclasificarea cere acces la categoria veche și la cea nouă,
înainte de mutație. Angajatul inexistent nu primește acces nici prin drepturi globale.
Suita focalizată pentru fișiere are 9 teste trecute; upload-ul multipart real rămâne
de validat separat, împreună cu interfața și furnizorul MSSQL.

Raportul complet de dosar XLSX și raportul de management JSON/XLSX cer acum
`hr:view`, `hr:reports`, `hr:personal_sensitive` și `hr:medical_view`, deoarece includ
metadate documente și informații medicale. Cele 8 teste ale rutelor de dosar trec,
inclusiv cazul pozitiv pentru raportul de management. Dashboard/inbox/jurnal și
fluxurile onboarding/offboarding rămân de verificat separat; auditul nu este închis.

Dashboard/checklist dosar, Inbox HR și scadențele avansate sunt vederi agregate care
includ informații personale și medicale; cer acum ambele drepturi. Jurnalul JSON/XLSX
cere suplimentar drept salarial, deoarece detaliile auditului sunt text liber.
Este o protecție la nivelul întregii vederi, nu o mască pe fiecare rând. Cele 11 teste
ale rutelor de dosar trec, inclusiv accesul autorizat la Dashboard. Interfața trebuie
aliniată cu aceste cerințe înainte de livrare; onboarding/offboarding este încă în audit.

Fluxurile complete onboarding/offboarding cer drepturi personale, medicale și salariale,
pe lângă vizualizare sau administrare. Sunt protejate citirea, pornirea, modificarea
pașilor și închiderea. Cele 13 teste de rute de dosar trec, inclusiv pornirea autorizată.
Frontend-ul nu mai încarcă workflow-ul în fișa angajatului fără drepturile sensibile,
iar funcțiile de mutație verifică drepturile. Build-ul temporar trece. Ascunderea tuturor
butoanelor/panourilor pentru aceste vederi rămâne de finalizat înainte de smoke UI.

Interfață continuată: workflow-ul fără acces afișează explicația, fără date sau butoane;
cititorul autorizat nu primește controale de pornire/bifare/închidere. Inbox-ul este
ascuns din navigare fără drepturile personale/medicale. Încărcarea inițială evită
apelurile neautorizate către dosar, Inbox, jurnal, raport management și scadențe.
Build-ul temporar trece; controalele din Dashboard și reîncărcările manuale ale
rapoartelor mai trebuie aliniate și apoi probate în UI.

Dashboard HR: raportul management, scadențele avansate, aprobările de concediu și
notificările administrative sunt condiționate separat. Reîncărcările/exporturile
manuale verifică aceleași drepturi înainte de request. Jurnalul din Inbox este ascuns
fără drept salarial. Build verificat pentru Dashboard; smoke UI cu roluri reale rămâne
obligatoriu, împreună cu restul controalelor din fișa/dosarul angajatului.

## Rămâne de făcut înainte de livrare

### Import angajați

Importul cere administrare angajați (dedicată sau globală) și acces personal înainte
de middleware-ul multipart. Handler-ul repetă controalele; butonul și trimiterea UI
sunt aliniate. Modelul gol de import acceptă și dreptul dedicat employees_manage.
40/40 teste rute/politică trecute, build temporar reușit. Testele verifică preflight și
continuarea până la validarea fișierului lipsă, nu un import CSV/XLSX real.
Exporturile REGES/registru și rapoartele rămase continuă în audit, fără deploy/restart.

### Formulare angajați și drept dedicat contracte

Formularele de creare/editare blochează câmpurile fără drepturi și elimină valorile
sensibile neautorizate din payload, inclusiv valorile implicite null. Acțiunile de creare
și editare sunt ascunse fără administrare angajați. Testul compară politica UI/server
pentru 8 combinații de drepturi. Contractele și actele adiționale acceptă dreptul dedicat
contracts_manage, fără a acorda modificarea fișei generale; drepturile sensibile rămân
necesare. 38/38 teste rute/politică trecute și build temporar reușit înainte de ultima
ajustare minoră de afișare a butonului Angajat nou. Proba UI și MSSQL rămâne obligatorie.

### Scrieri în fișa angajatului

Crearea/editarea acceptă hr:employees_manage sau hr:manage, dar verifică separat
fiecare categorie sensibilă prezentă în payload, inclusiv valori null. Refuzul are
loc înainte de scrieri JSON/MSSQL. Răspunsul de creare este sanitizat în ambele
ramuri. 35/35 teste rute HR trecute, cu refuz fără scriere și editări pozitive.
Formularele trebuie încă aliniate: nu trebuie trimise câmpuri sensibile neautorizate
din valorile implicite; trebuie marcate/ascunse controalele fără drepturi. Dreptul
distinct contracts_manage, celelalte operațiuni employee și testul MSSQL rămân în audit.

### Fotografii angajați: preflight upload

Autorizația pentru administrare și date personale, ID numeric și angajat existent
este verificată înainte de multer. Handler-ul repetă verificarea drepturilor;
butonul foto este ascuns fără drepturi, iar salvarea UI verifică aceleași condiții.
32/32 teste rute HR trecute, inclusiv două teste ale middleware-ului preflight;
build temporar reușit. Nu s-a executat upload multipart real sau scriere în storage
activ. Proba completă HTTP/UI/MSSQL rămâne obligatorie; fără deploy/restart.

### Fotografii angajați: citire

Download fotografia colegului cere hr:view și personal_sensitive; titularul legat
explicit își păstrează accesul. Identificatorii nenumerici sunt refuzați înainte de
storage. Cache-Control devine private, no-store; photo_url este eliminat din fișa
sanitizată fără drept personal. Trei regresii acoperă refuzul, livrarea autorizată
și traversarea directoarelor. 50/50 teste rute/regresii HR trecute.
Upload fotografia și proba HTTP/UI/MSSQL rămân în audit; fără deploy/restart.

### Răspunsuri la deciziile de concediu

Aprobarea/respingerea păstrează operațiunea existentă, dar răspunsul sanitizează
identificatorii certificatului și diagnosticul pentru aprobatori fără acces medical.
Motivul liber al concediului CM este de asemenea eliminat fără acces medical, inclusiv
din liste. Titularul și dreptul medical explicit păstrează detaliile. Datele persistate
nu sunt eliminate. 47/47 teste rute/regresii HR trecute; sintaxă Node verificată.
Nu sunt probe HTTP/UI live sau MSSQL; fără deploy/restart.

### Transfer angajat

Ruta de transfer avea o referință body nedefinită dintr-un calcul de plată overtime;
referința fără legătură a fost eliminată. Răspunsul JSON returnează angajatul sanitizat
după drepturile apelantului, fără schimbarea datelor sensibile persistate. Două regresii
verifică transferul pozitiv cu o singură scriere și refuzul fără drept administrativ.
25/25 teste rute HR trecute; transferul MSSQL și UI live rămân de verificat.

### Contracte și acte adiționale HR

Listarea actelor adiționale sanitizează salariile și observațiile libere potențial
salariale pentru colegi fără drept salarial, în ambele ramuri JSON/MSSQL.
Crearea/modificarea contractelor și crearea actelor cer administrare plus acces
personal și salarial; interfața ascunde administrarea contractuală fără aceste drepturi.
23/23 teste de rute HR trecute și build temporar reușit. Ramura MSSQL și interfața
reală nu sunt încă probate; nu s-a făcut deploy/restart.

### Notificări HR persistate în bara globală

Filtrarea notificărilor persistate din workflow verifică drepturile sensibile curente,
nu doar destinatarul. Notificările istorice de scadențe/Inbox HR sunt ascunse după
retragerea oricărui drept sensibil, fără ștergere. Reminderul propriului dosar rămâne
disponibil angajatului legat explicit; drepturile nu ocolesc destinatarul notificării.
Trei regresii execută funcțiile reale de filtrare cu politica centrală. Verificarea
HTTP/UI reală și MSSQL izolată rămâne obligatorie; nu s-a făcut deploy/restart.

### Cost orar și notificări detaliate HR

Sanitizarea angajatului elimină și cost_ora fără acces salarial. Generarea, citirea
și rezolvarea notificărilor detaliate cer administrare plus drepturi personale,
medicale și salariale, cu aceleași condiții în UI. Distribuirea exclude destinatarii
administrativi fără drepturile sensibile, inclusiv fallback-ul apelantului.
Regresiile verifică refuzul fără scrieri, distribuția pozitivă numai către destinatarul
autorizat și păstrarea datelor salariale originale. Suite fișiere/HR: 36/36 trecute.
Notificările istorice deja persistate și vizibilitatea lor în endpoint-ul global
rămân de verificat separat; nu au fost șterse automat.

### Acțiuni pe categorii de fișiere

Dosarul electronic filtrează categoriile de încărcare/reclasificare după politica
serverului; editarea și anularea cer administrare plus acces la categoria curentă.
Handler-ele verifică aceleași condiții înainte de cerere. Documentele proprii păstrează
accesul existent; categoriile neclasificate rămân conservative, cu toate drepturile
sensibile. Testul UI/server compară 8 combinații de drepturi pe 7 categorii.
Verificări: 19/19 teste fișiere/politică, build temporar reușit. Fără probă UI live,
deploy sau restart; acestea rămân necesare înainte de livrare.

### Kiosk din fișa angajatului

Sumarul Kiosk nu declară documentele complete când nu există date încărcate sau
drepturi personale/medicale. Reminderul pentru întregul dosar cere administrare HR
și toate cele trei drepturi sensibile, atât pe server cât și în interfață, deoarece
poate modifica inclusiv documente contractuale. Regresia verifică fiecare drept
lipsă și absența scrierilor. Suita fișierelor: 14/14; build temporar Vite reușit.
Nu s-a verificat încă HTTP/UI live sau MSSQL; fără deploy/restart.

### Verificare interfață contracte HR

Butoanele pentru generare/print și Word sunt ascunse fără vizualizare HR,
date personale și drept salarial. Arhivarea Word cere administrare HR plus
drepturile personale și salariale. Callback-urile sunt eliminate în router,
iar componentele nu afișează acțiuni fără callback autorizat.

Verificare locală: 86 teste trecute, 0 eșecuri; build Vite reușit în directorul
temporar `.permission-build-check-3`. Aceste verificări nu înlocuiesc proba
HTTP/UI cu roluri reale și proba MSSQL izolată. Nu s-a făcut deploy sau restart.

1. Revizuire finală a tuturor rutelor HR rămase, inclusiv ajustări bancă de ore,
   documente medicale, fișiere, rapoarte și drepturile administrative distincte.

   Ajustarea băncii de ore este acum protejată prin aria aprobatorului înainte de orice
   INSERT sau scriere JSON. Trei regresii verifică refuzul altui departament, succesul
   în departamentul autorizat și refuzul unui angajat inexistent. Documentele medicale,
   fișierele și restul rapoartelor rămân în revizuire.
2. Alinierea acțiunilor CRM și a celorlalte pagini modificate cu permisiunile serverului.
3. Test HTTP și UI cu roluri restrictive, apoi probă pe o bază MSSQL de test izolată.
   Nu se folosesc scrieri de test în baza activă a utilizatorului.
4. Revizuirea configurațiilor de roluri semnalate în rapoartele utilizatorului;
   drepturile existente nu au fost rescrise automat.
5. Abia după verificări: versiune, note de update și pachete Windows/Linux împreună.
6. După încheierea verificărilor începute: analiza conversației furnizate de utilizator
   la https://chatgpt.com/share/6aca0fad-d514-83ed-8f73-5a31e0c720fa.
