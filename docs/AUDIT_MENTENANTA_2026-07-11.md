# Audit mentenanță InfraFlow — 2026-07-11

Versiune analizată: `2.12.303`
Următorul pas de stabilizare: `2.12.300`

## Rezultat verificări

- Backend JS syntax check: OK.
- Teste HR: OK.
- Teste Contabilitate: OK.
- Release acceptance în `DB_MODE=json`: OK.
- Backup roundtrip: OK.
- Build frontend: OK.
- Smoke API local cu superadmin, doar citire: OK pentru HR, dosar HR, salarizare, contabilitate, CPV, PAAP, referate și GPS live.
- Build frontend după extinderea helperelor contextuale: OK.

## Observații importante

1. Aplicația este funcțională și buildabilă.
2. Datoria tehnică principală este concentrarea logicii în fișiere foarte mari.
3. Lint-ul frontend nu este încă poartă de release; există erori istorice de hooks, variabile nefolosite și reguli de mediu.
4. `npm audit` semnalează dependențe cu risc:
   - `xlsx` fără fix disponibil în audit;
   - `nodemailer` și `form-data` cu fix disponibil prin actualizare controlată.
5. Pentru producție, `APP_KEY` trebuie setat explicit în mediu; cheia implicită trebuie tratată doar ca fallback de dezvoltare.

## Fișiere candidate pentru split

| Zonă | Fișier | Prioritate |
| --- | --- | --- |
| Sistem | `server/modules/system/routes.js` | P0 |
| Fleet | `server/modules/fleet/routes.js` | P0 |
| Achiziții | `server/modules/procurement/routes.js` | P0 |
| Gestiune | `server/modules/inventory/routes.js` | P1 |
| Tehnic | `server/modules/technical/routes.js` | P1 |
| Producție | `server/modules/production/routes.js` | P1 |
| Workflow | `server/modules/workflow/routes.js` | P1 |
| HR frontend | `client/src/pages/modules/HRPage.jsx` | P0 |

## Plan recomandat

### UPDATE 271 — Adevăr proiect + audit local

- sincronizare versiuni și documentație;
- script unic `npm run audit:local`;
- mod advisory pentru lint și audit securitate;
- documentarea datoriei tehnice.

### UPDATE 272 — Split rute update sistem

- `system/update-routes.js` — ✅ început în `2.12.252`;

### UPDATE 273 — Split rute backup sistem

- `system/backup-routes.js` — ✅ extras în `2.12.253`;
- rute păstrate compatibil: `/api/system/backups`, `/api/backup`, `/api/restore`;
- handlerul legacy `/api` a rămas neatins pentru risc minim.

### UPDATE 274 — Split rute utilizatori si roluri

- `system/users-routes.js` — ✅ extras în `2.12.254`;
- rute păstrate compatibil: `/api/users`, `/api/roles`, `/api/roles/permissions-catalog`;
- helperii de creare/editare utilizatori rămân în `routes.js` pentru handlerul legacy `/api`.

### UPDATE 275 — Split rute setari sistem

- `system/settings-routes.js` — ✅ extras în `2.12.255`;
- rute păstrate compatibil: `/api/settings`, `/api/settings/modules`, `/api/settings/email/test`, `/api/admin/branding`, `/api/integration/gps/test`, `/api/devices`;
- configurarea MSSQL și licența rămân în `routes.js` pentru pași separați.

### UPDATE 276 — Split rute licenta sistem

- `system/license-routes.js` — ✅ extras în `2.12.256`;
- rute păstrate compatibil: `/api/license/status`, `/api/license/import`;
- ruta legacy `/api/license/import` rămâne în `routes.js`.

### UPDATE 277 — Continuare split backend sistem

- `system/departments-routes.js` — ✅ extras în `2.12.257`;
- rute păstrate compatibil: `/api/departments`;
- handlerul legacy `/api/departments` rămâne în `routes.js`.

### UPDATE 278 — Continuare split backend sistem

- `system/database-routes.js` — ✅ extras în `2.12.258`;
- rute păstrate compatibil: `/api/system/database-config`, `/api/system/database-schema`;
- helper-ele de configurare și handlerul legacy rămân în `routes.js`.

### UPDATE 279 — Split navigatie HR frontend

- `client/src/pages/modules/hr/HRNavigationTabs.jsx` — ✅ extras în `2.12.259`;
- lista taburilor și permisiunile aferente sunt centralizate lângă componentă;
- comportament HTTP și UX identic.

### UPDATE 280 — Split header si filtre HR frontend

- `client/src/pages/modules/hr/HRPageChrome.jsx` — ✅ extras în `2.12.260`;
- header-ul/acțiunile și filtrele generale HR sunt mutate în componente mici;
- comportament HTTP și UX identic.

### UPDATE 281 — Split dashboard HR frontend

- `client/src/pages/modules/hr/HRDashboardPanel.jsx` — ✅ extras în `2.12.261`;
- KPI-urile, raportul de management, cererile în așteptare, scadențele și istoricul notificărilor sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 282 — Split inbox HR frontend

- `client/src/pages/modules/hr/HRInboxPanel.jsx` — ✅ extras în `2.12.262`;
- Inbox HR, sarcinile ghidate și jurnalul operațional HR sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 283 — Split lista angajati HR frontend

- `client/src/pages/modules/hr/HREmployeesPanel.jsx` — ✅ extras în `2.12.263`;
- lista angajaților, exporturile Excel/PDF, badge-ul de sursă și alertele vizuale sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 284 — Split pontaj HR frontend

- `client/src/pages/modules/hr/HRTimesheetPanel.jsx` — ✅ extras în `2.12.264`;
- tabelul de pontaj, exportul Excel, exportul Nexus și acțiunile de validare sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 285 — Split pontaj avansat HR frontend

- `client/src/pages/modules/hr/HRAdvancedTimesheetPanel.jsx` — ✅ extras în `2.12.265`;
- închiderea lunii, aprobările de ore suplimentare, controlul săptămânal, raportul lunar și banca de ore sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 286 — Split ture si program HR frontend

- `client/src/pages/modules/hr/HRShiftsSchedulePanel.jsx` — ✅ extras în `2.12.266`;
- lista de ture, filtrele lună/departament și matricea zilnică de programare sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 287 — Split modal tura HR frontend

- `client/src/pages/modules/hr/HRShiftModal.jsx` — ✅ extras în `2.12.267`;
- formularul `Tură nouă / Editează tura` este mutat în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 288 — Split tichete masa HR frontend

- `client/src/pages/modules/hr/HRMealTicketsPanel.jsx` — ✅ extras în `2.12.268`;
- configurația tichetului, filtrele lună/departament, exportul CSV și tabelul de totaluri sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 289 — Split training si evaluari HR frontend

- `client/src/pages/modules/hr/HRTrainingPanel.jsx` — ✅ extras în `2.12.269`;
- scadențarul cursurilor obligatorii și lista de evaluări sunt mutate în componentă dedicată;
- comportament HTTP și UX identic.

### UPDATE 290 — Documente Word-first

- `client/src/pages/modules/DocumentePage.jsx` — ✅ actualizat în `2.12.270`;
- modelul Word `.docx` este prezentat ca flux principal pentru utilizatori;
- variabilele uzuale pot fi copiate pentru lipire în Word;
- editorul vizual/HTML este mutat în zona avansată de compatibilitate/preview.

### UPDATE 291 — Smoke suite module

- `scripts/smoke-modules-readonly.js` — ✅ adăugat în `2.12.271`;
- login local read-only pe bază JSON temporară;
- verificare 48 endpointuri critice pe module;
- raport clar pentru release;
- integrat în `npm run audit:local`.

### UPDATE 292 — Split echipamente HR frontend

- `client/src/pages/modules/hr/HREquipmentPanel.jsx` — ✅ extras în `2.12.272`;
- necesarul pe departament, expirările, comanda furnizor și catalogul sunt mutate în componentă dedicată;
- comportament HTTP și UX identic;
- reduce riscul la intervențiile viitoare pe HR.

### UPDATE 293 — Split echipamente din fișa angajat HR

- `client/src/pages/modules/hr/HREmployeeEquipmentSection.jsx` — ✅ extras în `2.12.273`;
- secțiunea inventar, mărimi și predare este mutată într-o componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 294 — Split modaluri echipamente HR

- `client/src/pages/modules/hr/HREquipmentCatalogModal.jsx` — ✅ extras în `2.12.274`;
- `client/src/pages/modules/hr/HREquipmentDotareModal.jsx` — ✅ extras în `2.12.274`;
- modalul de catalog și modalul de dotare sunt mutate în componente dedicate;
- comportament HTTP și UX identic;
- pregătește `HRPage.jsx` pentru separarea completă a fișei angajatului.

### UPDATE 295 — Split profil angajat HR

- `client/src/pages/modules/hr/HREmployeeProfileChrome.jsx` — ✅ extras în `2.12.275`;
- antetul profilului, cardurile de status, activitatea recentă și taburile profilului sunt mutate în componente dedicate;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX;
- pregătește extragerea taburilor interne ale fișei angajatului.

### UPDATE 296 — Split date personale fișă angajat HR

- `client/src/pages/modules/hr/HREmployeePersonalTab.jsx` — ✅ extras în `2.12.276`;
- formularul de editare și sumarul read-only pentru tabul `Date personale` sunt mutate în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX;
- reduce blocul modalului de fișă angajat și pregătește split pe celelalte taburi interne.

### UPDATE 297 — Split pontaj și concedii fișă angajat HR

- `client/src/pages/modules/hr/HREmployeeAttendanceTab.jsx` — ✅ extras în `2.12.277`;
- KPI-urile de pontaj, soldul CO și istoricul concediilor sunt mutate în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX;
- reduce în continuare blocul modalului de fișă angajat.

### UPDATE 298 — Split scadențe și Kiosk fișă angajat HR

- `client/src/pages/modules/hr/HREmployeeKioskTab.jsx` — ✅ extras în `2.12.278`;
- sumarul Kiosk, reminderul, lipsurile obligatorii și lista de scadențe sunt mutate în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX;
- reduce în continuare blocul modalului de fișă angajat.

### UPDATE 299 — Split flux onboarding/offboarding fișă angajat HR

- `client/src/pages/modules/hr/HREmployeeWorkflowTab.jsx` — ✅ extras în `2.12.279`;
- sumarul fluxului, progresul, lista de pași, acțiunile ghidate și acțiunile de finalizare/anulare sunt mutate în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX;
- reduce în continuare blocul modalului de fișă angajat.

### UPDATE 300 — Split contracte și transferuri fișă angajat HR

- `client/src/pages/modules/hr/HREmployeeContractsTab.jsx` — ✅ extras în `2.12.280`;
- panoul contractelor, actele adiționale și istoricul departamentelor sunt mutate în componentă dedicată;
- păstrare apeluri contracte/acte/Word și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX;
- reduce blocul modalului de fișă angajat și lasă `HRPage.jsx` mai aproape de rolul de orchestrator.

### UPDATE 301 — Split dosar angajat HR

- `client/src/pages/modules/hr/HREmployeeFilesTab.jsx` — ✅ extras în `2.12.281`;
- lista documentelor, upload-ul, previzualizarea, descărcarea, editarea metadata și anularea sunt mutate în componentă dedicată;
- integrarea cu Inbox HR și refresh-ul pentru documentele generate electronic rămân identice;
- păstrare endpointuri și comportament Kiosk/confirmări, fără schimbare HTTP/UX.

### UPDATE 302 — Split modal angajat HR

- `client/src/pages/modules/hr/HREmployeeModal.jsx` — ✅ extras în `2.12.282`;
- formularul de identitate, date personale, date serviciu, date financiare, scadențe și GDPR este mutat în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX;
- reduce blocul de modaluri operaționale din `HRPage.jsx`.

### UPDATE 303 — Split modaluri concedii și salarizare medicală HR

- `client/src/pages/modules/hr/HRLeaveRequestModal.jsx` — ✅ extras în `2.12.283`;
- `client/src/pages/modules/hr/HRMedicalPayrollModal.jsx` — ✅ extras în `2.12.283`;
- formularul de cerere concediu și confirmarea bazei de calcul pentru CM sunt mutate în componente dedicate;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 304 — Split modal compensare bancă de ore HR

- `client/src/pages/modules/hr/HROvertimeCompensationModal.jsx` — ✅ extras în `2.12.284`;
- formularul pentru timp liber, plată, sold inițial și avans timp liber este mutat în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 305 — Split modal evaluări HR

- `client/src/pages/modules/hr/HREvaluationModal.jsx` — ✅ extras în `2.12.285`;
- formularul pentru angajat, data evaluării, tip, calificativ, punctaj, observații, obiective și recomandări este mutat în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 306 — Split modal import angajați HR

- `client/src/pages/modules/hr/HRImportEmployeesModal.jsx` — ✅ extras în `2.12.286`;
- formularul pentru descărcare template, selectare fișier CSV/Excel și sumar rezultat import este mutat în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 307 — Split modal export pontaj Nexus HR

- `client/src/pages/modules/hr/HRNexusExportModal.jsx` — ✅ extras în `2.12.287`;
- formularul pentru lună, departament și acțiunea de export este mutat în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 308 — Split modal editare zi pontaj HR

- `client/src/pages/modules/hr/HRTimesheetEditModal.jsx` — ✅ extras în `2.12.288`;
- formularul pentru data pontajului, tip zi, ore lucrate și observații este mutat în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 309 — Split modal editare șablon document HR

- `client/src/pages/modules/hr/HRDocumentTemplateModal.jsx` — ✅ extras în `2.12.289`;
- formularul pentru metadate, atașament Word, variabile, editor vizual și HTML avansat este mutat în componentă dedicată;
- păstrare state, refs și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 310 — Split modal testare șablon Word HR

- `client/src/pages/modules/hr/HRDocumentTemplateTestModal.jsx` — ✅ extras în `2.12.290`;
- formularul pentru test angajat/contract/act adițional și sumarul validării Word este mutat în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 311 — Split carcasă modal fișă angajat HR

- `client/src/pages/modules/hr/HREmployeeProfileModal.jsx` — ✅ extras în `2.12.291`;
- carcasa modalului, headerul, cardurile de status, activitatea și switch-ul de taburi sunt mutate în componentă dedicată;
- păstrare conținut taburi, state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 312 — Split router taburi fișă angajat HR

- `client/src/pages/modules/hr/HREmployeeProfileTabsRouter.jsx` — ✅ extras în `2.12.292`;
- rutarea taburilor `date/contracte/pontaj/dosar/kiosk/flux/echipamente` este mutată în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 313 — Split zona Documente HR frontend

- `client/src/pages/modules/hr/HRDocumentsPanel.jsx` — ✅ extras în `2.12.293`;
- card raport dosar, dashboard conformitate, listă șabloane, acțiuni Word, checklist și documente rapide au fost mutate în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.

### UPDATE 314 — Productizare comercială modulară

- `docs/PRODUCTIZARE_COMERCIALA.md` — ✅ adăugat în `2.12.294`;
- direcția produsului a fost schimbată spre ERP modular general, fără client pilot activ;
- fallback-urile și textele vizibile din HR, demo, controlling, mediu, foi parcurs și importer legacy au fost neutralizate;
- datele istorice reale rămân doar ca backup/migrare/referință, nu ca identitate de produs.

### UPDATE 315 — Catalog module active și onboarding organizație

- `GET /settings/modules/catalog` — ✅ adăugat în `2.12.295`;
- `Setări > Module` are onboarding organizație, pachete comerciale, checklist și următorul pas recomandat;
- smoke-ul local verifică endpointul nou;
- bază pentru licențiere modulară fără a bloca încă modulele existente.

### UPDATE 316 — Split funcții print documente HR

- `client/src/pages/modules/hr/hrDocumentPrint.js` — ✅ extras în `2.12.296`;
- funcțiile mari de print/generare HTML din `HRPage.jsx` au fost mutate într-un helper dedicat;
- păstrare payload-uri, template-uri și ferestre de print fără schimbare HTTP/UX.

### UPDATE 317 — Helper contextual reutilizabil în UI

- `client/src/components/ui/ContextHelp.jsx` — ✅ adăugat în `2.12.297`;
- componentă comună pentru ajutor contextual, tips și „următorul pas” în paginile complexe;
- integrare inițială în `Setări > Module`, HR și Documente;
- scop: interfață mai comercială și mai ușor de înțeles fără documentație separată.

### UPDATE 318 — Extindere ghidaj contextual pe module operaționale

- integrare `ContextHelp` în Contabilitate, Achiziții/Referate și Mecanizare — ✅ realizat în `2.12.298`;
- fiecare modul primește pași operaționali minimi, tips și următorul pas recomandat;
- scop: aceeași experiență ghidată în zonele unde utilizatorii pot rămâne blocați.

### UPDATE 319 — Direcție internațională și verticale comerciale

- `docs/PRODUCTIZARE_COMERCIALA.md` — ✅ actualizat în `2.12.299`;
- `AGENTS.md` — ✅ actualizat cu direcția multi-country și module comerciale noi;
- pregătire conceptuală pentru limbă, țară, monedă, reguli legislative și template-uri pe jurisdicție;
- roadmap extins cu Warehouse/WMS, Logistics și Ecarisaj/Public Health Services.

### UPDATE 320 — Profil internațional organizație

- `server/modules/system/settings-routes.js` — ✅ endpoint read-only pentru profiluri de țară;
- `server/modules/system/routes.js` și `server/core/db.js` — ✅ normalizare țară, limbă/locale, monedă, fus orar și profil juridic;
- `client/src/pages/SetariPage.jsx` — ✅ panou `Profil internațional` în setările generale;
- `db/migrations/065_country_profile_settings.sql` — ✅ coloane MSSQL pentru profilul internațional;
- `scripts/smoke-modules-readonly.js` — ✅ verifică endpointul nou.

### UPDATE 321 — Registry reguli pe țară

- `server/shared/countryRules.js` — ✅ registry central pentru profiluri și reguli HR/fiscale/documente;
- `server/modules/system/settings-routes.js` — ✅ endpoint read-only `/settings/country-rules`;
- `client/src/pages/SetariPage.jsx` — ✅ sumar reguli active în profilul internațional;
- `scripts/smoke-modules-readonly.js` — ✅ verifică endpointul nou.

### UPDATE 322 — Defaulturi fiscale din registry țară

- `server/shared/countryRules.js` — ✅ helperi pentru TVA, cote, declarații fiscale și profil HR;
- `server/modules/system/routes.js` — ✅ TVA implicit din profilul țării la salvarea setărilor;
- `server/core/db.js` — ✅ fallback DB JSON pentru TVA din registry;
- `server/modules/anaf/routes.js` — ✅ fallback TVA ANAF din registry, cu același rezultat pentru RO.

### UPDATE 323 — Declarații fiscale lunare din registry țară

- `server/shared/countryRules.js` — ✅ helper `getMonthlyFiscalDeclarations()` și normalizare alias SAF-T;
- `server/modules/accounting/fiscal-register.js` — ✅ registru declarații din profilul țării;
- `server/modules/accounting/fiscal-extras.js` — ✅ hartă completare fiscală din profilul țării;
- `server/modules/accounting/declaration-routes.js` — ✅ transmite țara curentă către registru.

### UPDATE 324 — Centre cost generice și legături Controlling

- `db/migrations/066_controlling_generic_cost_centers.sql` — ✅ dezactivează centrele cost istorice Publiserv și mapările automate pe utilaje;
- `db/seeds/cost_centers_publiserv.sql` — ✅ scos din pachet;
- `server/modules/controlling/routes.js` — ✅ CRUD MSSQL pentru centre cost și asociere obiect;
- `client/src/pages/modules/ControllingPage.jsx` — ✅ asociere centru cu departament, utilaj/vehicul sau proiect/lucrare;
- produsul nu mai rehidratează date client-pilot în Controlling.

### UPDATE 325 — Demo comercial generic

- `data/demo-seed.json` și `data/app-db.demo.json` — ✅ identitate demo generică `Construct Demo SRL`;
- `scripts/seed-demo.js` — ✅ emailuri demo pe `infraflow-demo.ro`;
- `scripts/smoke-demo.js` — ✅ validare companie demo generică;
- `db/migrations/015_mediu.sql` — ✅ seed-ul Mediu nu mai include nume de client pilot.

### UPDATE 326 — Restart robust după update

- `server/modules/system/service.js` — ✅ fallback-ul post-update preferă `start-server.bat`, păstrând configurația MSSQL instalată;
- `server/modules/system/service.js` — ✅ jurnalizare `runtime/restart-last.log` și verificare `/api/health` după pornire;
- `server/modules/system/update-routes.js` — ✅ fereastră de restart raportată realist: `restart_in: 12`;
- validare dry-run pentru helperul PowerShell generat.

### UPDATE 327 — Health rapid MSSQL

- `server/core/db.js` — ✅ `databaseHealth()` nu mai rulează implicit interogări MSSQL sincron;
- `server/core/db.js` — ✅ diagnosticul complet rămâne disponibil cu `quick: false`;
- `client/src/pages/SetariPage.jsx` — ✅ status distinct pentru „Server activ — SQL neverificat rapid”;
- reduce riscul ca un health check sau o încărcare Setări să blocheze clientul desktop în ecranul de conexiune.

### UPDATE 328 — Setări rapide fără verificare schemă automată

- `client/src/pages/SetariPage.jsx` — ✅ nu mai cere automat `/system/database-schema` la încărcarea paginii;
- diagnosticul complet SQL rămâne manual prin „Verifică schema”;
- panoul explică explicit de ce schema nu este verificată automat;
- reduce încărcarea inițială a Setărilor pe instalări MSSQL lente.

### UPDATE 329 — PIUSI status rapid în Setări

- `server/modules/integration/piusi.js` — ✅ status PIUSI fără verificare implicită a MDB-ului;
- `server/modules/integration/piusi.js` — ✅ verificarea reală a MDB-ului se face explicit cu `?check=1`;
- `client/src/pages/SetariPage.jsx` — ✅ mapările PIUSI nu mai sunt încărcate automat la deschiderea Setărilor;
- panoul PIUSI explică verificarea rapidă vs verificarea reală.

### UPDATE 330 — Scheduler PIUSI cu backoff și log rar

- `server/modules/integration/piusi.js` — ✅ stare internă scheduler: ultima rulare, ultimul succes, ultima eroare și următoarea reîncercare;
- `server/modules/integration/piusi.js` — ✅ backoff progresiv pentru erori PIUSI, până la 6 ore;
- `server/modules/integration/piusi.js` — ✅ lipsa MDB-ului este jurnalizată rar, fără spam la fiecare interval;
- `server/modules/integration/piusi.js` — ✅ sync-ul automat persistă explicit rezultatele și timestampul `piusi_last_sync`;
- `client/src/pages/SetariPage.jsx` — ✅ Setările afișează starea scheduler-ului PIUSI.

### UPDATE 331 — Release check pentru pachete update

- `scripts/release-check.js` — ✅ verifică versiuni sincronizate, documentație release și nota UPDATE curentă;
- `scripts/release-check.js` — ✅ validează arhiva ZIP generată și normalizează separatorii Windows/Linux din intrările ZIP;
- `package.json` — ✅ script nou `npm run release:check`;
- flux recomandat: `npm run release:check -- --no-zip` înainte de pachetare și `npm run release:check` după generarea ZIP-ului.

### UPDATE 332 — Release check integrat în pachetarea ZIP

- `scripts/windows/build-update-zip.ps1` — ✅ rulează automat release check înainte de arhivare;
- `scripts/windows/build-update-zip.ps1` — ✅ validează automat ZIP-ul final după `Compress-Archive`;
- `scripts/windows/build-update-zip.ps1` — ✅ opțiune `-SkipReleaseCheck` pentru diagnostic manual;
- pachetarea update-urilor devine self-validating, nu mai depinde de rularea manuală a verificării.

### UPDATE 333 — Status update și restart în UI

- `server/modules/system/update-routes.js` — ✅ endpoint `/system/update/status` pentru versiune runtime, ultim update și log restart;
- `client/src/pages/SetariPage.jsx` — ✅ panou „Status update / restart” în tabul Actualizări;
- `client/src/pages/SetariPage.jsx` — ✅ buton „Verifică server după update”;
- `AGENTS.md` — ✅ roadmap extins cu modul Contract Management: valoare, facturi, CPV, manageri contract și alerte.

### UPDATE 334 — Fundație Contract Management

- `server/modules/contracts/routes.js` — ✅ API pentru contracte, consumuri valorice, anulare și dashboard alerte;
- `server/core/db.js` — ✅ structură `contractManagement` normalizată pentru JSON/app_state;
- `db/migrations/067_contract_management.sql` — ✅ schema relațională MSSQL pentru contracte și consumuri;
- `scripts/smoke-modules-readonly.js` — ✅ smoke read-only pentru `/api/contracts` și `/api/contracts/dashboard`;
- modulul urmărește valoare contractată, consumată, rămasă, CPV, PAAP, centru cost, manager și termene.

### UPDATE 335 — UI minimal Contract Management

- `client/src/pages/modules/ContractePage.jsx` — ✅ pagină Contract Management cu dashboard, alerte, listă și formulare;
- `client/src/App.jsx` — ✅ rută `/contracte` cu permisiuni juridic/achiziții/contabilitate/controlling;
- `client/src/components/layout/Sidebar.jsx` — ✅ item nou „Contracte” în zona Servicii;
- `server/modules/system/settings-routes.js` — ✅ `contract_management` în catalog și pachete comerciale;
- `client/src/pages/SetariPage.jsx` — ✅ preseturi locale actualizate pentru pachete comerciale.

### UPDATE 336 — Legare documente sursă la contract

- `server/modules/contracts/routes.js` — ✅ endpoint documente sursă disponibile și endpoint de legare document la contract;
- `server/modules/contracts/routes.js` — ✅ NIR-urile/recepțiile legate sunt incluse automat în consumul contractului;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton și modal „Leagă doc.” pentru facturi/NIR-uri existente;
- `scripts/smoke-modules-readonly.js` — ✅ verificare pentru `/api/contracts/linkable-sources`;
- legarea marchează documentul sursă cu `contract_id` / `contractId`, evitând dublarea consumului.

### UPDATE 337 — Selector contract în documente sursă

- `client/src/pages/modules/GestiunePage.jsx` — ✅ selector „Contract urmărit” în formularul NIR;
- `server/modules/gestiune/routes.js` — ✅ NIR-ul salvează legătura contractului și metadatele de afișare;
- `client/src/pages/accounting/FacturiContab.jsx` — ✅ selector contract în facturi intrare/ieșire și coloană contract în listă;
- `server/modules/accounting/accounting-routes.js` — ✅ facturile contabile persistă `contract_id` / `contractId`;
- `server/modules/accounting/accounting-control-routes.js` — ✅ facturile generate din NIR moștenesc contractul când sursele sunt coerente;
- `server/modules/contracts/routes.js` — ✅ evită dublarea consumului când NIR-ul și factura aferentă sunt legate la același contract.

### UPDATE 338 — Contracte în Achiziții și Recepții

- `client/src/pages/modules/AchizitiiPage.jsx` — ✅ selector „Contract urmărit” în comandă nouă și recepție;
- `client/src/pages/modules/AchizitiiPage.jsx` — ✅ listele de comenzi și recepții afișează contractul legat;
- `server/modules/procurement/routes.js` — ✅ comenzile de achiziții persistă legătura contractului;
- `server/modules/procurement/routes.js` — ✅ recepțiile moștenesc contractul comenzii sau folosesc selecția explicită;
- fluxul Contract Management acoperă acum traseul `contract → comandă → recepție/NIR → factură`.

### UPDATE 339 — Contracte în Referate

- `client/src/pages/modules/ReferatePage.jsx` — ✅ selector „Contract urmărit” în formularul de referat nou;
- `client/src/pages/modules/ReferatePage.jsx` — ✅ lista și detaliile referatelor afișează contractul legat;
- `server/modules/referate/routes.js` — ✅ referatul persistă legătura contractului;
- `server/modules/referate/routes.js` — ✅ comanda generată automat din referat moștenește contractul;
- `server/modules/referate/routes.js` — ✅ PDF-ul referatului include contractul urmărit;
- fluxul Contract Management acoperă acum traseul `contract → referat → comandă → recepție/NIR → factură`.

### UPDATE 340 — Dosar operațional contract

- `server/modules/contracts/routes.js` — ✅ detaliile contractului includ documente sursă grupate;
- `server/modules/contracts/routes.js` — ✅ documentele sursă acoperă referate, comenzi, NIR/recepții și facturi;
- `server/modules/contracts/routes.js` — ✅ timeline cronologic pentru documentele legate;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Detalii” pe fiecare contract;
- `client/src/pages/modules/ContractePage.jsx` — ✅ modal dosar contract cu consumuri, documente sursă și timeline;
- consumurile rămân calculate fără dublare între NIR și factura generată din același NIR.

### UPDATE 341 — Manageri și remindere contracte

- `server/modules/contracts/routes.js` — ✅ dashboard pe manager/responsabil cu portofoliu, consum și alerte;
- `server/modules/contracts/routes.js` — ✅ endpoint `POST /api/contracts/reminders` pentru notificări din alertele contractelor;
- `server/modules/contracts/routes.js` — ✅ remindere deduplicate pe zi, contract și cod alertă;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Trimite remindere” în Contract Management;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card „Manageri contract” cu contracte, consum și alerte pe responsabil;
- fluxul Contract Management începe să devină operațional: contractele nu doar se urmăresc, ci îi cheamă la timp pe responsabili.

### UPDATE 342 — Task-uri operaționale contract

- `server/modules/contracts/routes.js` — ✅ task-uri generate din alertele contractelor;
- `server/modules/contracts/routes.js` — ✅ deduplicare task deschis pe contract și cod alertă;
- `server/modules/contracts/routes.js` — ✅ endpointuri pentru listare, generare și rezolvare task-uri contract;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card „Task-uri contract” cu responsabil, deadline și stare restantă;
- `client/src/pages/modules/ContractePage.jsx` — ✅ acțiune rapidă „Rezolvat” direct din lista de task-uri;
- `db/migrations/068_contract_management_tasks.sql` — ✅ tabelă relațională `contract_management.tasks`;
- `scripts/smoke-modules-readonly.js` — ✅ verificare read-only pentru `/api/contracts/tasks`.

### UPDATE 343 — Ticketing pentru task-uri contract

- `server/modules/contracts/routes.js` — ✅ endpoint pentru creare/reutilizare ticket din task de contract;
- `server/modules/contracts/routes.js` — ✅ legătură `ticket_uuid` / `ticket_id` păstrată pe task;
- `server/modules/contracts/routes.js` — ✅ ticket deduplicat prin `entitate_tip=contract_task` și `entitate_id`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Creează ticket” / „Ticket legat” pe task;
- `client/src/pages/modules/TicketsPage.jsx` — ✅ sursa ticketului este vizibilă în listă și în detalii;
- task-urile contractuale pot intra acum în fluxul normal de lucru din Sesizări, cu comentarii, atașamente și schimbări de status.

### UPDATE 344 — Cockpit dosar contract

- `server/modules/contracts/routes.js` — ✅ agregare cockpit pentru detaliile contractului;
- `server/modules/contracts/routes.js` — ✅ task-uri și tichete legate incluse în `GET /api/contracts/:id`;
- `server/modules/contracts/routes.js` — ✅ KPI-uri pentru alerte, task-uri, tichete, documente, consumuri și zile rămase;
- `client/src/pages/modules/ContractePage.jsx` — ✅ secțiune „Cockpit contract” în modalul Dosar contract;
- `client/src/pages/modules/ContractePage.jsx` — ✅ liste compacte pentru task-uri și tichete legate;
- contractul devine pagină de adevăr: financiar, documentar și operațional într-un singur loc.

### UPDATE 345 — Fișă printabilă contract

- `server/modules/contracts/routes.js` — ✅ endpoint HTML `GET /api/contracts/:id/print` pentru fișa contractului;
- `server/modules/contracts/routes.js` — ✅ fișă A4 cu sumar financiar, progres, alerte, consumuri, documente sursă, task-uri și tichete;
- `server/modules/contracts/routes.js` — ✅ escapare HTML și protecție prin autentificare/permisiuni existente;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Fișă print” în modalul Dosar contract;
- fișa folosește cockpit-ul contractului ca sursă unică și poate fi salvată PDF din browser.

### UPDATE 346 — Raport portofoliu contracte

- `server/modules/contracts/routes.js` — ✅ endpoint HTML `GET /api/contracts/portfolio/print`;
- `server/modules/contracts/routes.js` — ✅ raport de portofoliu cu totaluri, consum, rămas, alerte, task-uri și manageri;
- `server/modules/contracts/routes.js` — ✅ contractele sunt ordonate după risc: alerte, procent consum și scadență;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Raport portofoliu” în header-ul modulului Contract Management;
- `scripts/smoke-modules-readonly.js` — ✅ verificare read-only pentru raportul HTML de portofoliu.

### UPDATE 347 — Export Excel portofoliu contracte

- `server/modules/contracts/routes.js` — ✅ endpoint XLSX `GET /api/contracts/portfolio/export.xlsx`;
- `server/modules/contracts/routes.js` — ✅ workbook cu foi `Sumar`, `Contracte`, `Manageri`, `Alerte` și `Taskuri`;
- `server/modules/contracts/routes.js` — ✅ export bazat pe aceleași agregări ca dashboard-ul și raportul printabil;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Export Excel” în header-ul Contract Management;
- `scripts/smoke-modules-readonly.js` — ✅ verificare read-only pentru exportul XLSX al portofoliului.

### UPDATE 348 — Atașamente pe contract

- `server/modules/contracts/routes.js` — ✅ atașamente persistate în `contractManagement.attachments`;
- `server/modules/contracts/routes.js` — ✅ upload/download/anulare soft pentru fișiere contractuale;
- `server/modules/contracts/routes.js` — ✅ stocare fișiere în `storage/contracts`, extensii controlate și limită 20MB;
- `server/modules/contracts/routes.js` — ✅ fișa printabilă a contractului include atașamentele;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card „Atașamente contract” în modalul Dosar contract;
- `client/src/pages/modules/ContractePage.jsx` — ✅ upload cu categorie/descriere, descărcare și anulare.

### UPDATE 349 — Acte adiționale pe contract

- `server/modules/contracts/routes.js` — ✅ acte adiționale persistate în `contractManagement.addenda`;
- `server/modules/contracts/routes.js` — ✅ endpointuri pentru adăugare și anulare soft a actelor adiționale;
- `server/modules/contracts/routes.js` — ✅ actele adiționale pot ajusta valoarea, termenul și responsabilul contractului;
- `server/modules/contracts/routes.js` — ✅ istoricul păstrează valorile înainte/după pentru trasabilitate;
- `server/modules/contracts/routes.js` — ✅ cockpit-ul și fișa printabilă includ actele adiționale;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card „Acte adiționale” în modalul Dosar contract, cu formular și listă istoric.

### UPDATE 350 — Startup robust după Windows Update

- `server/core/db.js` — ✅ timeout minim 180s pentru helperul MSSQL PowerShell;
- `server/core/db.js` — ✅ retry/backoff pentru erori tranzitorii PowerShell/SQL după restart Windows;
- `installer/setup-task.ps1` — ✅ task-ul de autostart setează variabilele de toleranță MSSQL;
- `scripts/setup-task.ps1` — ✅ script de refacere autostart inclus direct în update ZIP;
- `scripts/windows/repair-autostart.ps1` — ✅ caută `setup-task.ps1` în locații multiple și așteaptă health mai mult;
- `scripts/windows/verify-infraflow-startup.ps1` — ✅ timeout implicit extins la 150s.

### UPDATE 351 — Act adițional cu fișier atașat

- `server/modules/contracts/routes.js` — ✅ creare act adițional cu upload opțional prin `multipart/form-data`;
- `server/modules/contracts/routes.js` — ✅ helper comun pentru atașamente contract, folosit și de upload-ul general și de actele adiționale;
- `server/modules/contracts/routes.js` — ✅ actele adiționale returnează obiectul `atasament` asociat din dosarul contractului;
- `server/modules/contracts/routes.js` — ✅ fișa printabilă afișează fișierul asociat actului adițional;
- `client/src/pages/modules/ContractePage.jsx` — ✅ formularul de act adițional include câmp „Fișier semnat”;
- `client/src/pages/modules/ContractePage.jsx` — ✅ istoricul actelor adiționale permite descărcarea directă a fișierului semnat.

### UPDATE 352 — Timeline dosar contract

- `server/modules/contracts/routes.js` — ✅ helper `contractTimeline` care agregă evenimentele dosarului fără tabel nou;
- `server/modules/contracts/routes.js` — ✅ `cockpit.timeline` include contract, alerte, documente sursă, consumuri, acte adiționale, atașamente, task-uri și tichete;
- `server/modules/contracts/routes.js` — ✅ sumarul cockpit include `timeline_total`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card „Timeline dosar contract” în modalul Dosar contract;
- `client/src/pages/modules/ContractePage.jsx` — ✅ evenimentele afișează tip, status, dată, actor, sumă și descărcare fișier unde există.

### UPDATE 353 — Contracte cu risc

- `server/modules/contracts/routes.js` — ✅ helper `contractRiskItem` pentru clasificarea contractelor cu risc;
- `server/modules/contracts/routes.js` — ✅ dashboard-ul expune `risk_contracts` și `risk_summary`;
- `server/modules/contracts/routes.js` — ✅ riscul combină alerte, task-uri restante, lipsă manager, lipsă fișier semnat și acte adiționale fără fișier;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card sumar „Cu risc” în KPI-urile Contract Management;
- `client/src/pages/modules/ContractePage.jsx` — ✅ secțiune „Contracte cu risc” cu motive explicite și deschidere dosar;
- `client/src/pages/modules/ContractePage.jsx` — ✅ filtru nou „Cu risc” în lista principală de contracte.

### UPDATE 354 — Checklist completitudine contract

- `server/modules/contracts/routes.js` — ✅ helper `contractCompleteness` calculat din dosarul existent;
- `server/modules/contracts/routes.js` — ✅ checklist cu pași obligatorii și recomandați pentru contract;
- `server/modules/contracts/routes.js` — ✅ cockpit-ul expune `completeness`, `completeness_percent` și `missing_required`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ KPI „Completitudine” în cockpit;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card „Checklist completitudine contract” cu progres, status și acțiuni recomandate.

### UPDATE 355 — Plan rapid de acțiune contract

- `server/modules/contracts/routes.js` — ✅ helper `contractActionPlan` calculat din alerte, checklist, task-uri și tichete;
- `server/modules/contracts/routes.js` — ✅ cockpit-ul expune `action_plan`, `actions_total` și `actions_critical`;
- `server/modules/contracts/routes.js` — ✅ acțiunile sunt prioritizate în urgent, important și recomandat;
- `client/src/pages/modules/ContractePage.jsx` — ✅ KPI „Acțiuni urgente” în cockpit;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card „Plan rapid de acțiune” cu sursă, prioritate, descriere și pas recomandat.

### UPDATE 356 — Task din acțiune contract

- `server/modules/contracts/routes.js` — ✅ endpoint `POST /api/contracts/:id/tasks` pentru creare task din acțiune recomandată;
- `server/modules/contracts/routes.js` — ✅ task precompletat cu prioritate, termen, responsabil și descriere;
- `server/modules/contracts/routes.js` — ✅ duplicatele pe aceeași acțiune deschisă sunt reutilizate;
- `server/modules/contracts/routes.js` — ✅ operațiunea este auditată și persistată;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Creează task” direct în planul rapid de acțiune.

### UPDATE 357 — Acțiuni contract cu task legat

- `server/modules/contracts/routes.js` — ✅ helper `attachOpenTaskToAction` pentru legarea task-urilor existente la acțiunile recomandate;
- `server/modules/contracts/routes.js` — ✅ corelare prin `action_key` și compatibilitate cu task-urile vechi din alerte prin `alert_code`;
- `server/modules/contracts/routes.js` — ✅ acțiunea agregată de task-uri restante indică un task restant existent;
- `client/src/pages/modules/ContractePage.jsx` — ✅ afișare badge „task deschis” cu titlu, responsabil și termen;
- `client/src/pages/modules/ContractePage.jsx` — ✅ butonul „Creează task” este ascuns când acțiunea are deja task deschis.

### UPDATE 358 — Dashboard comercial generic

- `client/src/pages/DashboardPage.jsx` — ✅ subtitlu dashboard generalizat pentru operațiuni, stocuri, echipe, flotă și documente;
- `client/src/pages/DashboardPage.jsx` — ✅ KPI „Tone asfalt azi” redenumit vizibil în „Output operațional azi”;
- `client/src/pages/DashboardPage.jsx` — ✅ „Status șantiere” redenumit în „Proiecte / lucrări active”;
- `client/src/pages/DashboardPage.jsx` — ✅ graficul ultimelor 7 zile este prezentat ca output operațional;
- `client/src/components/layout/Sidebar.jsx` — ✅ subtitlul produsului este „ERP modular”.

### UPDATE 359 — Închidere controlată contract

- `server/modules/contracts/routes.js` — ✅ helper `contractCloseReadiness` cu blocaje și atenționări;
- `server/modules/contracts/routes.js` — ✅ cockpit-ul expune `close_readiness`, `can_close` și `close_blockers`;
- `server/modules/contracts/routes.js` — ✅ endpoint `POST /api/contracts/:id/close`;
- `server/modules/contracts/routes.js` — ✅ închidere forțată doar cu motiv și audit;
- `client/src/pages/modules/ContractePage.jsx` — ✅ card și buton „Închide contract” în dosarul contractului.

### UPDATE 360 — Redeschidere controlată contract

- `server/modules/contracts/routes.js` — ✅ endpoint `POST /api/contracts/:id/reopen` pentru contracte închise;
- `server/modules/contracts/routes.js` — ✅ redeschidere cu motiv obligatoriu și audit `contract_reopened`;
- `server/modules/contracts/routes.js` — ✅ jurnal `closure_history` pentru închideri, închideri forțate și redeschideri;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Redeschide” pentru contractele închise;
- `client/src/pages/modules/ContractePage.jsx` — ✅ afișare motiv ultima închidere și jurnal închidere/redeschidere în dosar.

### UPDATE 361 — Anulare controlată contract

- `server/modules/contracts/routes.js` — ✅ anulare contract cu motiv obligatoriu și audit;
- `server/modules/contracts/routes.js` — ✅ contractele anulate rămân consultabile în listă, detaliu și fișa printabilă;
- `server/modules/contracts/routes.js` — ✅ dashboard-ul și fluxurile active ignoră în continuare contractele anulate;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Anulează”, confirmare și filtru „Anulate”;
- `client/src/pages/modules/ContractePage.jsx` — ✅ dosarele anulate devin consultabile/read-only pentru consumuri, acte adiționale și atașamente noi.

### UPDATE 362 — Reactivare controlată contract anulat

- `server/modules/contracts/routes.js` — ✅ endpoint `POST /api/contracts/:id/reactivate` pentru contracte anulate;
- `server/modules/contracts/routes.js` — ✅ reactivare cu motiv obligatoriu, audit și blocare duplicate active pe același număr;
- `server/modules/contracts/routes.js` — ✅ revenire la statusul anterior anulării sau la `activ`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton „Reactivează” în dosarul contractului anulat și în banner;
- `client/src/pages/modules/ContractePage.jsx` — ✅ jurnalul ciclului de viață afișează evenimentul „Reactivat”.

### UPDATE 363 — Audit portofoliu contracte

- `server/modules/contracts/routes.js` — ✅ helper `contractLifecycleSummary`;
- `server/modules/contracts/routes.js` — ✅ raportul printabil portofoliu include contractele anulate pentru trasabilitate;
- `server/modules/contracts/routes.js` — ✅ raport printabil cu secțiune `Audit ciclu de viață`;
- `server/modules/contracts/routes.js` — ✅ export Excel cu coloane lifecycle în sheet-ul `Contracte`;
- `server/modules/contracts/routes.js` — ✅ export Excel cu sheet dedicat `Audit ciclu viata`.

### UPDATE 364 — Filtre avansate portofoliu contracte

- `server/modules/contracts/routes.js` — ✅ endpoint-ul `GET /api/contracts` acceptă filtre avansate pentru status, căutare, partener, CPV, manager, risc, consum, termen și ciclu de viață;
- `client/src/pages/modules/ContractePage.jsx` — ✅ panou de filtre rapide pentru toate, active, cu alerte, cu risc și anulate;
- `client/src/pages/modules/ContractePage.jsx` — ✅ filtre detaliate pentru căutare liberă, status, risc, consum, termen și evenimente lifecycle;
- `client/src/pages/modules/ContractePage.jsx` — ✅ sumar vizibil al filtrelor active și reset rapid.

### UPDATE 365 — Rapoarte portofoliu contracte filtrate

- `server/modules/contracts/routes.js` — ✅ helper comun `contractsPortfolioData` pentru print și Excel;
- `server/modules/contracts/routes.js` — ✅ raportul printabil folosește `req.query` și calculează sumarul pe contractele filtrate;
- `server/modules/contracts/routes.js` — ✅ exportul Excel folosește aceleași filtre și include eticheta filtrelor aplicate în sheet-ul `Sumar`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ print/export transmit filtrele active din ecran către backend.

### UPDATE 366 — Vederi salvate portofoliu contracte

- `client/src/pages/modules/ContractePage.jsx` — ✅ vederi salvate predefinite pentru verificări contractuale frecvente;
- `client/src/pages/modules/ContractePage.jsx` — ✅ vederi pentru critice, scadente 30 zile, fără manager, fără document semnat, depășite și reactivate;
- `client/src/pages/modules/ContractePage.jsx` — ✅ fiecare vedere afișează contorul contractelor potrivite;
- `client/src/pages/modules/ContractePage.jsx` — ✅ logica de filtrare este reutilizată pentru listă și contoarele vederilor.

### UPDATE 367 — Acțiuni rapide portofoliu contracte

- `client/src/pages/modules/ContractePage.jsx` — ✅ acțiuni contextuale direct în tabel pentru contractele cu probleme;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton `Setează manager` pentru contractele fără responsabil;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton `Încarcă semnat` pentru contractele fără fișier semnat;
- `client/src/pages/modules/ContractePage.jsx` — ✅ după acțiuni, lista și contoarele vederilor se reîncarcă automat.

### UPDATE 368 — Mini-modal asignare manager contract

- `client/src/pages/modules/ContractePage.jsx` — ✅ prompt-ul browser pentru `Setează manager` a fost înlocuit cu mini-modal dedicat;
- `client/src/pages/modules/ContractePage.jsx` — ✅ modalul afișează contractul, partenerul și valoarea înainte de salvare;
- `client/src/pages/modules/ContractePage.jsx` — ✅ sugestii de manager din utilizatorii activi, cu fallback la introducere manuală;
- `client/src/pages/modules/ContractePage.jsx` — ✅ salvare prin endpoint-ul existent `PATCH /api/contracts/:id`, urmată de refresh listă/dashboard/contoare.

### UPDATE 369 — Upload rapid document semnat contract

- `client/src/pages/modules/ContractePage.jsx` — ✅ butonul `Încarcă semnat` deschide mini-modal dedicat, fără navigare prin dosar;
- `client/src/pages/modules/ContractePage.jsx` — ✅ fișierul este salvat direct ca atașament cu categoria `contract semnat`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ modalul afișează contractul vizat și confirmă fișierul selectat;
- `client/src/pages/modules/ContractePage.jsx` — ✅ după upload, lista, dashboard-ul și contoarele vederilor se reîncarcă automat.

### UPDATE 370 — Acțiuni în masă și radar executiv contracte

- `client/src/pages/modules/ContractePage.jsx` — ✅ selecție individuală și selecție pentru contractele vizibile;
- `client/src/pages/modules/ContractePage.jsx` — ✅ acțiuni batch pentru asignare manager și creare task-uri operaționale;
- `client/src/pages/modules/ContractePage.jsx` — ✅ radar executiv pentru cozi de lucru critice, scadente, fără manager, fără semnat și depășite;
- `server/modules/contracts/routes.js` — ✅ generatorul global de task-uri include riscurile `missing_manager` și `missing_signed_file`, cu protecție la duplicate.

### UPDATE 371 — Asistent operațional contracte

- `client/src/pages/modules/ContractePage.jsx` — ✅ panou nou cu recomandări concrete din riscurile portofoliului;
- `client/src/pages/modules/ContractePage.jsx` — ✅ recomandările pregătesc automat selecția contractelor și acțiunea batch potrivită;
- `client/src/pages/modules/ContractePage.jsx` — ✅ recomandări pentru lipsă manager, lipsă document semnat, scadențe, depășiri și task-uri/alerte;
- `client/src/pages/modules/ContractePage.jsx` — ✅ acces rapid la generare task-uri și trimitere remindere.

### UPDATE 372 — Priorități azi în dashboard

- `client/src/pages/DashboardPage.jsx` — ✅ panou nou `Ce ai de făcut azi`;
- `client/src/pages/DashboardPage.jsx` — ✅ recomandări agregate din documente, sesizări, contracte, stocuri și proiecte;
- `client/src/pages/DashboardPage.jsx` — ✅ sortare după severitate și scurtături către modulele relevante;
- `client/src/pages/DashboardPage.jsx` — ✅ stare curată când nu există blocaje evidente.

### UPDATE 373 — Priorități dashboard pe profil utilizator

- `client/src/pages/DashboardPage.jsx` — ✅ profil dashboard derivat din rol, departament și username;
- `client/src/pages/DashboardPage.jsx` — ✅ profiluri executive, HR, financiar, achiziții, operațional și general;
- `client/src/pages/DashboardPage.jsx` — ✅ recomandările sunt filtrate/reordonate după domeniile profilului;
- `client/src/pages/DashboardPage.jsx` — ✅ cererile HR în așteptare și semnalele financiare pot intra în prioritățile zilei.

### UPDATE 374 — Contabilitate hub și roadmap task-uri

- `client/src/pages/DashboardPage.jsx` — ✅ profil financiar extins cu semnale HR, stocuri și contracte;
- `client/src/pages/DashboardPage.jsx` — ✅ recomandare `Date operaționale pentru contabilitate`;
- `docs/PRODUCTIZARE_COMERCIALA.md` — ✅ direcție de produs pentru contabilitate ca hub de date;
- `docs/PRODUCTIZARE_COMERCIALA.md` — ✅ roadmap pentru Task Management delegat/personal.

### UPDATE 375 — Fundație Task Management

- `server/modules/tasks/routes.js` — ✅ API task-uri personale/delegate, status și comentarii;
- `server/app.js` — ✅ rută `/api/tasks` montată;
- `client/src/pages/modules/TasksPage.jsx` — ✅ pagină nouă `/taskuri`;
- `client/src/components/layout/Sidebar.jsx` — ✅ intrare `Task-uri`;
- `client/src/pages/DashboardPage.jsx` — ✅ task-urile personale intră în `Ce ai de făcut azi`;
- `scripts/smoke-modules-readonly.js` — ✅ smoke read-only pentru `/api/tasks/my-open`.

### UPDATE 376 — Delegare task-uri pe departament

- `server/modules/tasks/routes.js` — ✅ endpoint `/api/tasks/assignees` cu responsabili filtrați după rol/departament;
- `server/modules/tasks/routes.js` — ✅ creare și reasignare task validate server-side pe aria permisă;
- `server/modules/tasks/routes.js` — ✅ șefii de departament pot vedea task-urile create/asignate în departamentul propriu;
- `client/src/pages/modules/TasksPage.jsx` — ✅ pagina afișează regula curentă de delegare și numărul de responsabili disponibili;
- `scripts/smoke-modules-readonly.js` — ✅ smoke read-only pentru `/api/tasks/assignees`.

### UPDATE 377 — Manager direct pentru task-uri

- `server/modules/system/routes.js` — ✅ salvare și validare `manager_id` pe utilizator;
- `server/core/permissions.js` — ✅ răspunsurile public/admin pentru utilizatori includ managerul direct;
- `server/modules/tasks/routes.js` — ✅ delegare și vizibilitate task-uri pentru subordonați direcți;
- `client/src/pages/SetariPage.jsx` — ✅ select `Manager direct` și coloană manager în lista utilizatorilor;
- `client/src/pages/modules/TasksPage.jsx` — ✅ text și etichete pentru delegarea pe ierarhie directă.

### UPDATE 378 — Panou organigramă operațională

- `client/src/pages/SetariPage.jsx` — ✅ helperi locali pentru calcularea relațiilor manager → subordonați;
- `client/src/pages/SetariPage.jsx` — ✅ panou `Organigramă operațională` în tab-ul Utilizatori;
- `client/src/pages/SetariPage.jsx` — ✅ contoare pentru utilizatori activi, manageri cu echipă și conturi fără manager;
- `client/src/pages/SetariPage.jsx` — ✅ listare subordonați direcți per manager și semnal pentru legături invalide.

### UPDATE 379 — Task-uri „Echipa mea”

- `server/modules/tasks/routes.js` — ✅ suport `scope=team` pentru task-urile ariei delegabile;
- `server/modules/tasks/routes.js` — ✅ filtrare echipă după responsabili/creatori din aria permisă, excluzând utilizatorul curent;
- `client/src/pages/modules/TasksPage.jsx` — ✅ tab nou `Echipa mea`;
- `client/src/pages/modules/TasksPage.jsx` — ✅ tab-ul apare doar pentru manageri, șefi de departament sau utilizatori cu subordonați direcți.

### UPDATE 380 — Task-uri în Kiosk și sidebar

- `client/src/components/layout/Sidebar.jsx` — ✅ `Task-uri` este acces rapid în meniul principal, fără să depindă de activarea vizibilă a modulului;
- `server/modules/tasks/routes.js` — ✅ creare notificare internă la task nou și la reasignare;
- `server/modules/hr/routes.js` — ✅ Kiosk-ul poate lista task-urile deschise ale utilizatorului ERP asociat angajatului;
- `client/src/pages/KioskPage.jsx` — ✅ card `Task-urile mele`, cu priorități, termene, urgente și depășite;
- `client/src/hooks/useGlobalNotifications.js` — ✅ notificări browser și pentru creșterea numărului de task-uri personale deschise.

### UPDATE 381 — Acțiuni rapide task în Kiosk

- `server/modules/hr/routes.js` — ✅ endpoint Kiosk `PATCH /hr/kiosk/tasks/:id` pentru status și comentarii;
- `server/modules/hr/routes.js` — ✅ endpoint-ul validează asocierea angajat → utilizator ERP și permite doar task-urile proprii;
- `client/src/pages/KioskPage.jsx` — ✅ butoane `Încep`, `Blochez`, `Finalizez` în cardul task-ului;
- `client/src/pages/KioskPage.jsx` — ✅ comentarii rapide pe task direct din Kiosk;
- `server/modules/hr/routes.js` — ✅ audit `tasks:kiosk_update` pentru acțiunile făcute din Kiosk.

### UPDATE 382 — Dovezi atașate pe task din Kiosk

- `server/modules/tasks/routes.js` — ✅ storage `task-evidence`, upload ERP și download securizat pentru atașamente task;
- `server/modules/hr/routes.js` — ✅ upload dovadă task din sesiune Kiosk, limitat la task-urile proprii ale angajatului asociat;
- `client/src/pages/KioskPage.jsx` — ✅ selector fișier și buton `Încarcă dovadă` pe cardul task-ului;
- `client/src/pages/modules/TasksPage.jsx` — ✅ secțiune `Dovezi atașate` în detaliile task-ului;
- `server/modules/hr/routes.js` — ✅ comentariu automat și audit `tasks:kiosk_attachment` la încărcarea dovezii.

### UPDATE 383 — Șabloane rapide pentru task-uri

- `server/modules/tasks/routes.js` — ✅ catalog sistem de șabloane task fără migrare DB;
- `server/modules/tasks/routes.js` — ✅ endpoint `GET /api/tasks/templates`;
- `server/modules/tasks/routes.js` — ✅ endpoint `POST /api/tasks/from-template`, cu validare responsabil și audit;
- `client/src/pages/modules/TasksPage.jsx` — ✅ secțiune `Șabloane rapide` cu responsabil selectabil;
- `client/src/pages/modules/TasksPage.jsx` — ✅ creare task dintr-un click pentru documente, dovezi, rapoarte, contracte și gestiune;
- `scripts/smoke-modules-readonly.js` — ✅ smoke read-only pentru `/api/tasks/templates`.

### UPDATE 384 — Șabloane personalizate pentru task-uri

- `server/modules/tasks/routes.js` — ✅ creare șabloane custom prin `POST /api/tasks/templates`;
- `server/modules/tasks/routes.js` — ✅ actualizare/dezactivare logică prin `PATCH /api/tasks/templates/:id`;
- `server/modules/tasks/routes.js` — ✅ audit pentru creare, modificare și dezactivare șablon;
- `client/src/pages/modules/TasksPage.jsx` — ✅ formular `Șablon task nou`;
- `client/src/pages/modules/TasksPage.jsx` — ✅ afișare șabloane custom lângă șabloanele sistem și dezactivare custom din UI.

### UPDATE 385 — Legare generică task de surse ERP

- `server/modules/tasks/routes.js` — ✅ catalog `TASK_SOURCE_TYPES` pentru surse ERP uzuale;
- `server/modules/tasks/routes.js` — ✅ endpoint `GET /api/tasks/source-types`;
- `server/modules/tasks/routes.js` — ✅ îmbogățire task cu `source_type_label`, `source_label` și `source_url`;
- `server/modules/tasks/routes.js` — ✅ validare link sursă doar ca URL intern relativ;
- `client/src/pages/modules/TasksPage.jsx` — ✅ câmpuri opționale de legare sursă în formularul `Task nou`;
- `client/src/pages/modules/TasksPage.jsx` — ✅ afișare `Legat de` în listă și detaliile task-ului;
- `scripts/smoke-modules-readonly.js` — ✅ smoke read-only pentru `/api/tasks/source-types`.

### UPDATE 386 — Task ERP din dosar contract

- `server/modules/contracts/routes.js` — ✅ endpoint `POST /api/contracts/:id/erp-task`;
- `server/modules/contracts/routes.js` — ✅ creare task în `taskManagement.tasks` cu sursă `contract`;
- `server/modules/contracts/routes.js` — ✅ notificare internă și audit pentru task-ul creat din dosar;
- `server/modules/contracts/routes.js` — ✅ cockpit și `/api/contracts/tasks` includ task-urile ERP legate de contract;
- `client/src/pages/modules/ContractePage.jsx` — ✅ buton `+ Task ERP` în dosarul contractului;
- `client/src/pages/modules/ContractePage.jsx` — ✅ modal cu responsabil, scadență și prioritate;
- `client/src/pages/modules/ContractePage.jsx` — ✅ badge `ERP` în lista de task-uri din cockpit.

### UPDATE 387 — Deep-link dosar contract din task

- `client/src/pages/modules/ContractePage.jsx` — ✅ citire parametru intern `?contract=ID`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ deschidere automată dosar contract după încărcarea listei;
- `client/src/pages/modules/ContractePage.jsx` — ✅ flux complet `Task-uri → Deschide sursa → Dosar contract`;
- `client/src/pages/modules/ContractePage.jsx` — ✅ comportament neschimbat pentru accesul normal fără query-param.

### UPDATE 388 — Sursa task-ului în Kiosk

- `client/src/pages/KioskPage.jsx` — ✅ afișare context `Legat de` pentru task-urile cu sursă ERP;
- `client/src/pages/KioskPage.jsx` — ✅ buton `Deschide sursa` doar când Kiosk-ul rulează în sesiune ERP normală;
- `client/src/pages/KioskPage.jsx` — ✅ conturile Kiosk fără sesiune ERP văd contextul, fără acces direct la module administrative;
- `AGENTS.md` — ✅ roadmap actualizat cu direcția `Email organizațional + Inbox ERP`.

### UPDATE 389 — Direcție Email ERP organizațional

- `AGENTS.md` — ✅ eliminată direcția de email personal din backlog;
- `AGENTS.md` — ✅ adăugată direcția `Comunicare / Inbox ERP`;
- `CHANGELOG.md` — ✅ clarificată strategia: email organizațional per utilizator, fără conturi personale;
- `updates/UPDATE_389_directie_email_erp_organizational.md` — ✅ notă de update pentru roadmap comunicare.

### UPDATE 390 — Fundație Inbox ERP

- `server/modules/messaging/routes.js` — ✅ categorii email organizaționale implicite;
- `server/modules/messaging/routes.js` — ✅ endpoint `GET /api/messaging/email/categories`;
- `server/modules/messaging/routes.js` — ✅ endpoint `GET /api/messaging/email/inbox`, cu filtre și statistici;
- `server/modules/messaging/routes.js` — ✅ endpoint-uri write pentru înregistrare/reclasificare email intern, cu audit;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ tab `Inbox ERP` lângă `Chat intern`;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ filtre UI după text, categorie, importanță și status;
- `scripts/smoke-modules-readonly.js` — ✅ smoke read-only pentru Inbox ERP.

### UPDATE 391 — Task din email Inbox ERP

- `server/modules/tasks/routes.js` — ✅ sursă task nouă `email`;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ acțiune `Creează task` pe emailurile din Inbox ERP;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ modal de conversie email → task, cu responsabil, prioritate și termen;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ task-ul este creat prin endpoint-ul existent `/api/tasks`;
- `scripts/smoke-modules-readonly.js` — ✅ verificare sursă `email` în catalogul de surse task.

### UPDATE 392 — Document din email Inbox ERP

- `client/src/pages/modules/MessagingPage.jsx` — ✅ acțiune `Document` pe emailurile din Inbox ERP;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ modal de conversie email → document draft;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ catalogul tipurilor de document este încărcat din `/api/documents/template-catalog`;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ documentul este creat prin endpoint-ul existent `/api/documents`;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ metadatele emailului sunt păstrate în `date_json`.

### UPDATE 393 — Sursa email vizibilă în Documente

- `client/src/pages/modules/DocumentePage.jsx` — ✅ helper pentru identificarea documentelor create din email;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ badge `Email ERP` în lista de documente;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ card de context email în detaliile documentului;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ revenire rapidă către Inbox ERP;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ fără modificări DB, doar citire din `date_json`.

### UPDATE 394 — Task din document

- `client/src/pages/modules/DocumentePage.jsx` — ✅ acțiune `Creează task` în listă, tabel și detaliile documentului;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ modal de creare task din document;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ task creat prin endpoint-ul existent `/api/tasks`;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ task-ul păstrează `source_type=document` și link intern către document;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ deep-link `/documente?document=...` deschide automat documentul.

### UPDATE 395 — Task-uri legate în dosarul documentului

- `server/modules/tasks/routes.js` — ✅ filtre opționale `source_type` și `source_id` pe `/api/tasks`;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ încărcare task-uri legate la deschiderea documentului;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ card `Task-uri legate` în detaliile documentului;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ refresh automat al cardului după creare task din document;
- `scripts/smoke-modules-readonly.js` — ✅ smoke read-only pentru filtrarea task-urilor după document.

### UPDATE 396 — Task-uri filtrate din dosarul documentului

- `client/src/pages/modules/TasksPage.jsx` — ✅ citește `source_type` și `source_id` din URL;
- `client/src/pages/modules/TasksPage.jsx` — ✅ trimite filtrele către `/api/tasks` împreună cu scope-ul curent;
- `client/src/pages/modules/TasksPage.jsx` — ✅ afișează banner de context pentru lista filtrată și revenire la toate task-urile;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ acțiunea `Vezi în Task-uri` deschide panoul filtrat pe document;
- `client/src/pages/modules/DocumentePage.jsx` — ✅ butonul `Vezi toate task-urile` păstrează filtrul documentului.

### UPDATE 397 — Compunere și trimitere email din Mesaje

- `server/modules/messaging/routes.js` — ✅ `/messaging/email/send` salvează automat copia trimisă în registrul ERP;
- `server/modules/messaging/routes.js` — ✅ `/messaging/email/inbox` acceptă filtrul `direction=inbound|outbound`;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ buton `Email nou` în Inbox ERP;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ modal de compunere cu destinatar, subiect, mesaj, categorie și importanță;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ filtru `Cutie`: Inbox, Trimise, Toate;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ după trimitere reușită, utilizatorul este mutat în `Trimise`.

### UPDATE 398 — CC/BCC și atașamente la email

- `server/modules/messaging/email.js` — ✅ trimiterea SMTP acceptă `cc`, `bcc` și atașamente;
- `server/modules/messaging/routes.js` — ✅ endpoint-ul `/messaging/email/send` normalizează atașamentele pentru SMTP;
- `server/modules/messaging/routes.js` — ✅ copia trimisă salvează metadatele atașamentelor și maschează `BCC` în răspunsurile publice;
- `server/modules/messaging/routes.js` — ✅ căutarea în Inbox ERP include și câmpul `CC`;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ modalul `Email nou` are câmpuri `CC` și `BCC`;
- `client/src/pages/modules/MessagingPage.jsx` — ✅ atașamente mici din browser, cu limită 2 MB/fișier și 5 MB total/email.
