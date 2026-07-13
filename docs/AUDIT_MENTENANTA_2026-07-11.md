# Audit mentenanță InfraFlow — 2026-07-11

Versiune analizată: `2.12.284`
Următorul pas de stabilizare: `2.12.285`

## Rezultat verificări

- Backend JS syntax check: OK.
- Teste HR: OK.
- Teste Contabilitate: OK.
- Release acceptance în `DB_MODE=json`: OK.
- Backup roundtrip: OK.
- Build frontend: OK.
- Smoke API local cu superadmin, doar citire: OK pentru HR, dosar HR, salarizare, contabilitate, CPV, PAAP, referate și GPS live.

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

- următorul bloc rămas: modalul `Evaluare nouă` / `Editează evaluare`;
- extragere formular evaluare angajat, calificativ, scoruri și obiective în componentă dedicată;
- păstrare state și handler-e în `HRPage.jsx`, fără schimbare HTTP/UX.
