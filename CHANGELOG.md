# Changelog

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
