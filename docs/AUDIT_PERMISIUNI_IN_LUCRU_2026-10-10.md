# Audit permisiuni — stare în lucru, 10 octombrie 2026

Acest document nu certifică închiderea auditului și nu reprezintă o versiune livrată.
Modificările sunt locale; instalațiile active nu au fost actualizate sau repornite.

## Kiosk HR — identitate MSSQL și resetare protejată — 12 octombrie

- Activarea, loginul, solicitarea de resetare, profilul propriu și identificarea pentru foile de parcurs citesc acum angajatul activ din `hr.employees` când providerul relațional este activ; nu mai depind de copia angajatului din snapshot-ul JSON.
- Loginul Kiosk refuză un cont a cărui fișă de angajat a fost dezactivată. Profilul propriu citește din MSSQL pontajele lunii, concediile și autorizațiile angajatului autentificat, păstrând sanitizarea pentru acces propriu.
- Confirmarea resetării este limitată după trei combinații greșite, la fel ca activarea/loginul. Codurile noi nu mai dublează CNP-ul în stocarea temporară; codurile vechi care conțin CNP rămân compatibile până la expirare.
- Solicitarea de resetare notifică numai conturile HR active. Regresia izolată a trecut cu 80 teste active și un test SQL opțional omis.
- Proba SQL Server reală a trecut pe baza sintetică păstrată `INFRAFLOW_TEST_HR_7FA0231190A9`, inclusiv activare Kiosk, login, refuz după dezactivarea angajatului și profil relațional cu pontaj și autorizație.
- Baza intermediară `INFRAFLOW_TEST_HR_A2C892EA1DAE` este păstrată: a expus că fixture-ul vechi nu reproducea coloana oficială `created_at` din `hr.leave_requests`; fixture-ul a fost aliniat la migrarea existentă.
- Credencialele Kiosk rămân în stocarea aplicației în această etapă; mutarea lor cere o migrare versionată separată. Sincronizarea offline și cererile Kiosk rămân de verificat relațional în lotul următor.
- Nu s-au făcut deployment, restart, versiune nouă sau pachete și nu a fost atinsă instalația activă.

## Depunere pontaj cu notificare persistentă — 12 octombrie

- Finalizarea pontajului de departament creează acum aceeași notificare persistentă pentru HR atât în JSON, cât și în MSSQL, emite evenimentul live și deschide direct `/hr?section=overview`.
- Conturile HR inactive sunt excluse, luna este validată strict înainte de scriere, iar controlul existent pentru departamentul propriu sau administrarea globală rămâne neschimbat.
- Regresia izolată a trecut cu 77 teste active și un test SQL opțional omis. Proba SQL Server reală a trecut pe baza sintetică păstrată `INFRAFLOW_TEST_HR_B4A58BF27210`.
- Baza intermediară `INFRAFLOW_TEST_HR_86EF5E8F2394` este păstrată: a expus doar o aserțiune veche care amesteca notificările de depunere cu reminderele; filtrul testului a fost restrâns la tipul verificat.
- Fluxul HTTP/browser cu autentificare reală a confirmat depunerea, notificarea superadminului, respingerea lunii invalide și deschiderea tabului „Overview pontaje”. Capturile și baza JSON izolată sunt păstrate în `C:\Users\costy\AppData\Local\Temp\infraflow-hr-http-auudok`, inclusiv `timesheet-overview-deep-link-real-api.png`.
- Nu s-au făcut deployment, restart, versiune nouă sau pachete și nu a fost atinsă instalația activă.

## Remindere pontaj persistente în MSSQL — 12 octombrie

- Ruta de reminder nu mai întoarce artificial `sent: 0` în modul relațional. Destinatarii sunt angajații activi cu utilizator activ asociat, grupați pe departamente active care nu au pontajul marcat `finalizat` pentru luna cerută.
- Sunt respectate aria globală și aria propriului departament. Luna este validată strict; un aprobator de departament fără departament asociat rămâne refuzat.
- Pentru fiecare destinatar se creează o notificare persistentă în aplicație, se emite evenimentul live și se încearcă separat emailul de pe fișa angajatului. Un eșec SMTP nu anulează notificarea; răspunsul diferențiază `sent` de `emailed`.
- Notificarea deschide `/hr?section=pontaj`; pagina HR interpretează acum parametrul și deschide direct tabul permis, cu fallback la primul tab accesibil.
- Regresia politicii a trecut 10/10, regresia rutelor JSON 66/66 cu testul SQL opțional omis, build-ul React a trecut în `.permission-build-check-5`, iar proba SQL reală a trecut pe `INFRAFLOW_TEST_HR_E97127704B39` cu doi destinatari și două notificări persistente.
- Verificarea reală HTTP/browser a trecut cu autentificare pe rol dedicat pontajului: aria proprie, overview-ul global, reminderul persistent, refuzul lunii invalide și deep-link-ul spre tabul Pontaj au fost confirmate. Capturile și baza JSON izolată sunt păstrate în `C:\Users\costy\AppData\Local\Temp\infraflow-hr-http-ds0Gyf`, inclusiv `timesheet-deep-link-real-api.png`.
- Baza SQL sintetică este păstrată pentru audit. Nu s-au făcut deployment, restart, versiune nouă sau pachete; livrarea SMTP reală nu a fost testată pe instalația activă.

## Pontaj pe departament în MSSQL — 11 octombrie

- Filtrul comun de acces recunoaște acum și `department_cod`/codul din nomenclator, fără diferență între litere mari și mici. Filtrul SQL verifică ID-ul, codul și denumirea departamentului; dreptul pe un departament nu se extinde în altul.
- `timesheets/my-department` returnează în MSSQL angajații din aria permisă, pontajele lunii și starea finalizării departamentului, cu fișele angajaților trecute prin sanitizarea existentă. Luna este validată strict.
- Overview-ul MSSQL calculează procentul din pontajele existente raportate la angajații activi și zilele lunii, păstrând statusul depus sau derivând `în_lucru`/`necompletat`. Aprobatorul de departament primește numai departamentul asociat.
- Regresia politicii a trecut 10/10, iar regresia rutelor JSON a trecut 65/65 cu testul SQL opțional omis. Proba SQL reală a trecut pe `INFRAFLOW_TEST_HR_CB201861AED9`, inclusiv status `finalizat`, patru pontaje și procent 6%.
- Bazele intermediare `INFRAFLOW_TEST_HR_7A4FAAD36573` și `INFRAFLOW_TEST_HR_173195CAD95F` sunt păstrate; ele au expus doar două aserțiuni fragile ale testului (ordinea alfabetică și verificarea titularului în locul colegului), corectate fără schimbarea politicii aplicației.
- Nu s-au făcut deployment, restart, versiune nouă sau pachete. Nu este încă o probă browser/login HTTP pentru aceste două vederi.

## Tichete de masă și protecția CNP — 11 octombrie

- Lista tichetelor de masă folosește aceeași agregare pentru JSON și MSSQL relațional, inclusiv pontajele validate și zilele CO/CM aprobate care se suprapun lunii selectate. Luna este validată strict în forma `AAAA-LL`.
- CNP-ul nu mai este returnat în lista folosită de interfață. Exportul CSV care conține CNP cere explicit atât `hr:view`, cât și `hr:personal_sensitive`; configurarea valorii tichetului rămâne disponibilă numai cu `hr:manage`.
- Interfața ascunde exportul fără acces la date personale și dezactivează configurarea fără drept de administrare. Regresia JSON a trecut cu 65/65 teste, un test SQL opțional omis, iar build-ul React a trecut în directorul temporar `.permission-build-check-4`.
- Proba relațională SQL Server reală a trecut integral pe baza sintetică `INFRAFLOW_TEST_HR_CBDB942039B5`: două zile lucrate, o zi CO, un tichet rezultat, listă fără CNP, refuz 403 fără drept sensibil și export autorizat cu CNP. Baza este păstrată pentru audit.
- Nu s-au făcut deployment, restart, versiune nouă sau pachete. Nu este încă o probă browser/login HTTP pentru această secțiune.

## Raport lunar pontaj pe MSSQL relațional — 11 octombrie

- Ruta `raport-lunar` citește acum angajatul, pontajele, programările/turele și contractul activ din tabelele relaționale atunci când MSSQL este activ; ramura JSON păstrează fluxul existent.
- Luna este validată strict în forma `AAAA-LL` înainte de accesarea datelor. Accesul propriu/departament/global rămâne controlat de politica pontajului, iar sporurile salariale sunt returnate numai titularului sau rolului cu `hr:salary_view`.
- Proba relațională verifică un pontaj de 10 ore într-o tură de 8 ore, calculul a 2 ore suplimentare, 2 ore de noapte, o zi CO, observația Unicode și sporurile calculate din contractul SQL. Regresia JSON a trecut 63/63, cu testul SQL opțional omis.
- Prima probă SQL a identificat exclusiv un literal fără prefix Unicode în fixture și a păstrat baza `INFRAFLOW_TEST_HR_A60417BE0FEA`. După corectarea fixture-ului fără relaxarea aserțiunii, proba relațională a trecut pe `INFRAFLOW_TEST_HR_D2B9197BCF76`.
- Bazele sunt păstrate pentru audit; nu s-au făcut deployment, restart, versiune nouă sau pachete.

## CIM și adeverințe HR pe stocare relațională — 11 octombrie

- Ruta CIM citește acum contractul activ din `hr.contracts` în modul MSSQL, nu din snapshot-ul `app_state`. Contractul și angajatul trec prin politica salarială înainte de răspuns: titularul sau rolul cu `hr:salary_view` păstrează valorile, iar simplul `hr:view` nu mai vede salariul ori costul orar al colegului.
- Ruta de adeverințe folosește același contract relațional, validează lista tipurilor acceptate și refuză adeverința de venit/medicală fără accesul sensibil necesar. Textul actului de identitate este construit numai din angajatul deja sanitizat.
- Numărul zilelor de concediu medical din ultimele 12 luni este citit din `hr.leave_requests` în MSSQL și este returnat numai titularului sau rolului cu `hr:medical_view`. Pentru celelalte tipuri, utilizatorul limitat nu primește nici măcar agregatul medical.
- Regresia JSON finală a trecut cu 62/62 teste și un test SQL opțional omis. Proba SQL integrală pentru CIM a trecut 61/61 pe `INFRAFLOW_TEST_HR_F6F10084669A`; proba relațională țintită după extinderea adeverințelor a trecut pe `INFRAFLOW_TEST_HR_1983EF0D79C9`.
- Bazele sintetice sunt păstrate pentru audit. Nu s-au făcut deployment, restart, versiune nouă sau pachete; testul nu folosește baza activă.

## Evaluări HR pe MSSQL relațional — 11 octombrie

- Migrarea idempotentă `077_hr_evaluations.sql` adaugă tabelul relațional, constrângeri pentru tip/calificativ/punctaj/status și indexul angajat-dată.
- La prima aplicare într-o instalație relațională, evaluările vechi valide din `dbo.app_state` sunt importate numai pentru angajați existenți. Testul a aplicat migrarea de două ori și a confirmat o singură înregistrare importată; evaluarea cu angajat inexistent a fost ignorată.
- Listarea, crearea, editarea și ștergerea folosesc SQL parametrizat în modul relațional. Evaluatorul este derivat exclusiv din sesiunea autentificată; payload-ul nu poate schimba evaluatorul sau angajatul unei evaluări existente.
- Sunt validate angajatul, data, tipul, calificativul, punctajul 0–100, statusul, lungimea textelor și filtrele `employee_id`/`year`. Câmpurile necunoscute sunt eliminate înainte de scriere.
- Regresia JSON a trecut cu 58 teste și un test SQL omis. Proba SQL Server reală finală a trecut 59/59 pe `INFRAFLOW_TEST_HR_0E462146BF6A`. Prima încercare a expus doar permisiunea lipsă din fixture și a păstrat baza `INFRAFLOW_TEST_HR_D600E80882DF`.
- Auth și app-state sunt fixture VM pentru proba relațională; nu este test pe baza activă. Fără deployment, restart, versiune nouă sau pachete.

## Scadențar instruiri pe MSSQL relațional — 11 octombrie

- Ruta scadențarului citește acum explicit din `hr.employees`, `hr.training`, `hr.training_employees` și `core.departments` când modul relațional este activ; nu mai folosește snapshot-ul JSON în acea configurație.
- JSON și SQL folosesc același evaluator pentru cursurile obligatorii, datele de expirare, stări și forma publică a răspunsului. Angajații cu `activ: false` sau `activ: 0` sunt excluși consecvent.
- Regresia JSON a trecut cu 57 teste și un test SQL opțional omis. Proba SQL Server reală a trecut cu 58/58 teste pe baza sintetică nouă `INFRAFLOW_TEST_HR_3D68308DDC16`, inclusiv denumirea departamentului citită din SQL.
- Mesajul SQL despre angajatul inexistent este proba negativă controlată a transferului; testul complet s-a încheiat cu cod 0. Baza sintetică este păstrată, fără ștergere.
- Auth și app-state rămân fixture VM în această probă relațională; nu este test pe baza activă și nu s-au făcut deployment, restart sau pachete.

## Validarea catalogului de instruiri — 11 octombrie

- Crearea unui curs validează înainte de scriere denumirea și limitele text, datele calendaristice, ordinea perioadei, valabilitatea și costul pozitiv cu maximum două zecimale.
- Payload-ul este normalizat și limitat la câmpurile persistabile; proprietățile străine nu mai ajung în JSON și nici în parametrul SQL.
- Regresia JSON a trecut cu 56 teste și un test SQL opțional omis. Proba SQL Server reală a trecut cu 57/57 teste pe baza sintetică nouă `INFRAFLOW_TEST_HR_4266D79781B7`, inclusiv refuz fără INSERT și inserare validă normalizată.
- Mesajul SQL intermediar despre angajatul inexistent aparține probei negative a transferului și este prins de test; procesul s-a încheiat cu cod 0. Baza sintetică este păstrată, fără ștergere.
- Nu s-au făcut deployment, restart sau pachete; nu este încă probă HTTP/browser pentru formularul de creare a cursului.

## Instruiri prin browser și API real — 11 octombrie

- `verify-hr-http-permissions.js --ui --training` a trecut pe server temporar și bază JSON izolată, cu patru roluri verificate prin autentificare reală.
- Rolul dedicat `hr:training`, fără acces la date personale, vede explicația pentru scadențarul nominal și nu trimite cererea interzisă către `/api/hr/training/scadentar`.
- Rolul cu `hr:training` și `hr:personal_sensitive` vede scadențarul, iar cererea autorizată răspunde cu succes. Ambele roluri fără `hr:view` primesc explicația pentru evaluări și nu solicită `/api/hr/evaluations`.
- Nu au apărut erori JavaScript și acțiunea „Evaluare nouă” rămâne ascunsă. Capturile probei sunt păstrate în `C:\Users\costy\AppData\Local\Temp\infraflow-hr-http-33ZxLe`.
- Aceasta este o probă browser pe JSON; API-ul pe MSSQL standard a fost verificat separat. Nu s-au făcut deployment, restart sau pachete.

## Instruiri prin login și HTTP real — 11 octombrie

- `verify-hr-http-permissions.js --training` a trecut pe JSON izolat și pe baza MSSQL standard nouă `INFRAFLOW_TEST_PERMISSIONS_25B9696BF951` (`dbo.app_state`).
- Rolul `hr:training` poate vedea și crea cursuri, dar primește 403 la scadențarul nominal și înscriere fără `hr:personal_sensitive`.
- Rolul complet a confirmat curs inexistent 404, lot mixt 422, două înscrieri după deduplicare și repetare cu `added: 0`. Scadențarul autorizat răspunde 200.
- Loginul, sanitizarea angajaților și cele patru refuzuri restrictive existente continuă să treacă. Procesele temporare sunt oprite; baza MSSQL și fixture-ul JSON sunt păstrate.
- Nu este probă browser a noilor reguli și nici schema HR relațională completă. Fără acces la baza activă, deployment, restart sau pachete.

## Înscrieri cursuri pe SQL real — 11 octombrie

- 56/56 teste de rute HR trecute, inclusiv SQL Express real pe baza sintetică nouă `INFRAFLOW_TEST_HR_04A2F2E47680`.
- Verificate în SQL: curs inexistent, lot mixt cu angajat inexistent fără INSERT, deduplicarea ID-urilor, două înscrieri valide și repetarea idempotentă cu zero rânduri noi.
- Numărul `added` este numărul real de INSERT-uri. Tabelul final conține exact două legături curs-angajat.
- Schema rămâne sintetică minimală, auth/app_state sunt fixture VM; nu este login HTTP, browser sau schema completă de producție. Baza este păstrată, fără ștergeri.
- Fără acces la baza activă, deployment, restart sau pachete.

## Validare lot înscrieri curs — 11 octombrie

- Înainte de scriere sunt verificate forma listei, ID-uri întregi pozitive, existența cursului și a tuturor angajaților. Un angajat absent refuză întregul lot; nu se înscrie parțial.
- Identificatorii repetați sunt deduplicați; înscrierile existente nu se duplică. SQL returnează numărul real de rânduri adăugate, nu dimensiunea cererii.
- 75 teste rute/regresii HR trecute, zero eșecuri, un SQL opțional omis. Regresia nouă verifică JSON: selecții invalide, curs absent, lot mixt, deduplicare și repetarea cererii.
- Ramura SQL modificată necesită încă probă SQL real; verificările nu certifică concurența. Fără deployment/restart/pachete.

## Instruiri și scadențar nominal — 11 octombrie

- Catalogul cursurilor acceptă vizualizare HR sau dreptul dedicat `hr:training`; crearea cursurilor acceptă administrare HR sau administrarea formărilor. Dreptul dedicat nu acordă alte operații HR.
- Înscrierea angajaților și scadențarul nominal cer suplimentar `hr:personal_sensitive`. UI nu solicită scadențarul fără acest drept și afișează explicație, nu o concluzie falsă că instruirile sunt la zi.
- Încărcarea evaluărilor verifică și `hr:view`, pentru ca rolul dedicat formărilor să nu trimită cererea interzisă.
- 74 teste rute/regresii HR trecute, zero eșecuri, un SQL opțional omis; build temporar trecut. Noile reguli nu au fost încă probate prin HTTP/browser sau SQL real.
- Rămân de verificat validitatea cursului/angajaților la înscriere și comportamentul complet al scadențarului în mod relațional. Fără deployment/restart/pachete.

## Evaluări individuale HR — 11 octombrie

- Lista evaluărilor cere `hr:view` și `hr:personal_sensitive`; creare/editare/ștergere cer `hr:manage` și acces personal. Observațiile/punctajele/recomandările nu mai sunt disponibile cu simpla vizualizare HR.
- UI nu solicită evaluările fără acces personal, afișează explicație în locul unei liste goale înșelătoare și ascunde acțiunile administrative. Handler-ele de salvare/ștergere au verificare explicită.
- 73 teste rute/regresie HR trecute, zero eșecuri, un test SQL opțional omis. Build temporar trecut. Nu este probă browser/HTTP a noilor reguli.
- Scadențarele și instruirile rămân de revizuit separat; nu au fost declarate închise. Fără deployment/restart/pachete.

## Validări asociere prin HTTP real MSSQL — 11 octombrie

- `verify-hr-http-permissions.js --mssql --links` trecut pe baza nouă izolată `INFRAFLOW_TEST_PERMISSIONS_E64B963338F8`.
- Opt refuzuri POST/PATCH fără modificarea angajaților; asociere și dezasociere autorizate confirmate prin login nou. Cele patru refuzuri restrictive și sanitizarea existente au trecut de asemenea.
- MSSQL standard `dbo.app_state`, nu HR relațional. Browserul nu a fost rerulat pentru noile validări. Scheduler oprit, proces temporar închis, baza fictivă păstrată.
- Următoarea zonă de audit: evaluări și instruiri HR, inclusiv informații individuale în liste și scadențare.
- Fără acces la baza activă, deployment, restart sau pachete.

## Asociere/dezasociere prin API real — 11 octombrie

- `node scripts/verify-hr-http-permissions.js --links` trecut pe server temporar, bază JSON fictivă, login real, scheduler oprit.
- Opt refuzuri POST/PATCH pentru cont absent, inactiv, legat invers sau ocupat direct. Lista integrală a angajaților este identică înainte/după refuzuri.
- Crearea autorizată a unui angajat cu cont liber este confirmată prin login și `user.employee_id`; dezasocierea este verificată prin login nou fără acea referință.
- Cele patru refuzuri restrictive și sanitizarea existente continuă să treacă. Nu este probă UI sau MSSQL pentru noile validări, nici test de concurență.
- Procesul temporar este oprit; fără deployment/restart/pachete.

## Validare cont selectat în HR — 11 octombrie

- Crearea și editarea refuză conturi inexistente/inactive înainte de scriere; starea inactivă acceptă atât `false`, cât și `0`.
- Legătura inversă `users.employee_id` către alt angajat produce 409, chiar dacă legătura directă HR lipsește. Nu se repară sau șterg automat legături istorice.
- Lista conturilor asociabile exclude și inactivitatea numerică. Eliminarea autorizată a unei legături rămâne permisă.
- Rute și regresii HR: 72 trecute, zero eșecuri, un test SQL opțional omis. Testele includ refuzuri fără scriere și păstrează probele pozitive de asociere/dezasociere. Concurența și proba HTTP a noilor validări rămân de verificat.
- Fără deployment/restart/pachete.

## Asociere cont la crearea angajatului — 11 octombrie

- Crearea refuză contul deja asociat cu 409, înainte de INSERT/scriere JSON, la fel ca editarea. Crearea autorizată sincronizează `users.employee_id` prin helper-ul existent.
- Regresii pentru refuz fără scriere, creare pozitivă JSON cu legătură inversă și refuz SQL înainte de INSERT (SQL simulat în fixture VM).
- Rute HR și regresie HR: 71 trecute, zero eșecuri, un test SQL real opțional omis. Nu validează concurența a două cereri sau existența/activitatea contului selectat; acestea rămân de revizuit.
- Fără deployment/restart/pachete; versiunea nu a fost schimbată.

## Browser și login real pe MSSQL standard — 11 octombrie

- `verify-hr-http-permissions.js --mssql --ui` a trecut pe baza nouă izolată `INFRAFLOW_TEST_PERMISSIONS_4EE9EBA22DFF`, cu scheduler oprit și port loopback separat.
- Login real pentru roluri restrictive, listă proprie filtrată, CNP/salariu coleg sanitizate, patru refuzuri HTTP și angajați identici înainte/după: trecute.
- Browser Chrome cu API real pentru două roluri: panouri administrative ascunse, listă filtrată, CRM blocat, fără erori JavaScript. Capturi: `C:\Users\costy\AppData\Local\Temp\infraflow-hr-http-DlCMTz`.
- Configurația standard este MSSQL `dbo.app_state`, `INFRAFLOW_SQL_RELATIONAL=0`, conform comentariului din executorul migrărilor. Nu validează schema HR relațională integrală sau toate ecranele HR.
- Procesele temporare sunt oprite; baza și capturile sunt păstrate. Instalațiile active nu au fost repornite. Pachetele finale nu au fost generate.

## Reverificare SQL real și istoric exporturi — 11 octombrie

- 50/50 teste de rute HR trecute, inclusiv proba SQL real opțională, pe baza sintetică nouă `INFRAFLOW_TEST_HR_1C469CE9D0C9`.
- Istoricul autorizat păstrează mesajul și elimină calea internă; calea rămâne în baza SQL. Dreptul de export singur este refuzat (403).
- Prima încercare a identificat escaping greșit în calea fictivă din fixture, corectat înainte de rerulare; baza intermediară `INFRAFLOW_TEST_HR_3E7D6E3BB832` este păstrată.
- Limite: schemă sintetică minimală, auth/app_state simulate; nu certifică migrările complete sau browser/login pe HR relațional. Fără acces la baza activă, restart sau pachete.

## Istoric registru HR fără căi interne — 11 octombrie

- Istoricul exporturilor returnează numai metadatele folosite de interfață, fără `fisier_path` sau câmpuri suplimentare necunoscute. Fișierele și referințele persistate rămân neschimbate.
- Interogarea SQL selectează explicit câmpurile publice; serializer-ul comun filtrează și ramura JSON.
- Regresia acoperă ambele ramuri cu fixture VM (SQL simulat, nu SQL real), metadatele păstrate și zero scrieri. Drepturile de export/personal/salarial rămân obligatorii.
- Suite rute HR: 49 trecute, zero eșecuri, un test SQL real opțional omis. Fără restart/deployment/pachete.

## Pontaj numai pentru vizualizare — 11 octombrie

- Exportul Nexus este disponibil în UI numai cu `hr:timesheet`, aceeași permisiune cerută de API; handler-ul client are și verificare explicită.
- Regresia API confirmă că `hr:timesheets_view` nu permite exportul Nexus sau completarea lunii, fără scrieri ori acces storage.
- Build temporar trecut. Proba browser cu API-uri simulate a trecut pentru trei roluri restrictive, inclusiv cititorul pontajului: fără export, completare zile sau validare lună.
- Verificare cumulată: 127 teste trecute, zero eșecuri, un test SQL opțional omis. Această rulare nu validează MSSQL sau întregul flux live; proba SQL anterioară este documentată separat mai jos.
- Fără deployment, restart al instalațiilor active sau pachete noi.

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

### Kiosk HR — sincronizare offline concedii

Sincronizarea nu mai acceptă identitatea angajatului din payload pentru un cont
Kiosk sau un utilizator cu acces propriu: angajatul este rezolvat server-side din
sesiunea curentă și reverificat ca activ la fiecare lot. Un token rămas deschis nu
mai poate crea cereri după dezactivarea angajatului. Administratorii HR păstrează
posibilitatea existentă de a lucra pentru un angajat indicat, dar numai dacă acesta
există și este activ.

UUID-ul unei cereri existente este idempotent numai pentru același angajat; un UUID
aparținând altei persoane produce un refuz generic, fără revendicare sau divulgarea
cererii. Un lot este limitat la 100 de operațiuni, iar loturile fără inserări nu mai
produc scrieri inutile în app_state. Încărcarea și descărcarea documentelor medicale
reverifică de asemenea angajatul activ înainte de accesul la certificat sau storage.
Verificări: 74/74 teste JSON active trecute și 75/75 teste trecute pe SQL Server real
în baza sintetică izolată `INFRAFLOW_TEST_HR_6B39C4C57ED1`, păstrată pentru inspecție.
Fluxul HTTP real cu autentificare Kiosk a trecut separat pe provider JSON izolat:
activare, login, identitate server-side, repetare idempotentă, limită de lot și refuz
după dezactivarea angajatului. Datele probei sunt păstrate în
`C:\Users\costy\AppData\Local\Temp\infraflow-hr-http-Drzdwc`. Nu s-a făcut deploy,
restart, versiune sau pachet de update.

### HR — upload șabloane Word înainte de multipart

Încărcarea șablonului Word verifică acum autentificarea și `hr:manage` înainte ca
parserul multipart să accepte fișierul temporar. Cererile anonime sau rolurile fără
administrare HR sunt respinse fără a porni uploadul. Regresia verifică separat
anonimul, rolul limitat și administratorul autorizat.

Verificări: 90/90 teste JSON active trecute, cu testul SQL opțional omis implicit;
`git diff --check` a trecut. Proba SQL anterioară 90/90 rămâne valabilă pentru
rutele relaționale și documentele medicale; noul control este anterior parserului și
nu accesează baza de date. Nu s-a făcut deploy, restart, versiune sau pachet de update.

### HR — închiderea revizuirii fișierelor și rapoartelor

Descărcarea dosarului electronic rezolvă acum fișierul exclusiv în directorul
angajatului. Un `stored_name` vechi, importat sau alterat care conține traversare de
directoare este refuzat înainte de accesul la storage, atât pe ruta HR, cât și pe
ruta proprie Kiosk. Numele oferit browserului este redus la un nume de fișier sigur.

Rutele de raportare completă, jurnal, dosar, scadențe și notificări au fost reverificate:
ele păstrează combinațiile cumulative pentru raportare și date personale, medicale
sau salariale, iar interfața cere aceleași drepturi înainte să încarce sau să afișeze
acțiunile. Nu au fost necesare modificări suplimentare pentru rapoarte.

Verificări finale pentru acest lot: 107/107 teste active de rute și fișiere HR trecute,
cu testul SQL opțional omis în rularea combinată; 20/20 regresii generale HR, 3/3
regresii ale politicii centrale, 17/17 teste dedicate fișierelor, audit pe 387 fișiere
cu 0 constatări și build Vite reușit. Proba relațională anterioară a trecut 90/90 pe
`INFRAFLOW_TEST_HR_EBB67B2CF842`. Nu s-a făcut deploy, restart, versiune sau pachet.

### Kiosk HR — certificat medical și storage

Autentificarea Kiosk rulează înaintea parserului multipart, iar fișierele declarate
PDF/JPEG/PNG sunt validate și după semnătura binară. Numele original folosit la
download este neutralizat, iar numele intern acceptă strict forma UUID plus extensia
permisă și trebuie să rămână în directorul angajatului. Suprapunerea concediilor este
verificată înainte de scrierea pe disk. Dacă tranzacția MSSQL eșuează după scriere,
fișierul temporar este șters și tranzacția nu lasă cererea sau certificatul parțial.

Verificări: 79/79 teste JSON active trecute; 80/80 teste pe SQL Server real în baza
sintetică izolată `INFRAFLOW_TEST_HR_1D188EAA8F84`, inclusiv inserare validă și
rollback provocat controlat. Regresiile generale HR sunt 20/20, politica centrală de
permisiuni 3/3, iar auditul de expunere a analizat 387 fișiere cu 0 constatări.
Uploadul HTTP multipart real nu a fost executat deoarece storage-ul acelei rute nu
este încă izolat de workspace. Nu s-a făcut deploy, restart, versiune sau pachet.

### Kiosk HR — curse, task-uri și dovezi

Cursele, profilul Kiosk și acțiunile pe task-uri reverifică la fiecare cerere
angajatul relațional activ asociat sesiunii. Un token rămas deschis nu mai poate
citi profilul sau cursele și nu mai poate modifica task-uri după dezactivarea
angajatului. Task-ul poate fi actualizat numai dacă utilizatorul ERP activ asociat
angajatului este destinatarul lui; identitatea din payload nu este folosită.

Autentificarea pentru dovezile de task rulează înaintea parserului multipart.
PDF/JPEG/PNG sunt validate și după semnătura binară, iar fișierul intern primește
un UUID independent de ID-ul task-ului și de numele încărcat. Dacă persistarea
eșuează, statusul, comentariul și atașamentul revin la starea inițială, iar fișierul
temporar sau mutat este șters.

Verificări: 86/86 teste JSON active trecute, cu testul SQL opțional omis implicit;
87/87 teste trecute pe SQL Server real în baza sintetică izolată
`INFRAFLOW_TEST_HR_1384699CF7E4`, păstrată pentru inspecție. Proba SQL include
task propriu, refuzul task-ului străin și invalidarea imediată după dezactivarea
angajatului. Regresia generală HR este 20/20, politica centrală de permisiuni 3/3,
iar auditul de expunere a analizat 387 fișiere cu 0 constatări. Verificările de
sintaxă și `git diff --check` au trecut. Fluxul HTTP real pe provider JSON izolat a
confirmat profilul și task-ul propriu, refuzul task-ului străin, apoi blocarea
profilului, curselor și actualizării task-ului după dezactivarea angajatului. Nu s-a
făcut deploy, restart, versiune sau pachet de update.

### UI HR — roluri restrictive și încărcare contextuală

Frontendul curent a fost reconstruit și verificat în browser împotriva unui API
real izolat pentru patru roluri: pontaj propriu, vizualizare HR, instruiri și
instruiri cu acces la date personale. Listele rămân filtrate, CRM este blocat,
scadențarul nominal nu este cerut fără dreptul personal, iar evaluările și
acțiunile lor nu apar fără combinația de permisiuni necesară.

Inspecția capturilor a identificat un apel inutil la lista angajaților pentru rolul
dedicat exclusiv instruirilor. Serverul îl refuza corect, dar interfața afișa o
alertă roșie generică deși pagina autorizată funcționa. Încărcarea listei este acum
condiționată de unul dintre drepturile acceptate de ruta serverului, iar regresia
browser verifică atât absența apelului neautorizat, cât și absența alertei false.

Build-ul Vite curent a trecut în `.permission-build-check-7`. Fluxul browser/API,
instruirile, pontajul și Kiosk au trecut fără erori JavaScript; capturile probei
sunt păstrate în `C:\Users\costy\AppData\Local\Temp\infraflow-hr-http-CI3ZCq`.
Nu s-a făcut deploy, restart, versiune sau pachet de update.

### HR — administrarea operațională a angajaților

Dreptul dedicat `hr:employees_manage` este aliniat între meniu, listă, fișa
angajatului și server. Rolul poate lista și deschide toate fișele necesare pentru
administrarea operațională, precum și folosi acțiunea „Angajat nou”, fără să primească
implicit acces la CNP, adresă, salariu, cost orar sau observațiile libere din contract.
Aceste date rămân condiționate separat de `hr:personal_sensitive` și
`hr:salary_view`. Sanitizarea observațiilor contractuale este centralizată în aceeași
politică folosită de răspunsurile JSON și MSSQL. În fișa angajatului, taburile,
rezumatele și cererile pentru Contracte, Pontaj, Dosar, Kiosk, Flux și Echipamente
sunt construite numai din drepturile efective. Dreptul de autoservire
`kiosk:documents_own` afișează adeverința numai pe profilul propriu și nu devine
acces la adeverința colegului.

Verificări: 88/88 teste JSON active trecute, cu testul SQL opțional omis implicit;
89/89 teste trecute pe SQL Server real în baza sintetică izolată
`INFRAFLOW_TEST_HR_CDF699A34205`, păstrată pentru inspecție. Fluxul HTTP/browser cu
cinci roluri a trecut fără erori JavaScript, iar captura managerului după încărcarea
completă a fișei este păstrată în
`C:\Users\costy\AppData\Local\Temp\infraflow-hr-http-MlBl3R`.
Build-ul Vite curent a trecut în `.permission-build-check-12`. Regresiile generale
HR sunt 20/20, politica centrală de permisiuni 3/3, iar auditul de expunere a
analizat 387 fișiere cu 0 constatări. Nu s-a făcut deploy,
restart, versiune sau pachet de update.

### HR — descărcarea documentelor medicale ale colegilor

Ruta de descărcare a certificatului medical folosește aceeași regulă cumulativă ca
lista concediilor: accesul la documentul altui angajat cere simultan `hr:view` și
`hr:medical_view`. Nici vizualizarea HR generală, nici dreptul medical acordat
singur nu deschid storage-ul medical. Titularul autentificat își păstrează accesul
la propriul document.

Verificări: 89/89 teste JSON active trecute, cu testul SQL opțional omis implicit;
90/90 teste trecute pe SQL Server real în baza sintetică izolată
`INFRAFLOW_TEST_HR_EBB67B2CF842`, păstrată pentru inspecție. Regresiile generale
HR sunt 20/20, politica centrală de permisiuni 3/3, auditul de expunere a analizat
387 fișiere cu 0 constatări, iar build-ul Vite curent a trecut. Nu s-a făcut deploy,
restart, versiune sau pachet de update.

1. **Închis local:** revizuire finală a tuturor rutelor HR rămase, inclusiv ajustări bancă de ore,
   documente medicale, fișiere, rapoarte și drepturile administrative distincte.

   Ajustarea băncii de ore este acum protejată prin aria aprobatorului înainte de orice
   INSERT sau scriere JSON. Trei regresii verifică refuzul altui departament, succesul
   în departamentul autorizat și refuzul unui angajat inexistent. Descărcarea
   documentelor medicale ale colegilor este aliniată cu lista concediilor și cere
   simultan vizualizare HR plus drept medical. Uploadul șabloanelor Word verifică
   autentificarea și administrarea HR înainte de multipart. Revizuirea celorlalte rute
   de fișiere și rapoarte a fost încheiată local. Mai rămâne proba HTTP/UI din punctul 3 înainte
   de livrare.
2. **Închis local:** alinierea acțiunilor CRM și a celorlalte pagini modificate cu
   permisiunile serverului. În Oferte CRM, accesul direct la ruta „Ofertă nouă”
   este acum refuzat explicit fără `crm:quote_create`, iar un draft existent
   rămâne consultabil în mod citire în loc să fie afișat ca formular editabil.
   Salvarea are și o protecție locală suplimentară; serverul continuă să fie
   autoritatea finală pentru permisiune. În Inbox WhatsApp, acțiunea de creare
   lead apare numai cu `crm:lead_create`, iar deschiderea lead-ului asociat numai
   cu `crm:view`, în acord cu protecțiile deja existente pe server.

   Suita CRM completă a identificat și un test static rămas pe vechiul markup
   HTML al tabelului de oferte. Verificarea urmărește acum coloana declarativă
   `customer_order_number` din componenta comună `Table`, fără schimbarea
   comportamentului funcțional.

   Verificări: 50/50 teste din întreaga suită CRM trecute; 7/7 teste pentru
   politica comună și integrarea WhatsApp trecute; build-ul Vite și
   `git diff --check` trecute. Nu s-a făcut deploy, restart, versiune sau pachet.
3. **Închis local:** test HTTP și UI cu roluri restrictive, apoi probă pe o bază MSSQL de test izolată.
   Nu se folosesc scrieri de test în baza activă a utilizatorului.

   Prima probă CRM relațională a confirmat refuzurile rolului read-only, apoi a
   identificat un conflict real la editarea autorizată a unui draft: liniile
   anulate logic păstrau pozițiile ocupate în indexul unic
   `(quote_id, line_no)`. Repository-ul arhivează acum pozițiile vechi pe cheia
   negativă unică a liniei, în aceeași tranzacție, înainte de inserarea
   pozițiilor curente. Bazele intermediare de diagnostic sunt păstrate și nu au
   fost folosite baze active.

   Rularea finală a trecut pe baza izolată
   `INFRAFLOW_DEMO_PERMISSIONS_85652096E8D4`: login real, viewer read-only,
   refuz 403 la creare/editare/trimitere spre aprobare, creator separat pentru
   lead/ofertă și manager separat pentru prospecte. Actualizarea draftului a
   trecut pe SQL Server după corecție. Chrome headless a confirmat că URL-ul
   direct „Ofertă nouă” este refuzat pentru viewer, draftul este consultabil fără
   controale de editare, iar creatorul vede formularul. Capturile și seed-ul sunt
   păstrate în `C:\Users\costy\AppData\Local\Temp\infraflow-crm-http-xcSeuc`.
4. **Închis local:** revizuirea configurațiilor de roluri semnalate în rapoartele
   utilizatorului, fără rescrierea automată a drepturilor existente.

   Auditul a confirmat cauza pentru permisiunile care reapăreau după restrângerea
   unui rol implicit: deschiderea listei completa din nou rolul cu toate drepturile
   definiției livrate. Rolurile existente nu mai primesc automat permisiuni noi;
   revenirea la setul aplicației se face exclusiv prin „Resetează implicit”. O
   modificare explicită marchează rolul implicit ca personalizat, iar resetarea este
   completă și reversibilă inclusiv pentru rolurile legacy.

   Endpointurile `GET/PATCH /roles`, duplicate în șase module operaționale montate
   înaintea modulului Sistem, au fost eliminate din acele module. Administrarea
   rolurilor urmează acum un singur traseu central, independent de ordinea routerelor.
   Rolurile implicite nu mai pot fi șterse și reapărute automat; numai rolurile custom
   pot fi șterse. Aliasurile tehnice invizibile nu mai umflă totalul afișat în editor.
   Cele două roluri istorice numite „Operator producție” sunt diferențiate prin
   eticheta „Operator stație / servicii”, fără modificarea permisiunilor existente.

   Verificări focalizate: 12/12 teste ale politicii centrale și filtrului UI trecute,
   verificări de sintaxă și `git diff --check` trecute. Nu s-a făcut deploy, restart,
   versiune sau pachet de update.
5. **Închis local:** versiune, note de update și pachete Windows/Linux generate
   împreună numai după încheierea verificărilor.

   Versiunea sursei este `2.12.684`, documentată în `CHANGELOG.md`, `version.json`,
   `AGENTS.md` și `updates/UPDATE_704_permisiuni_hr_crm_roluri.md`. Au trecut:
   release check complet, auditul de expunere (387 fișiere, 0 constatări), build-ul
   Vite, smoke-ul read-only (69 verificări), testul de release, suita CRM (50/50),
   suita HR (150 trecute, un test MSSQL opțional omis), permisiuni și WhatsApp
   (16/16), precum și contabilitatea pe provider JSON izolat (82/82).

   Arhivele rezultate sunt `installer/output/InfraFlow-update-v2.12.684.zip` și
   `installer/output/InfraFlow-update-v2.12.684-linux.tar.gz`. ZIP-ul a trecut
   verificarea structurală din release check, iar arhiva Linux a fost verificată
   pentru fișierele obligatorii și pentru absența directoarelor/datelelor locale
   excluse. Nu s-a făcut deploy sau restart pe instalațiile active.
6. **Închis local:** conversația furnizată de utilizator a fost analizată și
   răspunsurile au fost confruntate cu implementarea curentă. Clarificările pentru
   SQL Server partajat, autostart/recovery Windows și Linux, update server,
   diferența de rollback și lipsa auto-update-ului Electron sunt documentate în
   `docs/CLARIFICARI_IMPLEMENTARE_SUPORT_2026-10-13.md`.
