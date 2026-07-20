# Changelog

# v2.12.342 - 2026-07-20

## Reactivare controlată contract anulat

- Am adăugat reactivare controlată pentru contractele anulate.
- Backend: endpoint nou `POST /api/contracts/:id/reactivate`, cu motiv obligatoriu și audit.
- Reactivarea blochează duplicatele active cu același număr de contract.
- Contractul revine la statusul anterior anulării sau la `activ` dacă statusul anterior nu este sigur.
- UI: buton `Reactivează` în dosarul contractului anulat și în bannerul de anulare.
- Jurnalul ciclului de viață afișează evenimentul `Reactivat`.
- Nu necesită migrări; compatibil cu JSON și MSSQL.

# v2.12.341 - 2026-07-20

## Anulare controlată contract

- Am standardizat anularea contractelor ca operațiune auditată, cu motiv obligatoriu.
- Backend: `POST /api/contracts/:id/cancel` folosește anulare controlată și păstrează metadate complete.
- Contractele anulate rămân vizibile în listă, detalii și fișa printabilă, dar nu mai intră în dashboard/fluxuri active.
- UI: buton `Anulează`, confirmare, motiv anulare și jurnal al ciclului de viață.
- Dosarele anulate rămân consultabile, dar nu mai permit consumuri, acte adiționale sau atașamente noi.
- Nu necesită migrări; compatibil cu JSON și MSSQL.

# v2.12.340 - 2026-07-20

## Redeschidere controlată contract

- Am adăugat redeschidere controlată pentru contractele închise.
- Backend: endpoint nou `POST /api/contracts/:id/reopen`, cu motiv obligatoriu și audit.
- Contractul revine la statusul operațional anterior sau la `activ` dacă statusul anterior nu este sigur.
- Închiderea contractului păstrează acum `closure_history`, cu motiv, utilizator, blocaje și atenționări.
- UI: contractele închise afișează buton `Redeschide`, motivul ultimei închideri și jurnalul închidere/redeschidere.
- Nu necesită migrări; câmpurile sunt compatibile cu JSON și MSSQL prin modelul existent.

# v2.12.339 - 2026-07-19

## Închidere controlată contract

- Cockpit-ul contractului include readiness pentru închidere, cu blocaje și atenționări.
- Endpoint nou `POST /api/contracts/:id/close` pentru închidere controlată.
- Contractul nu se închide implicit dacă există câmpuri obligatorii lipsă, task-uri deschise, tichete deschise sau alerte critice.
- Închiderea forțată cere motiv explicit și rămâne auditată.
- UI-ul afișează card dedicat de închidere contract și buton în dosar.

# v2.12.338 - 2026-07-19

## Dashboard comercial generic

- Prima pagină folosește texte operaționale generice, fără poziționare prioritară pe asfalt.
- KPI-ul `Tone asfalt azi` devine `Output operațional azi`.
- Secțiunea `Status șantiere` devine `Proiecte / lucrări active`.
- Graficul de producție devine grafic de output operațional.
- Sidebar-ul afișează `ERP modular` în loc de `Stație asfalt`.

# v2.12.337 - 2026-07-19

## Acțiuni contract cu task legat

- Planul rapid de acțiune recunoaște task-urile deschise deja create pentru aceeași recomandare.
- Sunt corelate și task-urile generate anterior din alerte, nu doar cele create manual din plan.
- UI-ul afișează badge `task deschis`, responsabil și termenul task-ului.
- Butonul `Creează task` este ascuns când există deja un task deschis pentru acțiune.
- Implementarea nu necesită migrare DB.

# v2.12.336 - 2026-07-19

## Task din acțiune contract

- Planul rapid de acțiune permite crearea directă a unui task operațional.
- Endpoint nou `POST /api/contracts/:id/tasks`, protejat prin permisiuni de management contracte.
- Task-ul este precompletat cu titlu, descriere, prioritate, termen și responsabilul contractului.
- Se evită duplicatele pentru aceeași acțiune recomandată deschisă.
- Operațiunea este auditată și nu necesită migrare DB.

# v2.12.335 - 2026-07-19

## Plan rapid de acțiune contract

- Cockpit-ul contractului generează automat un plan de acțiune din alerte, checklist, task-uri și tichete.
- Acțiunile sunt prioritizate ca urgente, importante sau recomandate.
- Sumarul cockpit expune numărul total de acțiuni și acțiunile critice.
- UI-ul afișează card dedicat cu următorii pași recomandați pentru dosarul contractului.
- Implementarea este calculată din datele existente și nu necesită migrare DB.

# v2.12.334 - 2026-07-19

## Checklist completitudine contract

- Dosarul contractului include checklist de completitudine cu pași obligatorii și recomandați.
- Checklist-ul verifică număr, obiect, partener, valoare, perioadă, manager, contract semnat, CPV, centru cost, documente sursă și acte adiționale documentate.
- Cockpit-ul expune procentul de completitudine și numărul de obligatorii lipsă.
- UI-ul afișează stare dosar, procent, progres și acțiuni recomandate pentru câmpurile lipsă.
- Implementarea este calculată din datele existente și nu necesită migrare DB.

# v2.12.333 - 2026-07-19

## Contracte cu risc

- Dashboard-ul Contract Management calculează o listă executivă de contracte cu risc.
- Riscul combină alerte, task-uri restante, lipsa managerului, lipsa contractului semnat și acte adiționale fără fișier.
- UI-ul afișează card de sumar „Cu risc” și secțiunea „Contracte cu risc” cu motive explicite.
- Lista permite deschiderea directă a dosarului contractului.
- Filtrul Contracte include opțiunea „Cu risc”.

# v2.12.332 - 2026-07-19

## Timeline dosar contract

- Dosarul contractului primește timeline cronologic unic în cockpit.
- Timeline-ul reunește contractul, alertele, documentele sursă, consumurile, actele adiționale, atașamentele, task-urile și tichetele.
- Evenimentele includ data, tip, status, actor, suma și fișier descărcabil unde există.
- Frontend-ul afișează timeline-ul imediat după cockpit pentru urmărire rapidă.
- Implementarea este read-only și nu necesită migrare DB.

# v2.12.331 - 2026-07-19

## Act adițional cu fișier atașat

- Actele adiționale pot fi salvate împreună cu fișierul semnat PDF/Word/Excel/imagine.
- Fișierul este păstrat în dosarul contractului și legat direct de actul adițional.
- Istoricul actelor adiționale afișează badge de fișier și buton de descărcare.
- Fișa printabilă a contractului include fișierul asociat fiecărui act adițional.
- Upload-ul contractelor folosește o funcție comună pentru atașamente, reducând dublarea.

# v2.12.330 - 2026-07-19

## Startup robust după Windows Update

- Helperul MSSQL prin PowerShell are timeout minim mai mare și retry/backoff pentru porniri lente.
- Task-ul de autostart primește variabile explicite pentru startup SQL tolerant.
- Scriptul `repair-autostart.ps1` caută `setup-task.ps1` în mai multe locații și așteaptă mai mult răspunsul health.
- Pachetul update include acum `scripts/setup-task.ps1`, astfel încât autostart-ul poate fi reparat fără installer complet.
- Verificarea de startup așteaptă implicit 150 secunde, util după update-uri Windows.

# v2.12.329 - 2026-07-18

## Acte adiționale pe contract

- Contract Management permite înregistrarea actelor adiționale direct în dosarul contractului.
- Actele adiționale pot modifica valoarea contractului, termenul final sau responsabilul.
- Istoricul păstrează valorile înainte/după pentru trasabilitate.
- Cockpit-ul contractului și fișa printabilă includ numărul de acte adiționale.
- Anularea unui act adițional este soft și nu rescrie automat contractul.

# v2.12.328 - 2026-07-18

## Atașamente pe contract

- Contract Management permite încărcarea documentelor reale în dosarul contractului.
- Atașamente acceptate: PDF, DOC/DOCX, XLS/XLSX și imagini.
- Endpointuri noi pentru upload, download și anulare soft a atașamentelor.
- Modalul „Dosar contract” afișează card „Atașamente contract” cu încărcare și descărcare.
- Fișa printabilă a contractului include lista atașamentelor încărcate.

# v2.12.327 - 2026-07-18

## Export Excel portofoliu contracte

- Contract Management expune export Excel pentru portofoliul de contracte.
- Exportul include foi separate: Sumar, Contracte, Manageri, Alerte și Taskuri.
- Endpoint nou `GET /api/contracts/portfolio/export.xlsx`, protejat prin permisiunile modulului Contracte.
- Pagina Contract Management are buton „Export Excel”.
- Smoke-suite verifică endpointul XLSX al portofoliului.

# v2.12.326 - 2026-07-18

## Raport portofoliu contracte

- Contract Management expune raport HTML printabil pentru întreg portofoliul de contracte.
- Raportul include totaluri, consum, rămas, alerte, task-uri deschise și portofoliu pe manager/responsabil.
- Endpoint nou `GET /api/contracts/portfolio/print`, protejat prin aceleași permisiuni ca modulul Contracte.
- Pagina Contract Management are buton „Raport portofoliu” pentru print sau salvare PDF.
- Smoke-suite verifică endpointul HTML al raportului de portofoliu.

# v2.12.325 - 2026-07-18

## Fișă printabilă contract

- Contract Management expune fișă HTML printabilă pentru fiecare contract.
- Fișa include sumar financiar, progres, alerte, consumuri, documente sursă, task-uri și tichete conectate.
- Endpoint nou `GET /api/contracts/:id/print`, protejat prin aceleași permisiuni ca dosarul contractului.
- Modalul „Dosar contract” are buton „Fișă print” pentru print sau salvare PDF din browser.
- Fișa folosește cockpit-ul contractului ca sursă unică, fără date duplicate.

# v2.12.324 - 2026-07-18

## Cockpit dosar contract

- Detaliile contractului includ cockpit operațional agregat.
- Cockpit-ul grupează KPI pentru alerte, task-uri, tichete, documente și consumuri.
- Backend-ul agregă task-urile și tichetele legate la contract în `GET /api/contracts/:id`.
- Modalul „Dosar contract” afișează task-uri și tichete legate lângă documente și consumuri.
- Contractul devine pagina de adevăr pentru urmărirea operațională.

# v2.12.323 - 2026-07-18

## Ticketing pentru task-uri contract

- Task-urile de contract pot crea ticket operațional în modulul Sesizări.
- Ticketul este deduplicat prin `entitate_tip=contract_task` și `entitate_id=task`.
- Task-ul păstrează `ticket_uuid` și `ticket_id` pentru trasabilitate.
- Pagina Contract Management afișează „Creează ticket” sau „Ticket legat”.
- Pagina Sesizări afișează sursa ticketului când vine din Contract Management.
- Ticketul moștenește prioritatea, termenul și responsabilul task-ului de contract.

# v2.12.322 - 2026-07-18

## Task-uri operaționale contract

- Alertele de contract pot genera task-uri operaționale urmărite în Contract Management.
- Task-urile sunt deduplicate pe contract și cod alertă cât timp rămân deschise.
- Dashboard-ul afișează task-uri deschise și restante.
- Pagina Contracte are card „Task-uri contract” cu responsabil, deadline și acțiune „Rezolvat”.
- Adăugată migrare MSSQL `contract_management.tasks` pentru evoluția relațională a modulului.
- Smoke-suite verifică endpointul read-only `GET /api/contracts/tasks`.

# v2.12.321 - 2026-07-18

## Manageri și remindere contracte

- Dashboard-ul Contract Management grupează portofoliul pe manager/responsabil.
- Alertele de contract includ responsabilul și context suplimentar pentru notificări.
- Adăugat buton „Trimite remindere” pentru contractele cu praguri sau termene în alertă.
- Reminderele sunt deduplicate pe zi, contract și tip alertă, ca să nu spamăm utilizatorii.
- UI-ul afișează contracte, consum și număr de alerte pe fiecare manager.

# v2.12.320 - 2026-07-18

## Dosar operațional contract

- Detaliile contractului includ consumuri, documente sursă grupate și timeline cronologic.
- Backend-ul expune referate, comenzi, recepții/NIR-uri și facturi legate la contract.
- Pagina Contract Management are buton „Detalii” pe fiecare contract.
- Modalul de detalii afișează valoare, consum, rămas, progres, alerte și documente pe categorii.
- Consumurile rămân calculate fără dublare între NIR și factura generată din același NIR.

# v2.12.319 - 2026-07-18

## Contracte în Referate

- Referatele au câmp „Contract urmărit” direct la creare.
- Lista referatelor și detaliile referatului afișează contractul legat.
- PDF-ul referatului include contractul urmărit pentru dosarul fizic.
- Comanda generată automat la aprobarea referatului moștenește contractul.
- Comanda păstrează și sursa referatului (`sourceReferatId`, `sourceReferatUuid`, `sourceReferatNo`) pentru trasabilitate.

# v2.12.318 - 2026-07-18

## Contracte în Achiziții și Recepții

- Comenzile de achiziții au câmp „Contract urmărit” direct la creare.
- Recepțiile/NIR-urile din Achiziții moștenesc automat contractul comenzii și pot fi ajustate la confirmare.
- Listele de comenzi și recepții afișează contractul legat.
- Backend-ul salvează contractul atât pe fluxul modern de recepții, cât și pe fallback-ul legacy.
- Contract Management poate urmări consumul pe traseul comandă → recepție → factură fără reintroducere manuală.

# v2.12.317 - 2026-07-18

## Selector contract în documente sursă

- NIR-ul din Gestiune are câmp „Contract urmărit” direct la creare.
- Facturile contabile de intrare/ieșire au câmp „Contract urmărit” în formularul de draft.
- Listele de NIR-uri și facturi afișează contractul legat.
- Facturile generate din NIR-uri moștenesc automat contractul când sursele au același contract.
- Contract Management evită dublarea consumului între NIR și factura generată din același NIR.

# v2.12.316 - 2026-07-18

## Legare documente sursă la contract

- Contract Management citește automat consumul din NIR-uri/recepții legate prin `contract_id` / `contractId`.
- Adăugat `GET /api/contracts/linkable-sources` pentru facturi/NIR-uri disponibile la legare.
- Adăugat `POST /api/contracts/:id/link-source` pentru legarea unui document existent de contract.
- Pagina `/contracte` are buton „Leagă doc.” pe fiecare contract.
- Legarea marchează documentul sursă, fără să creeze consum duplicat.
- Smoke-suite verifică endpointul de documente sursă.

# v2.12.315 - 2026-07-18

## UI minimal Contract Management

- Adăugată pagina `/contracte` cu dashboard, alerte, listă contracte și progres consum valoric.
- Adăugat formular pentru contract nou cu număr, obiect, partener, manager, valoare, termene, CPV, PAAP și centru cost.
- Adăugat formular pentru consum manual pe contract.
- Modulul apare în sidebar ca `Contracte`.
- Catalogul de module comerciale include `contract_management`.
- Preseturile Gestiune + Achiziții, Contabilitate, City Services și Enterprise includ Contract Management.

# v2.12.314 - 2026-07-18

## Fundație Contract Management

- Adăugat modul backend `Contract Management` pentru contracte, consumuri valorice și dashboard de alerte.
- Contractele urmăresc valoare, partener, responsabil/manager, departament, centru de cost, CPV, PAAP și termene.
- Consumurile pot fi introduse manual și pot fi agregate din facturi existente legate prin `contract_id` / `contractId`.
- Dashboard-ul calculează valoare contractată, consumată, rămasă, procent global și alerte de prag/expirare.
- Adăugat schema MSSQL relațională `contract_management` pentru evoluția controlată a modulului.
- Smoke-suite verifică endpointurile `GET /api/contracts` și `GET /api/contracts/dashboard`.

# v2.12.313 - 2026-07-18

## Status update și restart în UI

- Adăugat `GET /system/update/status` pentru versiunea runtime, ultimul update și statusul restartului.
- Tabul Setări → Actualizări afișează starea restartului și ultimele linii din `runtime/restart-last.log`.
- Adăugat buton „Verifică server după update”.
- Roadmap-ul comercial include acum modulul Contract Management: valoare contract, consum din facturi, alerte prag și CPV pentru România.

# v2.12.312 - 2026-07-18

## Release check integrat în pachetarea ZIP

- `scripts/windows/build-update-zip.ps1` rulează automat `npm run release:check -- --no-zip` înainte de arhivare.
- După generarea arhivei, același script rulează automat `npm run release:check` pe ZIP-ul final.
- A fost adăugată opțiunea `-SkipReleaseCheck` pentru cazuri de diagnostic manual controlat.
- Pachetarea nu mai poate trece tăcut peste versiuni/documentație/ZIP incoerente.

# v2.12.311 - 2026-07-16

## Release check pentru pachete update

- Adăugat `npm run release:check` pentru validarea coerentă a unui release înainte/după ZIP.
- Verifică sincronizarea versiunilor din `package.json`, `server/package.json`, `client/package.json` și `version.json`.
- Verifică prezența intrărilor curente în `CHANGELOG.md`, `AGENTS.md` și `updates/UPDATE_*.md`.
- Validează arhiva `installer/output/InfraFlow-update-v[versiune].zip`, inclusiv fișierele obligatorii și `version.json` intern.
- Suportă `--no-zip` pentru verificare înainte de pachetare.

# v2.12.310 - 2026-07-16

## Scheduler PIUSI cu backoff și log rar

- Scheduler-ul PIUSI expune starea ultimei rulări, ultimului succes, erorilor și următoarei reîncercări.
- Erorile de sincronizare primesc backoff progresiv, până la 6 ore, ca să nu țină serverul în încercări inutile.
- Lipsa fișierului MDB este jurnalizată rar, nu la fiecare interval.
- Setările afișează statusul scheduler-ului PIUSI lângă statusul rapid al importului.
- Sincronizarea automată persistă explicit rezultatele și `piusi_last_sync` după rulare.

# v2.12.309 - 2026-07-16

## PIUSI status rapid în Setări

- `/integration/piusi/status` nu mai verifică implicit existența fișierului MDB.
- Verificarea MDB se face explicit cu `?check=1`, folosită de butonul manual din Setări.
- Pagina Setări nu mai încarcă automat `/integration/piusi/mapari` la deschidere.
- Panoul PIUSI explică faptul că MDB-ul este neverificat rapid și cere acțiune manuală pentru verificare reală.

# v2.12.308 - 2026-07-16

## Setări rapide fără verificare schemă automată

- Pagina Setări nu mai apelează automat `/system/database-schema` la încărcare.
- Diagnosticul complet al schemei MSSQL rămâne disponibil explicit prin butonul „Verifică schema”.
- Panoul explică de ce verificarea se face manual: Setările trebuie să rămână rapide și sigure.
- Reducem riscul ca o verificare SQL lentă să țină pagina sau clientul desktop în așteptare.

# v2.12.307 - 2026-07-16

## Health rapid MSSQL

- `databaseHealth()` folosește implicit un răspuns rapid pentru MSSQL, fără interogare PowerShell sincronă.
- `/api/system/health` și configurarea SQL rămân responsive chiar dacă SQL Server răspunde greu.
- Panoul Setări afișează distinct „Server activ — SQL neverificat rapid”.
- Verificarea reală a conexiunii rămâne acțiune explicită prin „Testează conexiunea”.

# v2.12.306 - 2026-07-15

## Restart robust după update

- Fallback-ul de restart post-update pornește `start-server.bat` când instalarea nu are serviciu Windows sau task `InfraFlow ERP`.
- Configurația runtime MSSQL rămâne aceeași după update, inclusiv variabilele din launcherul instalat.
- Helperul de restart scrie `runtime/restart-last.log` și verifică `/api/health` după pornire.
- Răspunsul API pentru aplicarea update-ului anunță o fereastră realistă de restart: 12 secunde.

# v2.12.305 - 2026-07-15

## Demo comercial generic

- Demo-ul livrat folosește `Construct Demo SRL` în locul identității istorice de client pilot.
- Domeniile de email demo au fost mutate pe `infraflow-demo.ro`.
- `scripts/seed-demo.js` generează angajații demo cu emailuri generice.
- `scripts/smoke-demo.js` validează compania demo generică, nu identitatea veche a clientului pilot.
- Seed-ul MSSQL pentru modulul Mediu nu mai include text cu numele clientului pilot.

# v2.12.304 - 2026-07-15

## Centre cost generice și legături Controlling

- Seed-ul istoric Publiserv pentru centre de cost a fost scos din pachet.
- Migrarea `066_controlling_generic_cost_centers.sql` dezactivează centrele vechi și rupe mapările automate pe utilaje.
- CRUD-ul centrelor de cost funcționează și în MSSQL: creare, editare, dezactivare și asociere obiect.
- Centrele pot fi asociate din UI cu departamente, utilaje/vehicule și lucrări/proiecte.
- Lista de centre active nu mai rehidratează date client-pilot la fiecare încărcare.

# v2.12.303 - 2026-07-14

## Declarații fiscale lunare din registry țară

- `countryRules` expune helperul `getMonthlyFiscalDeclarations()`.
- Codul normalizează aliasurile `D406_SAF_T` și `SAF-T` la `D406` pentru zonele operaționale existente.
- Registrul declarațiilor fiscale folosește lista lunară din profilul țării.
- Harta de completare fiscală folosește aceeași listă din registry.
- Pentru România rezultatul rămâne identic: `D300`, `D394`, `D112`, `D406`.

# v2.12.302 - 2026-07-14

## Defaulturi fiscale din registry țară

- `server/shared/countryRules.js` expune helperi reutilizabili pentru TVA implicit, cote TVA, declarații fiscale și profil HR.
- Normalizarea setărilor folosește TVA-ul implicit din profilul de țară.
- Normalizarea DB JSON folosește același fallback fiscal din registry.
- Modulul ANAF păstrează comportamentul existent pentru România, dar fallback-ul TVA vine din registry.
- Nu au fost schimbate calculele existente; pentru România valoarea implicită rămâne 21%.

# v2.12.301 - 2026-07-14

## Registry reguli pe țară

- Catalogul de țări a fost mutat într-un modul shared reutilizabil: `server/shared/countryRules.js`.
- A fost adăugat endpointul read-only `/settings/country-rules` pentru profiluri HR, fiscale/contabile și documente pe țară.
- România are profil activ pentru HR, fiscal/contabil și documente; celelalte țări sunt marcate generic/roadmap.
- `Setări > General` afișează sumarul regulilor active pentru țara selectată.
- Smoke-ul local verifică endpointul nou.

# v2.12.300 - 2026-07-14

## Profil internațional organizație

- Setările organizației au primit câmpuri pentru țară, limbă/locale, monedă, fus orar și profil juridic.
- A fost adăugat endpointul read-only `/settings/country-profiles` cu catalog inițial de profiluri de țară.
- Tabul `Setări > General` are acum panou de profil internațional cu completare automată la alegerea țării.
- A fost adăugată migrarea `065_country_profile_settings.sql` pentru coloanele MSSQL aferente.
- Smoke-ul local verifică endpointul nou.

# v2.12.299 - 2026-07-14

## Direcție internațională și verticale comerciale

- Direcția de produs a fost extinsă explicit către uz internațional.
- Profilul organizației va trebui să suporte gradual limbă, țară, monedă, formate regionale, template-uri și reguli legislative pe jurisdicție.
- România rămâne primul profil complet, dar codul nou trebuie proiectat astfel încât legislația să poată deveni profil de țară.
- Roadmap-ul comercial include module noi: Warehouse/WMS, Logistics și Ecarisaj/Public Health Services.
- `server/package.json` și `server/package-lock.json` au fost realiniate la versiunea curentă.
- Nu au fost schimbate endpointuri, tabele, migrări DB sau dependențe.

# v2.12.298 - 2026-07-14

## Helper contextual extins în module operaționale

- Helperul contextual reutilizabil a fost extins în Contabilitate, Achiziții, Referate și Mecanizare.
- Contabilitatea afișează traseul logic: nomenclatoare → documente sursă → rapoarte/control → închidere lună.
- Achizițiile recomandă pași pe baza cerințelor, comenzilor deschise, recepțiilor, cântarului și pozițiilor PAAP peste prag.
- Referatele arată starea drafturilor, fluxurilor în aprobare, aprobărilor și respingerilor.
- Mecanizarea evidențiază cereri parc, planificări, bonuri deschise, alimentări PIUSI nemapate și scadențe/service.
- Nu au fost schimbate endpointuri, tabele, migrări DB sau dependențe.

# v2.12.297 - 2026-07-14

## Helper contextual reutilizabil UI

- A fost adăugată componenta `ContextHelp` pentru ghidaj contextual, pași, tips și următorul pas recomandat.
- Componenta este integrată inițial în `Setări > Module`, HR și Documente.
- `Setări > Module` explică profilul comercial, modulele și onboardingul organizației.
- HR afișează prioritățile operaționale: Inbox, concedii, scadențe și pontaj.
- Documente explică fluxul recomandat: Inbox, document nou și template-uri Word.
- Nu au fost schimbate endpointuri, tabele, migrări DB sau dependențe.

# v2.12.296 - 2026-07-14

## Split funcții print documente HR

- Funcțiile mari de print/generare HTML pentru documente HR au fost mutate din `HRPage.jsx` în `client/src/pages/modules/hr/hrDocumentPrint.js`.
- `HRPage.jsx` rămâne orchestrator pentru state, API și randarea panourilor, iar helperul nou gestionează documentele printabile, template-urile HR, arhivarea HTML și generarea Word.
- Au fost păstrate aceleași payload-uri, aceleași acțiuni din UI și aceleași ferestre de print.
- Nu au fost schimbate endpointuri, tabele, migrări DB sau dependențe.

# v2.12.295 - 2026-07-14

## Catalog module active și onboarding organizație

- Tabul `Setări > Module` a primit un panou de onboarding organizație cu progres, checklist și următorul pas recomandat.
- Au fost adăugate pachete comerciale rapide: Core, HR, Operațional, Gestiune + Achiziții, Contabilitate, City Services și Enterprise.
- A fost adăugat endpointul read-only `/settings/modules/catalog` pentru catalog server-side de module, pachete, module permise și module active.
- Smoke-ul local verifică endpointul nou.
- Nu au fost schimbate tabele, migrări DB sau dependențe.

# v2.12.294 - 2026-07-14

## Productizare comercială modulară

- Direcția produsului a fost actualizată: InfraFlow este ERP modular general, configurabil pe organizație, fără dependență de client pilot.
- A fost adăugat ghidul [PRODUCTIZARE_COMERCIALA.md](docs/PRODUCTIZARE_COMERCIALA.md) cu pachete comerciale, profiluri de pornire și reguli de decuplare de client.
- Au fost neutralizate fallback-uri și texte vizibile care trimiteau la un client specific în HR, demo, controlling, mediu, foi parcurs și importer legacy.
- Nu au fost schimbate endpointuri, tabele sau dependențe.

# v2.12.293 - 2026-07-14

## Split zona Documente HR frontend

- Tabul principal `Documente HR` din HR a fost extras în `client/src/pages/modules/hr/HRDocumentsPanel.jsx`.
- Dashboard-ul de conformitate dosar HR, lista șabloanelor, checklistul dosarului și cardurile cu documente rapide pe angajat sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, handler-ele, funcțiile de print și apelurile API; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.292 - 2026-07-14

## Split router taburi fișă angajat HR

- Randarea condițională a taburilor din modalul `Fișa — [angajat]` a fost extrasă în `client/src/pages/modules/hr/HREmployeeProfileTabsRouter.jsx`.
- Taburile `date`, `contracte`, `pontaj`, `dosar`, `kiosk`, `flux` și `echipamente` sunt selectate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, handler-ele și apelurile API; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.291 - 2026-07-14

## Split carcasă modal fișă angajat HR

- Carcasa modalului `Fișa — [angajat]` din HR a fost extrasă în `client/src/pages/modules/hr/HREmployeeProfileModal.jsx`.
- Headerul profilului, cardurile de status, activitatea recentă și taburile fișei sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează conținutul taburilor, state-ul și handler-ele operaționale; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.290 - 2026-07-14

## Split modal testare șablon Word HR

- Modalul `Testează Word — [denumire]` din HR a fost extras în `client/src/pages/modules/hr/HRDocumentTemplateTestModal.jsx`.
- Formularul pentru angajat test, contract test, act adițional test și sumarul validării Word este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul `templateTesting`, `templateTestForm`, `templateTestResult`, handler-ul de submit și apelul API `/hr/document-templates/:id/validate-word`; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.289 - 2026-07-14

## Split modal editare șablon document HR

- Modalul `Șablon HR — [denumire]` din HR a fost extras în `client/src/pages/modules/hr/HRDocumentTemplateModal.jsx`.
- Formularul pentru denumire, tip, descriere, atașament Word, variabile, editor vizual și modul HTML avansat este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul `templateEditing`, `templateAdvancedMode`, ref-ul editorului, handler-ele Word și submit-ul către `/hr/document-templates`; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.288 - 2026-07-14

## Split modal editare zi pontaj HR

- Modalul `Pontaj - [angajat]` din HR a fost extras în `client/src/pages/modules/hr/HRTimesheetEditModal.jsx`.
- Formularul pentru data pontajului, tip zi, ore lucrate și observații este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul `timesheetEdit`, handler-ul de submit și apelul API `/hr/timesheets`; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.287 - 2026-07-14

## Split modal export pontaj Nexus HR

- Modalul `Export Pontaj Nexus` din HR a fost extras în `client/src/pages/modules/hr/HRNexusExportModal.jsx`.
- Formularul pentru lună, departament și acțiunea de export este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul formularului, handler-ul de submit și apelurile API; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.286 - 2026-07-14

## Split modal import angajați HR

- Modalul `Import angajați` din HR a fost extras în `client/src/pages/modules/hr/HRImportEmployeesModal.jsx`.
- Formularul pentru descărcare template, selectare fișier CSV/Excel și sumarul rezultatului de import este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul formularului, handler-ul de submit și apelurile API; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.285 - 2026-07-13

## Split modal evaluări HR

- Modalul `Evaluare nouă / Editează evaluare` din HR a fost extras în `client/src/pages/modules/hr/HREvaluationModal.jsx`.
- Formularul pentru angajat, data evaluării, tip, calificativ, punctaj, observații, obiective și recomandări este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul formularului, handler-ul de submit și apelurile API; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.284 - 2026-07-13

## Split modal compensare bancă de ore HR

- Modalul `Compensare bancă de ore` din HR a fost extras în `client/src/pages/modules/hr/HROvertimeCompensationModal.jsx`.
- Formularul pentru timp liber, plată, sold inițial și avans timp liber este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul formularului, handler-ul de submit și apelurile API; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.283 - 2026-07-13

## Split modaluri concedii și salarizare medicală HR

- Modalul `Cerere de concediu` din HR a fost extras în `client/src/pages/modules/hr/HRLeaveRequestModal.jsx`.
- Modalul `Trimite concediul medical în salarizare` a fost extras în `client/src/pages/modules/hr/HRMedicalPayrollModal.jsx`.
- `HRPage.jsx` păstrează state-ul formularelor, handler-ele de submit și apelurile API; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.282 - 2026-07-13

## Split modal angajat HR

- Modalul `Angajat nou` din HR a fost extras în `client/src/pages/modules/hr/HREmployeeModal.jsx`.
- Formularul de identitate, date personale, date de angajare, date financiare, documente/scadențe și GDPR este randat din componenta dedicată.
- `HRPage.jsx` păstrează state-ul formularului, deschiderea/închiderea modalului și handler-ul de submit; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.281 - 2026-07-13

## Split dosar angajat HR

- Tabul `Dosar` din fișa angajatului a fost extras în `client/src/pages/modules/hr/HREmployeeFilesTab.jsx`.
- Upload-ul, lista documentelor, previzualizarea, descărcarea, editarea metadatelor și anularea documentelor sunt randate din componenta dedicată.
- Integrarea cu Inbox HR și refresh-ul pentru documentele generate electronic rămân identice; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.280 - 2026-07-13

## Split contracte și transferuri fișă angajat HR

- Tabul `Contracte & acte` din fișa angajatului a fost extras în `client/src/pages/modules/hr/HREmployeeContractsTab.jsx`.
- Panoul de contracte salarizare, actele adiționale și istoricul de departamente sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, încărcarea contractelor, handler-ele de print/generare Word/arhivare Word și mesajele de eroare; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.279 - 2026-07-13

## Split flux onboarding/offboarding fișă angajat HR

- Tabul `Onboarding / Offboarding` din fișa angajatului a fost extras în `client/src/pages/modules/hr/HREmployeeWorkflowTab.jsx`.
- Sumarul fluxului, bara de progres, lista de pași, acțiunile ghidate și închiderea/anularea fluxului sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, încărcarea fluxului și handler-ele de pornire, bifare, finalizare și anulare; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.278 - 2026-07-13

## Split scadențe și Kiosk fișă angajat HR

- Tabul `Scadențe & Kiosk` din fișa angajatului a fost extras în `client/src/pages/modules/hr/HREmployeeKioskTab.jsx`.
- Sumarul documentelor Kiosk, reminderul, lipsurile obligatorii și lista de scadențe sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, selecția angajatului și handler-ul de reminder; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.277 - 2026-07-13

## Split pontaj și concedii fișă angajat HR

- Tabul `Pontaj & concedii` din fișa angajatului a fost extras în `client/src/pages/modules/hr/HREmployeeAttendanceTab.jsx`.
- KPI-urile de pontaj, soldul CO și istoricul concediilor sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul și selecția angajatului; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.276 - 2026-07-13

## Split date personale fișă angajat HR

- Tabul `Date personale` din fișa angajatului a fost extras în `client/src/pages/modules/hr/HREmployeePersonalTab.jsx`.
- Formularul de editare și sumarul read-only sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, handler-ele de salvare, adeverințele și funcțiile de calcul existente; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.275 - 2026-07-13

## Split profil angajat HR

- Antetul fișei angajatului, fotografia și acțiunile rapide au fost extrase în `client/src/pages/modules/hr/HREmployeeProfileChrome.jsx`.
- Cardurile de status, activitatea HR recentă și navigația taburilor profilului sunt acum randate din componente dedicate.
- `HRPage.jsx` păstrează state-ul, handler-ele și conținutul taburilor existente; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.274 - 2026-07-13

## Split modaluri echipamente HR

- Modalul de catalog echipamente a fost extras în `client/src/pages/modules/hr/HREquipmentCatalogModal.jsx`.
- Modalul de dotare echipament/inventar a fost extras în `client/src/pages/modules/hr/HREquipmentDotareModal.jsx`.
- `HRPage.jsx` păstrează state-ul și handler-ele existente; comportamentul HTTP, DB și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.273 - 2026-07-13

## Split echipamente din fișa angajat HR

- Secțiunea `Echipamente și inventar în răspundere` din fișa angajatului a fost extrasă în `client/src/pages/modules/hr/HREmployeeEquipmentSection.jsx`.
- Mărimile, inventarul pe categorii, predarea la lichidare și totalul valoric sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează state-ul, modalul de dotare și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.272 - 2026-07-13

## Split echipamente HR frontend

- Tabul `🦺 Echipamente` a fost extras în `client/src/pages/modules/hr/HREquipmentPanel.jsx`.
- Necesarul pe departament, expirările, comanda furnizor și catalogul sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează încărcarea datelor, permisiunile și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.271 - 2026-07-13

## Smoke suite module read-only

- A fost adăugat `scripts/smoke-modules-readonly.js`, un test smoke care pornește serverul în `DB_MODE=json` pe o bază temporară.
- Smoke suite-ul verifică read-only 48 endpointuri critice din Core, HR, Documente, Contabilitate, Achiziții, Referate, Gestiune, Mecanizare, Producție, Tehnic, Controlling, ANAF și Servicii.
- `npm run audit:local` rulează acum și `npm run test:smoke`, astfel încât release-ul local prinde rapid rute rupte după refactorizări.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.270 - 2026-07-13

## Documente Word-first

- Modalul de template document pune modelul Word `.docx` ca flux principal pentru utilizatori.
- Variabilele uzuale sunt afișate ca badge-uri copiabile pentru lipire directă în Word cu sintaxa `{{variabila}}`.
- Editorul vizual/HTML rămâne disponibil doar în zona avansată de compatibilitate și previzualizare.
- Nu s-au modificat endpointuri, tabele sau dependențe.

# v2.12.269 - 2026-07-13

## Split training si evaluari HR frontend

- Tabul `Training & Evaluări` a fost extras în `client/src/pages/modules/hr/HRTrainingPanel.jsx`.
- Scadențarul cursurilor obligatorii și lista de evaluări sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează încărcarea datelor, modalul de evaluare și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.

# v2.12.268 - 2026-07-13

## Split tichete masa HR frontend

- Tabul `Tichete masă` a fost extras în `client/src/pages/modules/hr/HRMealTicketsPanel.jsx`.
- Configurația valorii tichetului, filtrele lună/departament, exportul CSV și tabelul de totaluri sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează încărcarea datelor și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.

# v2.12.267 - 2026-07-12

## Split modal tura HR frontend

- Modalul `Tură nouă / Editează tura` a fost extras în `client/src/pages/modules/hr/HRShiftModal.jsx`.
- Formularul de tură este randat din componenta dedicată, dar state-ul și handler-ele de salvare rămân în `HRPage.jsx`.
- Comportamentul HTTP și UX-ul existent rămân neschimbate.

# v2.12.266 - 2026-07-12

## Split ture si program HR frontend

- Tabul `Ture & Program` a fost extras în `client/src/pages/modules/hr/HRShiftsSchedulePanel.jsx`.
- Lista de ture, filtrarea pe lună/departament și matricea zilnică de programare sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează încărcarea datelor, modalul de editare tură și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.

# v2.12.265 - 2026-07-12

## Split pontaj avansat HR frontend

- Tabul `Pontaj Avansat` a fost extras în `client/src/pages/modules/hr/HRAdvancedTimesheetPanel.jsx`.
- Închiderea lunii, aprobarile de ore suplimentare, controlul săptămânal, raportul lunar și banca de ore sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează încărcarea datelor, filtrarea, permisiunile și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.

# v2.12.264 - 2026-07-12

## Split pontaj HR frontend

- Tabul `Pontaj` a fost extras în `client/src/pages/modules/hr/HRTimesheetPanel.jsx`.
- Tabelul de pontaj, exportul Excel, exportul Nexus și acțiunile de finalizare/validare/devalidare sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează datele, calculul de filtrare și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.

# v2.12.263 - 2026-07-12

## Split lista angajati HR frontend

- Tabul `Angajați` a fost extras în `client/src/pages/modules/hr/HREmployeesPanel.jsx`.
- Lista angajaților, exporturile Excel/PDF, badge-ul de sursă și alertele vizuale sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează filtrarea, încărcarea datelor și handlerul de deschidere fișă; comportamentul HTTP și UX-ul rămân neschimbate.

# v2.12.262 - 2026-07-12

## Split inbox HR frontend

- Panoul `Inbox HR` și jurnalul operațional HR au fost extrase în `client/src/pages/modules/hr/HRInboxPanel.jsx`.
- Filtrele inbox, sarcinile ghidate, filtrele jurnalului și exportul jurnalului rămân conectate la handler-ele existente din `HRPage.jsx`.
- Comportamentul HTTP și UX-ul existent rămân neschimbate.

# v2.12.261 - 2026-07-12

## Split dashboard HR frontend

- Panoul `Dashboard HR` a fost extras în `client/src/pages/modules/hr/HRDashboardPanel.jsx`.
- KPI-urile, raportul de management, cererile în așteptare, scadențele și istoricul notificărilor HR sunt randate din componenta dedicată.
- `HRPage.jsx` păstrează încărcarea datelor și handler-ele existente; comportamentul HTTP și UX-ul rămân neschimbate.

# v2.12.260 - 2026-07-12

## Split header si filtre HR frontend

- Header-ul paginii HR și filtrele generale au fost extrase în `client/src/pages/modules/hr/HRPageChrome.jsx`.
- `HRPage.jsx` folosește acum componente dedicate pentru header, filtre și navigația taburilor.
- UX-ul și fluxurile existente din HR rămân neschimbate.

# v2.12.259 - 2026-07-12

## Split navigatie HR frontend

- Navigația taburilor HR a fost extrasă în `client/src/pages/modules/hr/HRNavigationTabs.jsx`.
- Lista taburilor și permisiunile aferente au fost mutate lângă componenta de navigație.
- UX-ul și fluxurile existente din HR rămân neschimbate.

# v2.12.258 - 2026-07-12

## Split rute database sistem

- Rutele Express pentru configurare SQL Server, test conexiune și schema relațională au fost extrase în `server/modules/system/database-routes.js`.
- Endpointurile existente `/api/system/database-config` și `/api/system/database-schema` rămân neschimbate.
- Helper-ele de configurare și handlerul legacy rămân în `routes.js` pentru compatibilitate.

# v2.12.257 - 2026-07-12

## Split rute departamente sistem

- Rutele Express pentru listare, creare, editare și ștergere departamente au fost extrase în `server/modules/system/departments-routes.js`.
- Endpointurile existente `/api/departments` rămân neschimbate.
- Handlerul legacy `/api/departments` rămâne în `routes.js` pentru compatibilitate.

# v2.12.256 - 2026-07-12

## Split rute licenta sistem

- Rutele Express pentru status și import licență au fost extrase în `server/modules/system/license-routes.js`.
- Endpointurile existente `/api/license/status` și `/api/license/import` rămân neschimbate.
- Ruta legacy `/api/license/import` rămâne în `routes.js` pentru compatibilitate.

# v2.12.255 - 2026-07-12

## Split rute setari sistem

- Rutele Express pentru setări generale, module, email test, branding, logo, GPS test și devices au fost extrase în `server/modules/system/settings-routes.js`.
- Endpointurile existente `/api/settings`, `/api/admin/branding`, `/api/integration/gps/test` și `/api/devices` rămân neschimbate.
- Configurarea MSSQL și licența rămân în `routes.js` pentru pași separați, cu risc mai mic.

# v2.12.254 - 2026-07-12

## Split rute utilizatori si roluri

- Rutele Express pentru utilizatori, roluri și permisiuni au fost extrase din `server/modules/system/routes.js` în `server/modules/system/users-routes.js`.
- Endpointurile existente `/api/users` și `/api/roles` rămân neschimbate.
- Helperii de creare/editare utilizatori rămân în `routes.js` pentru compatibilitatea handlerului legacy `/api`.

# v2.12.253 - 2026-07-12

## Split rute backup sistem

- Rutele Express pentru backup și restaurare au fost extrase din `server/modules/system/routes.js` în `server/modules/system/backup-routes.js`.
- Endpointurile existente `/api/system/backups`, `/api/backup` și `/api/restore` rămân neschimbate.
- Handlerul legacy `/api` rămâne neatins pentru compatibilitate și va fi extras separat într-un pas ulterior.

# v2.12.252 - 2026-07-11

## Split system update routes

- Endpointurile de update sistem au fost extrase din `server/modules/system/routes.js` în `server/modules/system/update-routes.js`.
- Rutele existente `/api/system/update-*` și `/api/system/update-package` rămân neschimbate.
- Refactorul păstrează helper-ele legacy prin injectare controlată și reduce dimensiunea fișierului principal `system/routes.js`.

# v2.12.251 - 2026-07-11

## Adevar proiect si audit local

- Documentatia de lucru este sincronizata cu versiunea reala si stack-ul curent React/Vite.
- Script nou `npm run audit:local` pentru verificari repetabile de release.
- Script nou `npm run audit:advisory` pentru lint si audit securitate non-blocant.
- Auditul de mentenanta este documentat in `docs/AUDIT_MENTENANTA_2026-07-11.md`.

# v2.12.250 - 2026-07-11

## Notificari automate HR

- Endpoint nou `POST /api/hr/notifications/generate` pentru notificari HR din Inbox.
- Generatorul acopera sarcini critice, avertizari, dosare, Kiosk, medicale si offboarding.
- Deduplicare pe zi, utilizator si sarcina pentru protectie anti-spam.
- Dashboard HR are buton `Genereaza notificari HR` si sumar cu create/existente/destinatari.

# v2.12.249 - 2026-07-11

## Rapoarte management HR

- Endpoint nou `GET /api/hr/management-report` pentru sinteza manageriala HR.
- Export Excel pentru raportul de management HR.
- Dashboard HR include KPI-uri pentru Inbox, dosare, scadente, concedii, medicale si activitate.
- Raportul include top lipsuri dosar si activitate pe utilizator HR.

# v2.12.248 - 2026-07-11

## Jurnal operational HR

- Endpoint nou `GET /api/hr/activity` pentru evenimente HR normalizate din audit.
- Export Excel pentru jurnalul operational HR.
- Inbox HR include sectiune `Istoric rezolvari` cu filtre pe categorie, angajat si perioada.
- Fisa angajatului afiseaza un mini timeline cu activitatea HR recenta.

# v2.12.247 - 2026-07-11

## Rezolvare ghidata Inbox HR

- Sarcinile din Inbox HR transmit tipul de document sugerat si pasul urmator din flux.
- Dosarul electronic preselecteaza automat tipul documentului lipsa cand se pleaca din Inbox HR.
- Scadentele si lipsurile de dosar au buton rapid pentru incarcarea documentului corect.
- Fluxurile HR deschise din Inbox evidentiaza pasul urmator recomandat.

# v2.12.246 - 2026-07-11

## Inbox HR centralizat

- Tab nou Inbox HR cu sarcini operative din concedii, concedii medicale, workflow-uri HR, dosar, Kiosk si scadente.
- Endpoint nou `GET /api/hr/inbox` pentru agregarea prioritatilor HR.
- Sarcinile sunt prioritizate pe critic, atentie si info, cu filtre rapide pe categorie.
- Fiecare sarcina are actiune directa spre concedii, dosar, flux, scadente sau reminder Kiosk.

# v2.12.245 - 2026-07-11

## Actiuni rapide in fluxurile HR

- Pasii din onboarding si offboarding au actiuni rapide contextuale.
- HR poate sari direct la date personale, contracte, dosar documente, Kiosk, pontaj sau echipamente.
- Din flux se pot genera documente utile: fisa postului, GDPR, nota de lichidare si adeverinta de vechime.
- Pasii critici pot declansa reminder Kiosk, generare/arhivare CIM Word sau inregistrare dotare.

# v2.12.244 - 2026-07-11

## Flux onboarding si offboarding HR

- Endpointuri noi pentru pornire, consultare, bifare pasi si inchidere flux HR per angajat.
- Fisa angajat are tab nou `Onboarding / Offboarding` cu progres si checklist ghidat.
- Pasii sunt precompletati automat din date existente: contracte, dosar, Kiosk, GDPR, apt medical si echipamente.
- Fluxurile sunt auditate si pot fi finalizate sau anulate controlat.

# v2.12.243 - 2026-07-11

## Fisa unica angajat HR

- Modalul angajatului a fost reorganizat ca profil unic cu taburi interne.
- Sumarul afiseaza status contract, procent dosar HR, confirmari Kiosk, scadenta urmatoare si CO ramas.
- Taburi noi pentru date personale, contracte, pontaj si concedii, dosar documente, scadente Kiosk si echipamente.
- Buton nou de print pentru `Fisa angajat HR`, utila la audit sau dosar.

# v2.12.242 - 2026-07-11

## Dashboard conformitate dosar HR

- Panou nou in `Documente HR` pentru lipsuri obligatorii, confirmari Kiosk si scadente.
- Endpoint nou `GET /api/hr/dossier-dashboard` pentru agregarea conformitatii dosarului per angajat.
- Filtre rapide: probleme, lipsuri, neconfirmate Kiosk, scadente, fara probleme si toate.
- HR poate trimite reminder Kiosk pentru documentele neconfirmate, cu audit si notificare interna cand exista user asociat.

# v2.12.241 - 2026-07-11

## Raport dosar HR si confirmari Kiosk

- Export Excel nou pentru checklist dosar personal, scadente si confirmari Kiosk.
- Raportul centralizeaza lipsurile obligatorii per angajat si statusul documentelor critice.
- Foaia de scadente reuneste alertele avansate HR intr-un format usor de filtrat.
- Documentele generate sau vizibile in Kiosk includ statusul confirmarii angajatului.

# v2.12.240 - 2026-07-11

## Testare sabloane Word HR

- Endpoint nou pentru validarea sabloanelor Word fara arhivare.
- Lista de sabloane HR are buton `Testeaza Word` pentru fisierele `.docx` atasate.
- Testul raporteaza variabile detectate, recunoscute, necunoscute si fara valoare.
- UI-ul permite alegerea unui angajat, contract si act aditional pentru test realist.

# v2.12.239 - 2026-07-11

## Arhivare Word generat in dosar HR

- Endpoint nou pentru generare si arhivare Word in dosarul electronic al angajatului.
- CIM-urile si actele aditionale Word pot fi arhivate direct din panoul de contracte.
- Documentele arhivate sunt vizibile in dosar si in Kiosk pentru confirmare.
- Download-ul Word si arhivarea folosesc acelasi motor de randare.

# v2.12.238 - 2026-07-11

## Generare Word din sabloane HR

- Endpoint nou pentru randarea sabloanelor Word `.docx` cu variabile completate.
- Contractele si actele aditionale pot fi descarcate ca Word cand exista sablon atasat.
- Generatorul valideaza ca documentul contine variabile detectabile si evita rezultate corupte.
- HTML-ul ramane fallback pentru generarea si arhivarea interna.

# v2.12.237 - 2026-07-10

## Sablon Word pentru documente HR

- Sabloanele HR pot avea atasat fisier Word `.docx` original.
- HR poate incarca, inlocui si descarca sablonul Word din lista sau modal.
- Metadata fisierului Word este salvata in sablon si in MSSQL prin migrare noua.
- Editorul vizual ramane fallback pentru generarea interna HTML.

# v2.12.236 - 2026-07-10

## Editor vizual pentru sabloane HR

- Editarea sabloanelor HR se face implicit intr-un editor vizual tip document.
- Codul HTML este ascuns in mod avansat, pentru interventii tehnice rare.
- Variabilele se pot insera direct in documentul vizual.
- Editorul permite lipire de continut din Word si formatare de baza.

# v2.12.235 - 2026-07-10

## Istoric notificari HR si actiuni directe

- Dashboard HR afiseaza istoricul notificarilor generate pentru scadente.
- Notificarile HR pot fi marcate ca rezolvate, cu audit.
- Scadentele si istoricul au actiune directa catre fisa angajatului.
- Endpointuri noi pentru lista si rezolvarea notificarilor HR.

# v2.12.234 - 2026-07-10

## Notificari HR pentru scadente critice

- Dashboard HR poate genera notificari pentru scadente expirate sau in maximum 30 de zile.
- Notificarile sunt deduplicate pe utilizator si scadenta, cu audit la generare.
- Endpointul general de notificari include acum si notificarile persistente salvate in DB.
- Nu sunt necesare modificari de schema; se foloseste structura existenta `notifications`.

# v2.12.233 - 2026-07-10

## Scadente HR avansate

- Dashboard HR are scadentar centralizat pentru expirari pe urmatoarele 90 de zile.
- Sunt incluse CI, apt medical, permis, ISCIR, contracte, suspendari, autorizatii si documente din dosar.
- Scadentele sunt grupate pe expirat, 30, 60 si 90 de zile.
- Endpoint nou `GET /api/hr/advanced-expirations`, calculat din datele HR existente.

# v2.12.232 - 2026-07-10

## Checklist dosar personal HR

- HR are checklist centralizat pentru completitudinea dosarului personal pe fiecare angajat.
- Checklistul verifica CIM, act identitate, fisa postului, apt medical si SSM/PSI ca documente obligatorii.
- Documentele optionale GDPR, diplomele si actele aditionale sunt afisate ca status separat.
- Dosarul electronic are tipuri noi de document pentru fisa postului, SSM/PSI si GDPR.

# v2.12.231 - 2026-07-09

## Confirmare documente HR in Kiosk

- Documentele generate sau marcate de HR pot fi afisate angajatului in Kiosk.
- Angajatul poate deschide documentul si confirma luarea la cunostinta.
- Confirmarea salveaza data, utilizatorul, IP-ul si auditul operatiunii.
- Dosarul electronic afiseaza daca un document necesita confirmare si cand a fost confirmat.

# v2.12.230 - 2026-07-09

## Sabloane HR editabile

- HR poate edita sabloanele pentru CIM si acte aditionale direct din tabul Documente HR.
- Sabloanele accepta variabile de tip `{{angajat.nume}}`, `{{contract.salariu_baza}}` si `{{company.denumire}}`.
- Generarea CIM si a actelor aditionale foloseste sablonul salvat, cu fallback la documentul intern existent.
- MSSQL primeste tabelul `hr.document_templates`, compatibil cu texte HTML lungi.

# v2.12.229 - 2026-07-09

## Dosar HR live si previzualizare documente generate

- Dosarul electronic se reincarca automat dupa generarea si arhivarea unui CIM sau act aditional.
- Documentele generate HTML au buton Deschide pentru previzualizare in browser.
- Documentele din dosar sunt etichetate clar ca generate electronic sau incarcate manual.
- Fluxul HR nu mai necesita apasarea manuala a butonului Reincarca dupa generare.

# v2.12.228 - 2026-07-09

## Arhivare automata documente HR generate

- CIM-urile generate din contracte sunt salvate automat in dosarul electronic al angajatului.
- Actele aditionale generate din istoric sunt salvate automat in dosarul electronic.
- Documentele generate sunt arhivate ca HTML printabil si marcate „generat electronic”.
- Dosarul electronic poate descarca fisiere `text/html` generate intern.

# v2.12.227 - 2026-07-09

## Documente HR din contracte si acte aditionale

- Contractele salariale au buton de generare document CIM printabil.
- Actele adiționale din istoricul contractului au buton de generare document printabil.
- Șablonul CIM folosește contractul operațional selectat pentru data de început, normă și salariu.
- Actul adițional generat completează automat tipul modificării, data efectului și valorile salvate.

# v2.12.226 - 2026-07-09

## Acte aditionale HR aplicate pe contract

- Contractele salariale au istoric de acte adiționale legate de contract.
- Se pot aplica acte pentru modificare salariu, funcție, normă, departament, suspendare și încetare.
- Aplicarea actului actualizează automat contractul operațional și, unde este cazul, fișa angajatului.
- Schema MSSQL primește tabelul `hr.contract_amendments`.

# v2.12.225 - 2026-07-09

## Editare contracte si dosar personal HR

- Fișa angajatului separă contractele operaționale folosite de salarizare de fișierele CIM încărcate în dosarul electronic.
- Contractele HR pot fi create și editate direct din fișa angajatului: număr, date, normă, salariu, status și observații.
- Documentele din dosarul electronic pot fi redenumite, reclasificate, datate sau anulate controlat.
- Contractele cu status nesetat sunt tratate ca active și în fișa HR, nu doar în salarizare.

# v2.12.224 - 2026-07-09

## Diagnostic surse HR in salarizare

- Liniile salariale primesc diagnostic detaliat pentru contract, pontaj, concedii si ajustari active.
- Contabilitatea vede daca sursele HR s-au modificat dupa calculul statului si trebuie regenerat.
- Modalul „Detalii surse” explica de ce lipseste contractul/pontajul si afiseaza contractele neeligibile.
- Operatorul are actiuni rapide spre HR, Pontaj si regenerarea statului.

# v2.12.223 - 2026-07-08

## Salarizare sincronizata cu HR

- Contractele si pontajele MSSQL sunt recitite la fiecare regenerare a statului salarial.
- Contractele fara status explicit sunt tratate ca active.
- Impartirea indemnizatiei medicale este verificata individual pentru fiecare certificat.
- Ajustarile medicale multiple produc avertizare de verificare, fara cumularea eronata a impartirilor.

# v2.12.222 - 2026-07-08

## Baza CM si actualizare automata pontaj

- Introducerea bazei zilnice foloseste un modal compatibil Electron, nu `window.prompt`.
- Modalul afiseaza estimarea indemnizatiei inainte de confirmare.
- Concediile aprobate completeaza automat pontajul pe zilele lucratoare.
- Compensarea cu timp liber reduce automat orele lucrate si salveaza orele compensate.
- O zi compensata integral este marcata `liber`.
- Pontajele validate si lunile inchise nu pot fi modificate automat.

# v2.12.221 - 2026-07-08

## Registru concedii medicale si salarizare

- Registru CM lunar cu episoade initiale si in continuare.
- Procente propuse pentru codul 01: 55%, 65% sau 75% dupa durata episodului.
- Regula temporara 2026: prima zi neindemnizata, zilele 2-6 angajator, apoi FNUASS.
- Separare zile lucratoare, zile angajator, zile FNUASS si zile neindemnizate.
- Baza zilnica din media ultimelor sase luni este confirmata de operator.
- Trimitere fara duplicare in ajustarile statului salarial si export Excel.

# v2.12.220 - 2026-07-08

## Certificate de concediu medical in Kiosk

- Formular dedicat CM cu serie, numar, tip certificat, data acordarii, perioada, cod indemnizatie si date emitent.
- Numarul de zile calendaristice este calculat automat, separat de zilele lucratoare din pontaj.
- Document PDF, JPG sau PNG obligatoriu, maximum 10 MB.
- Flux de verificare HR: in verificare, verificat sau respins cu motiv.
- Aprobarea concediului medical este permisa numai dupa verificarea documentului.
- Vizualizarea documentelor medicale este restrictionata si auditata.

# v2.12.219 - 2026-07-08

## Asociere cont Kiosk cu angajat HR

- Selectorul din Superadmin salveaza acum `employee_id` la editarea utilizatorului.
- Asocierea este sincronizata in `hr.employees.user_id` pentru MSSQL si JSON.
- Asocierea facuta din fisa HR actualizeaza si contul aplicatiei.
- Un angajat nu poate fi asociat simultan mai multor conturi.
- Kiosk poate incarca pontajul, concediile, autorizatiile si datele personale ale angajatului asociat.

# v2.12.218 - 2026-07-08

## Hotfix devalidare pontaj MSSQL

- Devalidarea si reversarea costurilor de manopera se executa in aceeasi tranzactie SQL.
- Un esec nu mai poate lasa reversarea si starea pontajului necorelate.
- API-ul raporteaza numarul real de inregistrari devalidate.
- Cererile de concediu pot fi aprobate imediat dupa devalidarea pontajului afectat.

# v2.12.217 - 2026-07-08

## Devalidare pontaj si sesiune Kiosk

- Pontajul validat poate fi devalidat cu motiv obligatoriu.
- Devalidarea este auditata si respecta inchiderea lunii.
- Costurile de manopera din Controlling sunt reversate prin inregistrare compensatoare.
- Erorile Kiosk nu mai sterg tokenul sesiunii ERP.
- Intoarcerea din Kiosk in clientul desktop pastreaza utilizatorul autentificat.

# v2.12.216 - 2026-07-08

## Concedii si asociere Kiosk

- Formular administrativ pentru crearea cererilor de concediu.
- Lista cererilor afiseaza numele angajatului.
- Contul aplicatiei poate fi asociat explicit din fisa angajatului.
- Un cont nu poate fi asociat simultan mai multor angajati.
- Verificarea suprapunerilor se aplica si cererilor trimise din Kiosk.

# v2.12.215 - 2026-07-07

## Control timp de munca si concedii

- Flux propus, aprobat sau respins pentru orele suplimentare.
- Banca de ore include numai ore aprobate si istoricul anterior.
- Control operational saptamanal pentru depasiri.
- Concediile aprobate completeaza automat pontajul.
- Suprapunerile si pontajele validate sunt blocate explicit.
- Reparat raspunsul la crearea cererilor de concediu.

# v2.12.214 - 2026-07-07

## Pontaj, banca de ore si ture

- Export Excel reorganizat si completat cu totaluri.
- Orele peste norma turei intra automat in banca de ore.
- Sold initial, timp liber in avans si evidenta scadentei la 90 zile.
- Plata orelor genereaza ajustare salariala cu spor de minimum 75%.
- Ture editabile si dezactivabile, cu istoric pastrat.

# v2.12.213 - 2026-07-07

## HR si pontaj departamente

- Pontaj lunar editabil pe fiecare angajat si zi.
- Completare automata a zilelor lucratoare pentru departamentul selectat, fara suprascrierea exceptiilor.
- Dosar electronic per angajat si fluturasi validati in Kiosk.
- Inchidere/deblocare controlata a lunii de pontaj.
- Protectie distincta pentru date personale, medicale si salariale.
- Registru de lucru pentru REGES-ONLINE, marcat explicit ca export intern.

# v2.12.211 - 2026-07-07

- Health MSSQL arata transportul conexiunii, ultima migrare si starea D205/Intrastat.
- Schedulerul PIUSI porneste sincronizarea numai pentru un fisier MDB configurat si existent.

# v2.12.210 - 2026-07-06

- D205 genereaza structura ANAF si este verificata local cu XSD-ul oficial.
- Intrastat include origine, judet, conditie de livrare, transport si valoare statistica.
- Situatiile financiare includ zonele Intocmit, Verificat si Aprobat.
- Integrarea SPV are configurare OAuth, autorizare si reinnoire token, cu secrete criptate.
- Campurile fiscale sunt persistate si in oglinzile relationale MSSQL.
- Acceptanta de release verifica regresiile contabile, backup-ul si pornirea pe baza curata.

# v2.12.200 - 2026-07-02

- D205: registru anual, controale, export Excel si XML candidat.
- Intrastat: registru lunar, validari, export Excel si XML candidat.
- Harta fiscala unica pentru D300, D394, D112, D406, D205 si Intrastat.
- D112, situatiile financiare, trezoreria si e-Factura consolidate prin acceptanta si regresii.
- Persistenta JSON/MSSQL si build comercial complet Server, Client si ZIP update.

# v2.12.190 - 2026-07-01

- Recipisele D406 sunt legate de rularea SAF-T si arhivate cu hash.
- Inchiderea fiscala cere recipise acceptate D300, D394, D112 si D406.
- Ecranul de inchidere arata exact declaratiile care lipsesc.
- Manifestele si instalerele complete sunt sincronizate la 2.12.190.

# v2.12.187 - 2026-07-01

- DUK are diagnostic asistat pentru Java, validator si configurarea locala.
- SAF-T verifica legaturile dintre facturi, note, plati si conturi.
- Erorile pot fi corectate din zona sursa, apoi rularea poate fi reverificata.
- Dosarul fiscal lunar se descarca ZIP cu acceptanta, diagnostic si D406.
- Fluxul contabil end-to-end este acoperit de teste automate.

# v2.12.182 - 2026-07-01

- Configurare automata DUK direct din Audit fiscal.
- Detectare CLI si Java inclus in kitul validatorului.
- Probleme SAF-T cu actiuni si legaturi directe de remediere.
- Deschidere automata a tertului indicat de diagnostic.
- Ghid distinct pentru erori DUK, XSD si date sursa.

# v2.12.181 - 2026-07-01

- Identificatori SAF-T pentru terti in formatul oficial `00+CUI`.
- Conturi de terti, unitati UNECE si metode de plata normalizate pentru DUK.
- Sectiuni D406 generate conditionat dupa tipul declaratiei si continut.
- Erorile reale din raportul DUK sunt afisate in Audit fiscal.
- Detectare Java inclus local in kitul validatorului ANAF.

# v2.12.180 - 2026-06-30

- Coduri SAF-T oficiale pentru tipurile de factura, TVA si miscarile de stoc.
- Mapari distincte TVA pentru vanzari, achizitii si registrul contabil.
- Detectare DUK din FreeTab prin caile standard, `SAGA_FREETAB_PATH` sau `ANAF_DUK_PATH`.
- Comanda D406 DUK completeaza automat anul si luna din XML.
- Build complet Server EXE, Client EXE si update ZIP.

# v2.12.179 - 2026-06-30

- Generator SAF-T modular pentru Header, MasterFiles, GeneralLedgerEntries si SourceDocuments.
- Facturi de vanzare/cumparare, plati/incasari si miscari de stoc in candidatul D406.
- Solduri contabile de deschidere/inchidere si tipuri de cont conforme structural.
- Verificari explicite pentru datele companiei si codurile NC ale produselor.
- Fixture-ul complet trece schema XSD ANAF v2.4.9 cu zero erori.

# v2.12.178 - 2026-06-30

- Schema oficiala ANAF SAF-T v2.4.9 este inclusa si verificata prin SHA-256.
- Profilul D406 foloseste automat namespace-ul oficial pentru perioadele din 2025 inainte.
- Validare XSD locala obligatorie inaintea validatorului DUK configurat.
- Erorile structurale sunt vizibile in Audit fiscal si blocheaza exportul fiscal.
- Configurarea validatorului D406 este acceptata de backend.

# v2.12.177 - 2026-06-30

- Acceptanta contabil-fiscala lunara cu mesaje si pasi de remediere.
- Profiluri de situatii financiare valabile pe perioade.
- Candidati D300/D394 bazati pe profilurile XSD incarcate.
- Generator D406 pentru MasterFiles, GeneralLedgerEntries si SourceDocuments.
- Dosar fiscal extins si pagina centrala Audit fiscal.

# v2.12.170 - 2026-06-30

- Profiluri XSD ANAF cu valabilitate pe perioada, namespace, radacina si atribute obligatorii.
- Resolver de schema pentru D112, D300 si D394, fara suprascrierea istoricului.
- Situatii financiare comparative cu mapari configurabile pe conturi.
- Export Excel, coperta print/PDF si control activ/pasiv.
- Build complet Server EXE, Client EXE si update ZIP.

# v2.12.168 - 2026-06-30

- Detectie si testare asistata pentru Java si validatoarele locale D112, D300 si D394.
- Generare XML candidat, validare automata si descarcare numai dupa acceptare.
- Stat salarial rectificativ, concediu fara plata si detalii medicale controlate.
- Dosar lunar ZIP cu manifest, snapshot, istoric, documente fiscale si coperta A4.

# v2.12.164 - 2026-06-29

- Ordinele CAS, CASS, impozit si CAM sunt generate din statul validat si pot fi platite/stornate prin trezorerie.
- Raportul D112 arata maparea si erorile pentru fiecare angajat.
- Configurarea validatorului oficial este separata pentru D300, D394 si D112.
- XML-urile verificate sunt arhivate cu SHA-256 si rezultatul nativ al validatorului.
- Calendarul fiscal foloseste termene distincte si semnaleaza apropierea sau depasirea lor.
- Auditul end-to-end urmareste facturi, note, trezorerie, salarizare, declaratii si recipise.
- Migrari MSSQL noi: 039, 040 si 041.

# v2.12.161 - 2026-06-29

- Salarizarea trateaza separat avansuri, popriri, tichete de masa si concedii medicale confirmate.
- Sunt disponibile fluturasii colectivi si registrul de plata Excel.
- Profilurile bancare genereaza XLSX sau CSV, iar plata creeaza trezoreria si nota `421 = banca`.
- Plata si nota contabila salariala se storneaza controlat, cu motiv si audit.
- XML-ul D112 poate fi verificat prin comanda DUK configurata local; acceptarea este raportata numai dupa succesul validatorului.
- Migrarea MSSQL 038 adauga profilurile bancare si legaturile de plata/stornare.

# v2.12.160 - 2026-06-28

- Salarizare faza 2: ajustari recurente, indemnizatii medicale, fluturasi si plati bancare.
- Nota contabila a statului salarial se genereaza o singura data din statul validat.
- Sursa XML D112 este construita din stat si ramane marcata pentru validare oficiala externa.
- Inchiderea lunii blocheaza lipsurile din checklistul fiscal si afiseaza pasul necesar.
- Marcarea perioadei ca depusa cere recipise acceptate D300, D394 si D112.
- Schema MSSQL pentru ajustarile si platile salariale este versionata separat.

# v2.12.159 - 2026-06-28

## Transfer angajat intre departamente

- Departamentul poate fi schimbat direct din editarea fisei angajatului.
- Schimbarea cere data si motiv si este inregistrata ca transfer auditat.
- Fisa angajatului afiseaza istoricul departamentelor.
- In MSSQL se actualizeaza impreuna `department_id` si `department_cod`, astfel incat filtrele, pontajul si salarizarea folosesc acelasi departament.
- Istoricul transferurilor este disponibil atat in DB_MODE=json, cat si in DB_MODE=mssql.
- 50 de teste de regresie si build-ul frontend au fost verificate.

# v2.12.158 - 2026-06-28

## Centru fiscal, salarizare si e-Factura

- Centrul fiscal deschide implicit checklistul lunar si calendarul orientativ pentru D300, D394 si D112.
- Salarizarea faza 1 calculeaza brutul, sporurile, CAS, CASS, impozitul, retinerile, netul, CAM si costul angajatorului.
- Profilurile fiscale sunt versionate dupa data intrarii in vigoare, iar cazurile speciale raman marcate pentru verificarea operatorului.
- Statul salarial poate fi generat, corectat, validat, devalidat cu motiv si exportat in Excel.
- D112 devine pregatit numai dupa validarea pontajului si a statului salarial pentru toti angajatii activi.
- e-Factura verifica datele obligatorii, liniile, totalurile si corespondenta cu factura contabila sursa.
- XML-ul validat si raspunsurile SPV sunt arhivate cu checksum SHA-256 si descarcare autentificata.
- Schema relationala include tabelele HR pentru profiluri, state si linii salariale.
- 50 de teste de regresie si build-ul frontend au fost verificate.

# v2.12.157 - 2026-06-28

## Declaratii fiscale, D112 si e-Factura

- D112 verifica datele sursa din HR: angajati, CNP, contracte, salarii de baza si pontaje validate.
- Registrul fiscal include D300, D394 si D112, cu fisierele declaratiei si recipisei arhivate separat.
- Exportul Excel D112 este un control de pregatire, fara simularea contributiilor sau a XML-ului fiscal final.
- Diagnosticul SAF-T acopera suplimentar taxele, mijloacele fixe, trezoreria si prezenta schemei oficiale.
- Modificarea statusului e-Factura actualizeaza automat factura contabila legata.
- Sincronizarea facturilor de iesire reutilizeaza inregistrarea e-Factura existenta si evita duplicatele.
- Exporturile D300 si D394 din interfata cer o validare interna fara erori.
- 44 de teste contabile si buildul frontend au fost verificate.

# v2.12.156 - 2026-06-28

## Hotfix update ZIP si instalere

- Componenta `AsternerePage` foloseste acum exclusiv un nume de fisier si identificator ASCII.
- Update-ul ZIP se extrage consecvent pe Windows, fara diferenta intre numele arhivat si cel cautat de updater.
- Textele vizibile din instalerele Server si Client au fost rescrise fara diacritice si fara secvente corupte.
- Pachetul include integral functionalitatile contabile din v2.12.155.

# v2.12.155 - 2026-06-28

## Contabilitate - control fiscal si declaratii

- Registru fiscal D300/D394 cu starile validat intern, exportat, depus, acceptat si respins.
- Recipisele ANAF pot fi arhivate ca PDF, XML, ZIP sau TXT, cu amprenta SHA-256 si descarcare autentificata.
- Validarea TVA compara documentele, rulajele conturilor 4426/4427 si balanta de verificare.
- Facturile contabile de iesire validate pot crea sau actualiza direct draftul e-Factura.
- Facturile primite prin import e-Factura sunt marcate vizibil in registrul facturilor de intrare.
- SAF-T afiseaza in continuare diagnosticul de mapare fara a pretinde generarea unui XML fiscal final.
- 40 de teste contabile si build-ul frontend au fost verificate.

# v2.12.154 - 2026-06-28

- Reconciliere bancara automata in lot pentru sugestiile cu scor minimum 85% si rezultat neambiguu.
- Potrivirile concurente sau slabe raman explicit pentru confirmarea operatorului.
- Registrele Casa si Banca includ sold initial, incasari, plati si sold final pentru fiecare zi.
- Exportul jurnalelor include foile `Sold zilnic casa` si `Sold zilnic banca`.
- Inchiderea lunii este blocata de operatii bancare validate dar neclasificate si de importuri nefinalizate.
- Marcajul TVA devine invalid daca totalurile 4426/4427 se modifica dupa verificare.
- Redeschiderea cere motiv, iar depunerea declaratiilor cere referinta, validate inclusiv in backend.
- Verificat cu 37 teste contabile, build frontend si integrare API/export Excel.

# v2.12.153 - 2026-06-27

- O plata poate stinge una sau mai multe facturi ale aceluiasi tert, manual sau FIFO dupa scadenta.
- Avansurile furnizor/client din conturile 409/419 pot fi alocate ulterior, cu nota contabila de transfer.
- Grupurile de stingeri se pot anula controlat, cu restaurarea soldurilor si storno contabil.
- Soldurile facturilor furnizor tin cont simultan de plati si note de credit.
- Fisa furnizor include rulaj anual, stingeri, export Excel si forma tiparibila.
- Jurnalul de cumparari evidentiaza distinct notele de credit.
- Inchiderea lunii blocheaza notele de credit ramase in draft.
- Schema MSSQL include oglinzile relationale `accounting_credit_notes` si `accounting_settlements`.
- Verificat cu 33 de teste contabile si flux browser desktop/mobil.

# v2.12.152 - 2026-06-27

- Note de credit furnizor create din retururi parțiale, cu validare, devalidare și storno controlat.
- Corecția actualizează soldul facturii, jurnalul contabil, TVA/D300 și D394.
- Formular dedicat pentru factura din mai multe NIR-uri, cu distribuirea proporțională a diferenței și păstrarea cotelor TVA.
- Fișa furnizorului include notele de credit, circuitul complet Achiziții - Contabilitate și export PDF/Excel.
- Circuitul indică veriga lipsă dintre comandă, NIR, factură, plată și retur.
- Regresie extinsă la 28 de teste automate și verificare responsive la 390 px.

# v2.12.151 - 2026-06-27

- Factură furnizor creată din unul sau mai multe NIR-uri ale aceluiași furnizor.
- Control automat al diferenței dintre totalul declarat al facturii și totalul recepțiilor.
- Tab Recepții în Achiziții, cu retur parțial sau integral pe material.
- Returul actualizează stocul, costul mediu, comanda și trasabilitatea mișcărilor.
- Retururile cu factură legată apar în Contabilitate cu pas ajutător; returul integral poate genera storno automat.
- Protecție la storno pentru facturi cu plăți deja înregistrate.
- Regresie extinsă la 24 de teste automate și verificare responsive la 390 px.

# v2.12.150 - 2026-06-27

- Schema MSSQL 034 pentru categorii si inventarieri de mijloace fixe, registrul schemelor ANAF si campurile tehnice extinse.
- Sincronizarea relationala include noile colectii fara schimbarea sursei principale app_state.
- Interfata grupeaza noile actiuni in Contabilitate > Operatiuni si TVA / D300.
- Regresie extinsa la 20 de teste automate si build complet Server + Client.

# v2.12.149 - 2026-06-27

- Categorii de mijloace fixe cu durata implicita si metoda liniara explicita.
- Inventariere a registrului activ si proces-verbal tiparibil de scoatere din evidenta.
- Incarcare controlata XSD/ZIP pentru D300, D394, D112 si SAF-T, cu amprenta SHA-256 si versiune activa.

# v2.12.148 - 2026-06-27

- Import XML UBL pentru e-Facturile primite, direct in Facturi intrare ca draft verificabil.
- Furnizorul este identificat dupa CUI sau denumire si este creat numai daca lipseste.
- Protectie la import duplicat dupa furnizor si numar document.

# v2.12.147 - 2026-06-27

- NIR valoric cu pret unitar, TVA, baza si total pe fiecare linie.
- Receptia actualizeaza costul mediu ponderat si pastreaza costul in miscarea de stoc.
- Factura furnizor se poate genera ca draft direct din receptia necorelata.

# v2.12.146 - 2026-06-27

- Meniul global Actiuni foloseste portal la nivelul paginii si nu mai este taiat de tabele sau containere cu overflow.
- Meniurile se repozitioneaza automat la scroll, resize si lipsa de spatiu sub buton.
- Asistent de inchidere lunara in sase etape: documente, trezorerie, stocuri, TVA, balanta si inchidere.
- Reconciliere intre receptiile din Gestiune si facturile furnizor dupa document, furnizor si material.
- Legatura confirmata este pastrata atat pe receptie, cat si pe factura contabila.
- Registrul mijloacelor fixe poate fi exportat Excel.
- Fisa fiecarui mijloc fix include istoricul si planul complet de amortizare pentru tiparire.
- Raport consolidat pentru controalele si istoricul D300/D394.
- Audit de integritate pentru documente fara note, note fara linii, linii orfane, duplicate, stocuri si declaratii.
- Export Excel al auditului contabil cu sumar si lista problemelor.
- Verificare reala in browser pe server separat si 17 teste automate trecute.

# v2.12.145 - 2026-06-27

- Reconciliere bancara asistata cu punctaj dupa suma, document si tert.
- Confirmarea sugestiei pastreaza validarea finala in fluxul existent de Trezorerie.
- Detectare profil extras bancar si finalizare controlata a lotului importat.
- Evaluare cronologica a stocurilor prin cost mediu ponderat, cu alerte pentru cost lipsa si stoc negativ.
- Costul CMP completeaza automat iesirile de stoc care nu au cost unitar explicit.
- Ciclul mijloacelor fixe include punere in functiune, transfer, reevaluare si casare.
- Reevaluarea si casarea genereaza note contabile echilibrate si evenimente de istoric.
- D300 si D394 au validare interna versionata, checksum si inregistrarea recipisei ANAF.
- D300 ramane in lucru daca TVA-ul documentelor nu corespunde conturilor 4426/4427.
- Reportarea soldurilor bilantiere in anul urmator este protejata la duplicate si are export Excel de control.
- MSSQL: tabele relationale pentru evenimentele mijloacelor fixe, validari de declaratii si reportari.
- Regresie extinsa la 14 teste automate pentru fluxurile contabile critice.

# v2.12.144 - 2026-06-27

- Import extrase bancare CSV/XLS/XLSX cu detectarea duplicatelor si potrivire exacta dupa factura si suma.
- Operatiunile importate intra in Trezorerie ca draft si pastreaza validarea contabila existenta.
- Sincronizare controlata a miscarilor de stoc in contabilitate, cu verificarea costului si protectie la duplicate.
- Registru de mijloace fixe, anulare cu istoric si calcul lunar al amortizarii liniare.
- Note automate de amortizare pe conturile 6811, 2813 si contul de imobilizare configurat.
- Control TVA intre facturi si rulajele conturilor 4426/4427 in panoul declaratiilor.
- Inchidere anuala a claselor 6 si 7 prin rezultatul exercitiului, numai dupa controalele perioadei.
- Pagina Contabilitate > Operatiuni pentru banca, stocuri, mijloace fixe, amortizare si inchidere anuala.
- MSSQL: cinci tabele relationale noi pentru noile fluxuri contabile.
- Regresie extinsa la noua teste automate pentru nucleul contabil.

# v2.12.143 - 2026-06-27

- D394 detaliat: documente, cote TVA, operatiuni, terti romani si validari CUI/document/data.
- Export D394 cu foi separate pentru sumar, documente si probleme de rezolvat.
- Inchidere luna: snapshot contabil versionat cu balanța analitica, documente si checksum SHA-256.
- Istoric pentru inchidere, redeschidere si depunere, vizibil direct in pagina perioadei.
- Cartea Mare: export separat pentru sumar si miscari detaliate.
- Fisa de cont: conturi corespondente, sumar lunar si export imbunatatit.
- SAF-T: diagnostic de mapare pentru companie, conturi, terti, facturi, note si materiale.
- MSSQL: tabele relationale pentru snapshoturile si evenimentele perioadelor.
- Regresie: cinci teste automate pentru fluxul contabil critic.

# v2.12.142 - 2026-06-27

- Trezorerie: filtru rapid, totaluri si avertizare pentru avansurile nestinse.
- Reconciliere: avansurile nestinse apar separat de operatiile necorelate.
- Inchidere luna: verifica notele fara linii si afiseaza avansurile ramase fara a bloca inchiderea.
- Redeschidere/depunere: motivul redeschiderii si referinta recipisei sunt pastrate in perioada si audit.
- Declaratii: panou de pregatire D300, D394 si SAF-T, cu raport D394 intern grupat pe tert/CUI.
- Export D394: registru Excel de lucru cu totaluri si verificari pentru tertii fara CUI.

# v2.12.141 - 2026-06-26

- Trezorerie: avansurile validate pot fi stinse ulterior cu factura sugerata.
- Stingerea avansului actualizeaza restul facturii fara sa rescrie nota contabila initiala.
- Operatia de trezorerie primeste legatura catre factura si audit dedicat.
- Interfata afiseaza actiunea rapida doar cand exista o potrivire probabila.

# v2.12.140 - 2026-06-26

- Trezorerie: operatiile fara factura legata pot fi marcate ca avans sau corectie.
- Reconciliere contabila: avansurile si corectiile marcate nu mai apar la trezorerie necorelata.
- Formular Trezorerie: camp Corelare si observatii pentru avans/corectie.
- Lista Trezorerie: badge vizibil pentru operatiile marcate.
- Validare: corelarea de tip factura cere factura selectata.

# v2.12.8 — 2026-06-02

- Installerul detectează automat instanța, versiunea și ediția SQL Server existente.
- SQL Server 2008–2014 primește profilul `legacy`, cu `dbo.app_state` compatibil și fără constrângerea `ISJSON`.
- SQL Server 2016+ primește profilul `modern`; modul relațional rămâne dezactivat implicit până la validarea separată.
- Configurația MSSQL este salvată coerent în `.env`, `runtime\mssql.env` și launcherul Task Scheduler.
- Bootstrap-ul solicită automat credentialele `sa` dacă utilizatorul Windows nu are drepturi SQL administrative suficiente.

# v2.12.7 — 2026-06-02

- Shortcut-ul manual și Task Scheduler folosesc același launcher MSSQL.
- Task-ul `InfraFlow ERP` pornește atât la boot, cât și la logon.
- Scriptul `repair-autostart.ps1` reconstruiește pornirea automată și afișează diagnosticul complet dacă serverul nu pornește.

# v2.12.6 — 2026-06-02

- Instalare curată completă: baza `INFRAFLOW` și loginul SQL dedicat sunt create automat.
- Compatibilitate cu SQL Server 2008 `.\CIEL`, inclusiv acordarea rolurilor prin procedurile legacy suportate.
- Validare obligatorie a pornirii serverului la finalul installerului.
- Restore MSSQL `.bak` cu backup de siguranță și script administrativ separat.
- Kit de resetare care șterge exclusiv baza `INFRAFLOW`, fără a atinge bazele CIEL.

# v2.12.5 — 2026-06-02

- Installerul detectează automat instanța SQL Server existentă și preferă instanța care conține deja baza `INFRAFLOW`.
- Pornirea automată preia `DB_SERVER` din `runtime\mssql.env`, fără valoare `.\SQLEXPRESS` hardcodată.
- Scriptul `repair-sql-instance.ps1` repară instalările existente fără reinstalare și fără ștergerea bazei.

# v2.12.4 — 2026-06-02

- Pornire automată robustă după reboot, cu retry la 15 secunde dacă SQL Express nu este încă pregătit.
- Loginul SQL `infraflow` primește acces `sysadmin` pentru integrări și baza `autoMinder5`.
- Buton vizibil `Foi Parcurs` în Mecanizare și limită trial corectată la 50 utilizatori.

## v2.12.3 — 2026-06-01
### MSSQL izolat pentru InfraFlow
- Aplicația folosește baza dedicată `INFRAFLOW` și loginul SQL dedicat `infraflow`.
- Credentialele sunt salvate protejat în `runtime/mssql.env`, fără acces la celelalte baze.
- Modulele legacy folosesc `app_state` până la activarea explicită a proiecției relaționale.

## v2.12.2 — 2026-06-01
### Hotfix acces MSSQL Task Scheduler
- Installerul creează `InfraFlowDB` înainte de prima pornire.
- Contul `NT AUTHORITY\SYSTEM` primește acces `db_owner` pentru taskul `InfraFlow ERP`.
- Directorul backup primește ACL pentru serviciul SQL Express.

## v2.12.1 — 2026-06-01
### Migrare completă pe MSSQL
- SQL Server Express este baza implicită pentru instalările de producție.
- Trackerul `dbo.schema_migrations` este inițializat; proiecția relațională legacy rămâne opt-in până la uniformizarea cheilor.
- Installerul verifică SQL Express, programează backup zilnic `.bak` și expune `GET /api/system/health`.

## v2.12.0 — 2026-06-01
### Foi Parcurs Digital Complet
- Responsabilul trimite foaia șoferului, iar șoferul completează verso și semnează de pe telefon.
- Responsabilul lucrării semnează din link public unic, fără autentificare; șeful mecanizare aprobă apoi documentul.
- PDF-ul final include activități, calcule, semnături și cod QR pentru verificarea autenticității.
- Notificările Web Push sunt disponibile pe dispozitivele șoferilor subscriși.

## v2.11.11 — 2026-06-01
### Hotfix restart robust după update ZIP
- Restartul rulează într-un task Windows temporar independent de procesul serverului.
- Sunt suportate serviciul `InfraFlow`, task-ul programat `InfraFlow ERP` și pornirea directă fallback.
- Ultimul rezultat al restartului este jurnalizat în `runtime/restart-last.log`.

## v2.11.10 — 2026-06-01
### Scule, unelte și catalog gestionar
- Extins modulul Echipamente cu scule, unelte, inventar și SSM.
- Adăugat catalog editabil pentru gestionar, cu mărime, serie, expirare, valoare, cod articol și furnizor.
- Fișa angajatului și Kiosk afișează inventarul grupat și totalul valoric în răspundere.
- Nota de lichidare listează separat echipamentele și sculele de predat.

## v2.11.9 — 2026-06-01
### Hotfix restart după update ZIP
- Restartul automat detectează serviciul Windows `InfraFlow` sau task-ul programat `InfraFlow ERP`.
- Procesul vechi este oprit înainte de relansare, evitând blocarea serverului după aplicarea arhivei ZIP.

## v2.11.8 — 2026-06-01
### Kiosk universal pentru utilizatorii activi
- Orice utilizator activ primește automat permisiunile de bază pentru Kiosk.
- Pagina Kiosk afișează rezumatul personal pentru pontaj, concedii, autorizații, program și notificări.
- Administrarea utilizatorilor arată accesul Kiosk automat și nedezactivabil.

## v2.11.7 — 2026-06-01
### Editor vizual documente
- Formularul Template nou folosește Quill.js din CDN.
- Variabilele pot fi inserate ca badge-uri și previzualizate cu date fictive.
- Toolbar-ul include formatare, liste, aliniere și tabele.

## v2.11.6 — 2026-06-01
### Notă Comandă PDF
- Comenzile de aprovizionare au document HTML tipăribil în format Publiserv.
- Datele firmei, furnizorului, produselor și semnăturilor sunt completate automat.
- Lista comenzilor include buton de tipărire și modalul include prețul unitar.

## v2.11.5 — 2026-05-31
### Hotfix sesiune după wizard
- Finalizarea wizard-ului salvează sesiunea emisă de server.
- După configurarea inițială aplicația intră direct în dashboard.
- Username-ul administratorului nou înlocuiește autofill-ul vechi.

## v2.11.4 — 2026-05-31
### Hotfix wizard inițial
- Verificarea ANAF din wizard este publică înainte de autentificare.
- Erorile din configurarea inițială rămân vizibile în pagină.
- Finalizarea wizard-ului folosește ruta modernă publică.

## v2.11.3 — 2026-05-31
### Hotfix installer și autentificare
- Installerul server folosește un seed curat pentru instalări noi și pornește wizard-ul inițial.
- Endpoint-ul modern finalizează wizard-ul înainte de autentificare.
- Upgrade-urile păstrează baza existentă prin `onlyifdoesntexist`.
- Formularul de login afișează eroarea de autentificare fără reîncărcarea paginii.

## v2.11.2 — 2026-05-31
### Stabilizare update, HR și GPS
- Upload ZIP tolerant la director exterior și mesaje clare pentru arhive invalide.
- Aplicarea ZIP copiază versiunea, changelog-ul, seed-ul CPV și scripturile livrate.
- Seed-ul CPV are fallback în modulul server pentru bootstrap din updaterul vechi.
- Departamentele HR vin din nomenclatorul central, inclusiv înaintea importului de angajați.
- Catalogul CPV inclus este explicat clar în Setări.
- GPS salvează configurarea înainte de test și acceptă furnizori alternativi prin API JSON/XML cu Bearer token.

## v2.10.5 — 2026-05-29
### Fix GPS Live — hartă cu vehicule urmariregps.ro
- Backend GPS folosește endpoint-ul real `new/libz/mysqli/ajax.php` și încearcă payload-ul real `data_in`, `gps=%`, `client=120` înainte de fallback-uri.
- Parserul acceptă răspunsuri JSON cu câmpuri CSV (`numar`, `la_al`, `lo_al`, `viteze`) și structuri XML/marker variate.
- Adăugat endpoint de diagnostic `/api/integration/gps/raw` pentru verificarea răspunsului brut.
- Restartul după update citează corect calea `.bat` din `Program Files` și păstrează `APP_KEY` pentru decriptarea setărilor.

## v2.10.0 — 2026-05-28
### Canale automate mesagerie — departamente, import angajați, default channels, badges UI

#### TASK 1 — Canal automat la creare departament
- `POST /departments` creează automat un canal de mesaje de tip `departament` cu același nume.
- Utilizatorii din acel departament sunt înscriși automat.
- Canalul are `creat_automat: true` (indicator 🤖 în UI).

#### TASK 2 — Canale automate la import angajați CSV/Excel
- `POST /hr/employees/import` — după import, creează canale pentru fiecare departament unic din fișier, dacă nu există deja.

#### TASK 3 — Canale default la prima instalare
- `createDefaultChannels()` creată: **General** (💬 public), **Anunțuri** (📢 readonly), **IT & Suport** (🛠️ public).
- Canale departament predefinite: Mecanizare, Tehnic, Achiziții, Gestiune, HR, Salubrizare.
- Toate canalele au `icon`, `descriere`, `creat_automat: true`.

#### TASK 4 — Auto-înscriere utilizatori în canale
- `createUser()` înscrie automat noul user în canalul **General** + canalul departamentului său.
- `updateUser()` detectează schimbarea de departament: scoate din canalul vechi, adaugă în cel nou.

#### TASK 5 — UI Mesaje: badges tip canal + 🤖 indicator
- Sidebar canale: badge colorat (**Departament** / **Anunțuri** / **Public** / **Direct**).
- 🔒 pentru canale readonly, 🤖 pentru canale create automat.
- Header canal activ: badge tip + descriere + readonly/automat indicator.
- `channelIcon()` folosește acum câmpul `icon` al canalului dacă există.
- `publicChannel()` expune: `icon`, `descriere`, `readonly`, `departament_id`, `creat_automat`, `default`.

---

## v2.9.0 — 2026-05-28
### Creare utilizatori cu verificare HR, favicon macara, serviciu Windows NSSM

#### TASK 1 — Verificare angajat la creare cont utilizator
- Modal „Utilizator nou" în Setări → câmp **Angajat asociat** (select direct din lista `hr.employees`).
- Metodă B: checkbox „Verifică identitate din HR" → introduce CNP + serie + nr CI → `POST /hr/verify-employee`.
- Backend verifică `cnp + act_identitate_serie + act_identitate_numar` față de `hr.employees`.
- Angajat deja asociat unui cont activ → 409 cu mesaj explicit.
- Negăsit → mesaj amuzant 🏗️ (conform spec).
- `employee_id` și `verified_from_hr` salvate la crearea contului; `createUser()` verifică duplicatele de asociere.

#### TASK 2 — Icon aplicație macara construcții
- `client/public/favicon.svg` înlocuit cu icon macara construcții (`#1e3a5f` + `#f59e0b` + literele IF).
- `icon-192.png` și `icon-512.png` generate pentru manifest PWA.
- `client/index.html`: titlu → **InfraFlow ERP**, `lang="ro"`, `apple-touch-icon`, `theme-color="#1e3a5f"`.

#### TASK 3 — Script instalare serviciu Windows (NSSM)
- `scripts/windows/install-service.ps1`: instalare completă NSSM cu parametri `AppDir`, `DbConnection`, `Port`.
- `scripts/windows/uninstall-service.ps1`: oprire + dezinstalare serviciu.
- `server/modules/system/service.js` `scheduleRestart()`: încearcă `nssm restart InfraFlow` dacă `installer/nssm.exe` există, altfel fallback la bat existent.

#### TASK 4 — `.env.example` actualizat
- Documentate: `DB_MODE`, `INFRAFLOW_DB_CONNECTION` (Windows Auth + SQL Auth), `APP_KEY`, `SMTP`, `AI`, `GPS`.
- Exemple connection string pentru `SERVER\CIEL` și SQL Express local.

---

## v2.8.0 — 2026-05-28
### Kiosk Angajat & Foi Parcurs — activare cont, foi proprii, VERSO + semnătură, sync offline

#### TASK 1 — Activare cont Kiosk
- Ecran de activare cont în `KioskPage`: angajatul introduce CNP, serie/număr act identitate, funcția.
- Backend `POST /hr/kiosk/activate`: verifică datele față de evidența HR, creează cont cu parolă scrypt.
- Rate limiting per IP: 3 eșecuri consecutive → blocat 30 minute. Mesaj generic (nu revelează ce câmp a eșuat).
- `POST /hr/kiosk/login`: autentificare cu username (CNP) + parolă, returnează Bearer token, TTL 8 ore.
- `POST /hr/kiosk/reset-request` + `/reset-confirm`: resetare parolă cu cod 6 cifre notificat la HR.
- `server/core/kiosk-sessions.js`: singleton Map pentru token-urile kiosk (separate de sesiunile aplicației).

#### TASK 2 — Foi proprii în Kiosk
- `GET /hr/kiosk/my-trips`: returnează ultimele 60 foi asociate angajatului autentificat.
- Secțiune „Foile mele" în `KioskPage`: foaie activă card + completate + închise.

#### TASK 3 — Completare VERSO + Semnătură offline
- Modal fullscreen în Kiosk: activități VERSO (adaugă/șterge rânduri), câmpuri km XII, observații, `SignatureCanvas`.
- `SignatureCanvas`: canvas cu touch/mouse events, export `toDataURL('image/png')`.
- Fallback offline: dacă sync eșuează → localStorage queue, sincronizare automată la reconectare.

#### TASK 4 — Sync VERSO → server + badge Mecanizare
- `PATCH /fleet/trip-logs/:uuid/verso-kiosk`: acceptă auth kiosk sau auth aplicație.
- Salvează semnătura PNG în `storage/foi-parcurs/${uuid}_semnatura.png`.
- Setează `status = 'completata'`, `completat_la`, `completat_de = 'kiosk'`.
- Creează notificări pentru utilizatorii cu rol `mechanization`.
- `GET /fleet/trip-logs/:uuid/semnatura`: servire securizată a imaginii semnăturii.
- `PATCH /fleet/trip-logs/:uuid/close-mecanizare`: Mecanizare confirmă → `status = 'inchisa'`.
- Tab nou „Completate" în `FoaieParcursPage` cu badge 🟡 și buton „Închide foaia".

#### TASK 5 — O singură foaie activă per vehicul
- `POST /fleet/trip-logs`: returnează 409 dacă există foaie `deschisa`/`completata` pentru același vehicul.
- `FoaieParcursPage`: 409 gestionat cu modal propriu — detalii foaie existentă, butoane „Mergi la foaia activă" / „Anulează".

#### TASK 6 — Nr. foaie manual la emitere
- Câmp opțional `nr_foaie` în modalul de creare. Placeholder calculat client-side.
- Backend: verifică unicitatea în anul curent → 409 dacă numărul există deja.
- Dacă câmpul e gol → generare automată (comportament anterior).
- `helperText` adăugat la componenta `Input`.

---

## v2.7.7 — 2026-05-27
### Bugfix: securitate SQL injection HR, MSSQL employee lookup, PermissionGuard stocuri

#### FIX 1 — SQL injection în GET /hr/employees (MSSQL)
- Înlocuit interpolarea directă `` `AND e.user_id = '${auth.user.id}'` `` cu parametru sigur `JSON_VALUE(@p, '$.userId')` în query-ul MSSQL.
- Previne injecție SQL prin câmpul `user.id` la filtrarea propriilor angajați.

#### FIX 2 — MSSQL employee lookup în /hr/leave-requests și /hr/authorizations
- În MSSQL mode, codul folosea `readDb()/ensureHrDb()` (flat-file) pentru a găsi angajatul propriu după `user_id`. Aceasta returna mereu `undefined` în MSSQL mode.
- Înlocuit cu `mssqlObject()`: `SELECT TOP 1 id FROM hr.employees WHERE user_id = JSON_VALUE(@p, '$.userId')`.
- Utilizatorii cu `hr:view_own` sau `hr:leave_own` pot acum vedea corect cererile proprii de concediu și autorizațiile.

#### FIX 3 — MSSQL employee ownership check în /hr/employees/:id/co-balance
- Același bug la verificarea că angajatul aparține utilizatorului curent → returna 403 mereu în MSSQL mode.
- Verificare ownership prin `mssqlObject()` dacă `isMssqlMode()`, altfel prin flat-file.

#### FIX 4 — PermissionGuard /stocuri permisiune greșită
- Ruta `/stocuri` folosea `gestiune:view`, dar backend-ul `StocuriPage` verifică `materials:view`.
- Corectat la `materials:view` în `App.jsx`.

#### FIX 5 — inventory role lipsea gestiune:view
- `rolePermissions.inventory` nu includea `permissionGroups.gestiune`.
- Adăugat `...permissionGroups.gestiune` pentru acces corect la `/gestiune` și `/stocuri`.

---

## v2.7.6 — 2026-05-26
### TVA configurabil, HR tabs filtrate, PermissionGuard pe module

#### FIX 1 — TVA configurabil din Setări
- Backend: 3 câmpuri noi în `updateSettings`: `cota_tva_standard` (default 19), `cota_tva_redusa` (default 9), `cota_tva_super_redusa` (default 5).
- Frontend: Setări → General — secțiune nouă „Configurare TVA" cu 3 câmpuri numerice.
- ANAF / e-Factură: cotaTVA per linie preia implicit din `settings.cota_tva_standard` când nu este specificat explicit.

#### FIX 2 — HR tabs filtrate per permisiune
- `HRPage.jsx`: array-ul static `tabs` înlocuit cu `ALL_HR_TABS` filtrat dinamic după permisiunile utilizatorului.
- Fiecare tab are o permisiune minimă necesară (ex: `hr:view`, `hr:timesheets_view`, `hr:leave_manage`).
- Dacă utilizatorul nu are nicio permisiune HR, se afișează mesaj „Nu ai acces la modulul HR" în loc de tab-uri goale cu erori.
- Tab activ inițial = primul tab accesibil (nu hardcodat „Dashboard HR").

#### FIX 3 — PermissionGuard pe acces direct URL
- Creat `client/src/components/PermissionGuard.jsx` — HOC care verifică permisiunea înainte de a randa pagina.
- Superadmin și admin au mereu acces (bypass guard).
- Aplicat la nivel de rută în `App.jsx` pe: `/productie`, `/stocuri`, `/hr`, `/controlling`, `/flota`, `/foi-parcurs`, `/fc-utilaje`, `/achizitii`, `/anaf`, `/mecanizare`, `/gestiune`, `/asternere`.
- Permisiuni noi adăugate în `server/core/permissions.js`:
  - Grup `asternere`: `asternere:view`, `asternere:rapoarte`, `asternere:manage`
  - Grup `anaf`: `anaf:view`, `anaf:manage`, `anaf:efactura`
- `roleModules()` actualizat: gestiune/depozit, asternere asfalt, ANAF / e-Factură detectate din permisiuni.

## v2.7.5 — 2026-05-26
### Sidebar, HR și documente
- Sidebar restructurat: Principal, Departamente dinamice, Servicii și Sistem; eliminate intrările separate Foi Parcurs, FC Utilaje și Flotă.
- Serviciile din meniu se filtrează după module active și permisiuni, cu acces complet pentru admin/superadmin și șefi de departament.
- HR Pontaj este vizibil doar pentru HR/Admin sau șeful de departament, cu filtrare pe departamentul propriu.
- Permisiune nouă `hr:timesheet_dept` adăugată în catalog și în rolul default Șef Departament.
- Fișa angajatului include câmpuri CI/BI/Pașaport/Permis ședere, salvate și folosite în adeverințe.
- Documentele HR printabile folosesc datele firmei din setări și primesc footer electronic InfraFlow.
- Documente: adminul poate crea, edita și dezactiva template-uri.
- Setări → Departamente are picker vizual de iconuri, iar sidebar-ul folosește iconul departamentului.
- Migrare nouă `018_hr_employee_identity_fields.sql` pentru câmpurile de act identitate în MSSQL.

## v2.7.4 — 2026-05-26
### Login Kiosk și acces rapid
- Kiosk-ul are ecran propriu de login când utilizatorul nu este autentificat, fără layout-ul principal.
- Sidebar: linkul `Kiosk Angajat` este vizibil în secțiunea principală pentru toți utilizatorii autentificați.
- Kiosk păstrează în continuare sincronizarea offline introdusă în versiunea precedentă.

## v2.7.3 — 2026-05-26
### Kiosk offline cu sincronizare locală
- Kiosk-ul păstrează ultimul utilizator și ultimele date HR în cache local, ca să poată fi deschis și fără conexiune la serverul din rețeaua firmei.
- Cererile de concediu din Kiosk se salvează offline în coadă locală și se sincronizează automat când dispozitivul revine în rețeaua locală.
- Backend: endpoint nou `POST /api/hr/kiosk/sync`, idempotent după `uuid`, pentru sincronizarea cererilor fără dubluri.
- UI Kiosk afișează status Online/Offline, numărul de operațiuni în coadă și permite sincronizare manuală.

## v2.7.2 — 2026-05-26
### Roluri dinamice și permisiuni granulare
- Backend: rolurile `superadmin` și `admin` rămân roluri de sistem nemodificabile, iar rolurile default/custom sunt stocate în `settings.customRoles`.
- Backend: `GET/POST/PUT/DELETE /api/roles` și `GET /api/roles/permissions-catalog` expun catalogul complet de permisiuni și permit creare/editare/ștergere roluri custom.
- Backend: utilizatorii pot avea rol unic sau roluri multiple (`PUT /api/users/:id/role`, `PUT /api/users/:id/roles`), cu permisiuni calculate prin union.
- Frontend: Setări → Roluri folosește rolurile din API, cu editare nume/descriere și salvare automată a permisiunilor.
- Frontend: Setări → Utilizatori permite schimbarea directă a rolului din tabel, fără listă hardcodată.
- Kiosk: linkul apare pentru orice user cu `hr:view_own` sau `hr:leave_own`, iar ruta `/kiosk` rulează independent de layout-ul principal.

## v2.7.1 — 2026-05-26
### Modul Asternere Asfalt (§67)

#### Backend — `server/modules/asternere/routes.js`
- `GET/POST /asternere/lucrari` — CRUD lucrări: denumire, contract, beneficiar, date start/sfărșit, km/mp planificați, centru de cost din Controlling.
- `PATCH/DELETE /asternere/lucrari/:id` — editare și anulare soft (status → `anulata`).
- `GET/POST /asternere/rapoarte-zilnice` — rapoarte zilnice cu sector, strat (fundație/legătură/uzură), grosime cm, suprafață mp, cantitate tone, temperatură mix, utilaje+ore, șofer finisor, observații.
- `GET /asternere/lucrari/:id/progres` — progres complet: mp plan vs realizat, tone consumate, procent finalizare, breakdown per strat, evoluție zilnică pentru grafic.
- `GET /asternere/consum-asfalt` — total tone per lucrare cu calcul automat kg/m², corelație automată cu `db.production.consumptions`.
- `GET /asternere/dashboard` — KPI lună curentă: lucrări active, mp realizați, tone puse în operă, progres mediu.
- Stocare în `db.asternere.{lucrari, rapoarte}` — fără migrări necesare.
- Înregistrat în `server/app.js` după modulul gestiune.

#### Frontend — `client/src/pages/modules/AsternерePage.jsx`
- Tab **Dashboard**: 4 KPI carduri + tabel lucrări active cu progress bar colorat (verde/portocaliu/albastru după procent).
- Tab **Lucrări**: tabel CRUD + modal creare/editare cu select centru de cost din Controlling.
- Tab **Rapoarte zilnice**: filtre lucrare+lună, tabel complet, modal cu multi-select utilaje din flota de active (cu câmp ore per utilaj).
- Tab **Progres lucrări**: progress bar mare, breakdown per strat, LineChart Recharts evoluție mp pe zile, tabel rapoarte, print HTML.
- Tab **Consum asfalt**: total tone per lucrare cu kg/m², detaliu zilnic, corelație cu producțiile din modulul Producție.
- Înregistrat în `App.jsx` (rută `/asternere/*`) și în `Sidebar.jsx` (secțiunea SERVICII, după Mecanizare, `moduleKey: 'asternere'`).

## v2.7.0 — 2026-05-26
### Gestiune Depozit, HR Adeverințe extinse, Producție Asfalt, Foi Parcurs PWA

#### Gestiune / Depozit
- Modul Gestiune complet: Nomenclator materiale, NIR (recepție cu confirmare/anulare + actualizare stoc), Bon Consum (aprobare/respingere cu scădere stoc), Inventar (finalizare cu aplicare diferențe), Furnizori CRUD.
- Raport Valoric: sold inițial, intrări, ieșiri, sold final per material cu print HTML.
- Numere automate de document: `NIR-2026-0001`, `BC-2026-0001`, `INV-2026-0001`.
- Trasabilitate completă prin `stockMovements` cu sursă, document referință, user și timestamp.
- Fix critic: modulele `gestiune`, `mechanization` și `anaf` nu erau înregistrate în `server/app.js` — adăugate.

#### HR — Adeverințe extinse (§77 HG 905/2017)
- 10 tipuri noi de documente printabile conform dosarului personal de angajat:
  - **La angajare**: Cerere de angajare, Fișa postului model cadru, Declarație deduceri personale, Declarație funcție de bază, Notă informare GDPR.
  - **Pe durata contractului**: Act adițional CIM, Cerere concediu de odihnă, Cerere concediu fără plată, Cerere concediu familial.
  - **La încetare**: Notificare preaviz concediere, Decizie concediere, Notă de lichidare.
- Tab **Documente HR** restructurat complet: afișare per angajat cu 4 categorii grupate (angajare, adeverințe, contract, încetare).
- Toate documentele folosesc datele reale din fișa angajatului (CNP, funcție, salariu, vechime, date companie).

#### Producție Asfalt
- **Raport Zilnic**: agregare lunară a producțiilor — tone totale, zile active, nr. producții, rețete utilizate, consum materii prime per zi.
- **Print raport zilnic**: document HTML printabil cu antet companie, tabel detaliat pe zile și totaluri.
- **Legare Gestiune**: buton per consum pentru a decrementa automat stocul din Gestiune Depozit; verificare disponibilitate înainte de scădere; badge verde „Legat ✓" după sincronizare.
- Nou endpoint `GET /api/production/raport-zilnic` cu agregare lunară sau detaliu per zi.
- Nou endpoint `POST /api/production/consumptions/link-gestiune/:id` cu tranzacție atomică pe stoc.

#### Foi Parcurs PWA (Șofer mobil)
- Aplicație PWA standalone pentru șoferi accesibilă la `/sofer` — fără Layout principal.
- **Service Worker** (`/sofer-sw.js`): cache-first pentru resurse statice, network-first pentru navigare, skip complet pentru `/api/*`; Background Sync trimite mesaj `SYNC_REQUESTED` clienților.
- **Manifest PWA** (`/sofer-manifest.json`): `start_url=/sofer`, `display=standalone`, `theme_color=#1e3a5f`, orientare portret.
- **Funcționare offline completă**: coadă localStorage (`infraflow_sofer_offline_queue`) pentru trip-uri noi și închideri; auto-sync la revenirea conexiunii și la evenimentul Background Sync.
- **Semnătură digitală**: canvas touch-enabled cu mouse și touch events, exportat ca base64 DataURL.
- **Mașină de stări**: login → home → newTrip / closeTrip / history cu tranziții fluide.
- **Prompt instalare**: buton „Instalează aplicația" când browserul oferă `beforeinstallprompt`.
- Rută `/sofer` adăugată în `App.jsx` fără wrapper Layout (pagină complet autonomă).

## v2.6.5 — 2026-05-26
### Controlling automat
- Controlling: CRUD complet pentru centre și subcentre de cost, cu dezactivare soft și blocare când există subcentre active.
- Controlling: asociere utilaje/vehicule la centre de cost și afișare obiecte asociate în arbore.
- Controlling: raport automat din Mecanizare cu carburant, reparații, ore, cost/oră și consum peste normă.
- Mecanizare: bonurile de lucru, alimentările și intervențiile pot primi centru de cost explicit.
- DB: migrare `017_controlling_automat_mecanizare.sql` pentru câmpuri de alocare centru cost.

## v2.6.4 — 2026-05-26
### Mecanizare
- Mecanizare: FAZ lunar automat din bonuri de lucru, alimentări și intervenții, cu preview, export și print HTML.
- Mecanizare: dashboard extins cu cost lunar, litri alimentați, top cost/oră, consum peste normă și intervenții deschise.

## v2.6.3 — 2026-05-26
### Mecanizare & UX
- Mecanizare: alimentări carburant detaliate cu litri, preț, valoare, furnizor, document și km/ore.
- Mecanizare: revizii predictive după dată/contor și alerte ISCIR/service/ITP.
- Mecanizare: reparații cu costuri detaliate și calcul automat cost/oră pe utilaj.
- Setări: permisiunile departamentelor sunt pliate implicit și afișate compact pe grupuri.
- UI: modalele au înălțime maximă și scroll intern, ca să nu mai iasă din ecran.

## v2.6.2 — 2026-05-26
### HR Avansat v4
- Tab nou **Ture & Program**: ture definite, creare tură și grafic lunar per angajat/departament.
- Tab nou **Tichete masă**: valoare tichet configurabilă, calcul lunar automat și export CSV furnizor.
- **Pontaj Avansat**: bancă de ore cu sold, istoric și compensare prin timp liber sau plată.
- **Documente HR**: adeverințe noi pentru vechime, casă de sănătate, concediu medical și funcție.
- **Fișa angajatului**: câmpuri suplimentare pentru date personale, angajare, financiare, documente/expirări și GDPR.
- Migrare nouă `016_hr_ture_tichete_banca_ore.sql` pentru MSSQL.

## v2.5.5 — 2026-05-25
- Dashboard departament: afișează permisiunile reale din departamentul selectat și lista permisiunilor active.
- Update manual: restartul după aplicarea ZIP-ului pornește aplicația printr-un proces detached fără `Stop-Process`.
- Adăugat `scripts/windows/start-infraflow.ps1` și inclus în pachetul de update.
- Pornire Windows: batch-ul cere elevare ca Administrator și setează `PORT` + `INFRAFLOW_PORT`.

## v2.5.4 — 2026-05-25
- Setări: tab Departamente afișează permisiunile pe grupuri și permite activare/dezactivare per departament.
- GPS: revenire la autentificare automată cu utilizator și parolă urmariregps.ro, cu sesiune PHPSESSID păstrată doar în memorie.
- Setări GPS: eliminate câmpurile PHPSESSID și Grup vehicule din UI și din salvare.
- Sidebar: secțiunea Departamente se încarcă din DB și deschide dashboardul departamentului.

## v2.5.3 — 2026-05-25
- Fix pornire după update pe instalările existente: `server/app.js` pornește compatibil prin `server/src/server.js` când este rulat direct de serviciul vechi.
- Versiunea afișată de server se citește din `server/package.json`.

## v2.5.2 — 2026-05-25
- Setări: tab nou Departamente cu creare, editare și ștergere departamente din UI.
- Departamentele se încarcă din API și apar în dropdown-ul de utilizatori.
- Backend departamente păstrează tip, icon și culoare la creare/editare.
- Licență: mesaj clar când lipsește `infraflow-public.pem`, fără eroare mascată ca format invalid.
- Server: pornire standardizată prin `server/src/server.js`; `server/app.js` exportă doar aplicația Express.

## v2.5.1 — 2026-05-23
- Fix import angajați Autominder folosind tabelul și câmpurile reale
- Fix import foi de parcurs din toate cele 3 tabele: FoaieDeParcurs, TM_FoiDeParcurs, TP_FoiDeParcurs
- Preview Autominder actualizat cu angajați activi și total foi de parcurs
- Connection string Autominder salvat persistent
- Prepopulat automat la fiecare deschidere

## v2.5.0 — 2026-05-23
- Import complet din Autominder (nomenclatoare, parc auto, utilaje și angajați)
- Documente expirabile importate: ITP, RCA, CASCO, roviniete, ISCIR
- FAZ-uri istorice importate din 2022 în FC Utilaje
- Foi de parcurs istorice închise importate din TM_FoiDeParcurs
- Flotă: tab Import Autominder cu test conexiune, preview și import total

## v2.4.0 — 2026-05-23
- FC Utilaje — Fișă Consum digitală
- Formular cu OP/LE/AT/IZ/RP/SE/Defect (Ordinul 14/1982)
- Calcul automat consum normat vs real cu semaforizare
- 44 activități reale PUBLISERV din nomenclator
- FAZ lunar per utilaj cu totaluri
- Export Excel + PDF raport activitate

## v2.0.9 — 2026-05-23
- Update manual din UI — upload .zip și aplicare automată
- Preview changelog înainte de aplicare
- Backup automat înainte de orice update
- Script build generează și InfraFlow-update-vX.X.X.zip
- Istoric update-uri în Setări

## v2.3.0 — 2026-05-23
- Integrare Intersoft completă
- Import devize F3
- Export cantități realizate din teren
- Import situații de plată → circuit aprobare automat
- Dashboard progres per proiect
- Foaie de Parcurs digitală pentru autovehicule
- Generare automată număr foaie (FP-2026-XXXXXX)
- Km la plecare preluat automat din ultima foaie
- Închidere foaie cu un click (introduci doar km sosire)
- Calcul automat km parcurși + consum normat vs real
- FAZ lunar din foile închise
- PDF foaie de parcurs printabil
- Import istoric din Autominder (TM_FoiDeParcurs)

## v2.0.8 — 2026-05-23
- GPS Live cu hartă Leaflet nativă în Flotă
- Integrare urmariregps.ro pentru vehicule PUBLISERV
- Iconițe 🟢🟡🔴 per status motor + viteză
- Panou stânga cu lista vehicule + căutare
- Click pe vehicul → centrează harta
- Auto-refresh 30 secunde cu countdown
- Configurare PHPSESSID din Setări → GPS

## v2.0.7 — 2026-05-23
- Flotă: tab separat Autovehicule vs Utilaje
- Căutare live după nr. înmatriculare / cod / marcă / model
- Filtre rămân în container (nu mai ies din pagină)
- Toggle vedere Listă / Carduri
- Counter "X din Y"

## v2.2.0 — 2026-05-22
### HR complet
- Creare angajați cu validare CNP
- Import angajați din Excel/CSV cu template
- Pontaj per departament cu marcare finalizat
- Overview pontaje pentru HR
- Dată limită + reminder automat pontaj
- Mișcări angajați între departamente cu istoric

### Comunicare
- Email din aplicație (SMTP configurabil)
- Notificări email din secretariat, HR, documente
- Secretariat: 4 tipuri înregistrare (intrări/ieșiri interne/externe)
- Numerotare automată per tip și an

### UX
- Secțiune Ajutor completă per modul
- Ghid pas cu pas pentru fiecare funcționalitate

## v2.1.0 — 2026-05-22
### Funcționalități majore
- Stocuri per departament cu transfer din central
- Comandă achiziții → recepție → stoc actualizat automat
- Creare material nou direct din Achiziții
- Comenzi de lucru: Tehnic → Departamente → raport lunar
- Plan achiziții anual pe coduri CPV cu export Excel
- Intersoft integrat în pagina Tehnic

## v2.0.6 — 2026-05-22
### Fix-uri
- Filtre utilaje nu mai ies din pagină
- ANAF lookup funcțional (fix https not defined)
- Culoarea principală se salvează și se aplică imediat în UI
- Canale implicite pentru Mesaje create automat la pornire
- Registratură cu dropdown-uri pentru departament și utilizator
- Rol HR și rol Gestiune completate cu permisiuni operaționale
- Atașamente la sesizări și comentarii
- Setări GPS și test conexiune
- Deszăpezire permite configurarea sezonului când modulul este activ

## v2.0.5 — 2026-05-22
- Creare utilizatori noi din Setări
- Editare utilizatori existenți (rol, departament, activ)
- Resetare parolă per utilizator
- Tab Module în Setări — activare/dezactivare module
- Sidebar dinamic — arată doar modulele active
- Admin poate activa/dezactiva Deszăpezire sezonier

## v2.0.4 — 2026-05-22
- Import parc auto din Autominder XML (parc_auto.xml)
- Import utilaje din Autominder XML (lista_utilaje.xml)
- Fără conexiune directă la baza Autominder necesară
- Actualizare automată dacă vehiculul există deja

## v2.0.3 — 2026-05-22
- Setări complete (General, Licență, Aspect, AI, Update, Utilizatori, Cântar)
- Fix cântar în Achiziții

## v2.0.2 — 2026-05-22
- Pagina Teren completă
- Pagina Salubrizare completă
- Pagina Siguranța Circulației completă
- Pagina Mediu completă
- Pagina Juridic completă
- Pagina Arhivă completă
- Pagina Secretariat completă
- Pagina AI Assistant completă
