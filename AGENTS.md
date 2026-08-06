# AGENTS.md — InfraFlow ERP
> Citește acest fișier INTEGRAL înainte de orice acțiune.
> Toate deciziile respectă convențiile de aici.
> Ultima actualizare: 31 Iulie 2026

---

## 1. CE ESTE ACEST PROIECT

InfraFlow este un ERP comercial modular, self-hosted și cloud-ready, pentru firme private, servicii publice și instituții.
Dezvoltat solo de Constantin Constantin, Piatra Neamț.
Direcția curentă de produs: aplicație generală, configurabilă pe module, fără dependență de un client pilot.

**Versiune curentă sursă: v2.12.493**
**Versiune în lucru: v2.12.493**

Rulează pe **Windows cu SQL Server Express** (MSSQL).
Accesat din rețea locală + extern prin **Cloudflare Tunnel** sau domeniu propriu configurat de client.
Frontend web + PWA + Electron desktop client.

### Direcție comercială activă

```
InfraFlow nu mai este orientat către un singur client pilot.
Produsul trebuie să fie:
  - modular: clientul activează doar modulele utile;
  - intuitiv: complexitatea rămâne în spate, interfața arată următorul pas;
  - configurabil: profil organizație, module, fluxuri, documente și integrări;
  - internaționalizabil: limbă, țară, monedă, formatări și legislație pe profil de țară;
  - comercial: demo, licențiere, onboarding, helpere și update-uri clare.

Ghid de produs: docs/PRODUCTIZARE_COMERCIALA.md
```

### Direcție internațională activă

```
InfraFlow trebuie pregătit pentru uz internațional.
România rămâne primul profil complet, dar codul nou nu trebuie să presupună
că toate regulile fiscale, HR, documentare sau operaționale sunt românești.

Profilul organizației trebuie să poată controla în timp:
  - limba interfeței;
  - țara/jurisdicția;
  - moneda și formatele regionale;
  - legislația aplicabilă pe module;
  - template-uri documente pe limbă și țară;
  - nomenclatoare, validări, termene și rapoarte locale.
```

---

## 2. STACK TEHNIC

| Layer | Tehnologie |
|-------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express |
| Baza de date | SQL Server Express (MSSQL) |
| Driver DB | mssql (npm) |
| Auth | Sesiuni în memorie (Map) |
| Export Excel | xlsx (npm) |
| PDF/Print | HTML generat server-side, print din browser |
| Frontend | React + Vite (`client/src`), HTML/CSS, componente legacy unde există |
| Desktop | Electron (launcher Windows) |
| Tunnel | Cloudflare Tunnel → acasa.appnode.ro |
| GPS | urmariregps.ro (PHPSESSID auth, XML parser) |
| Email | SMTP configurabil (SMTP2GO / Gmail) |
| AI | Anthropic API (claude-haiku-4-5 / claude-sonnet-4-6) |
| Deployment | Windows Service, fără Docker |
| Mobile (viitor) | Capacitor.js (Android + iOS din același cod) |

---

## 3. STRUCTURA PROIECT

```
infraflow/
├── server/
│   ├── server.js              ← ORIGINAL — entry point principal
│   ├── core/
│   │   ├── db.js              ← conexiune MSSQL, readDb, writeDb
│   │   ├── auth.js            ← requireAuth, sessions, tokens
│   │   ├── permissions.js     ← permissionGroups, requirePermission
│   │   ├── audit.js           ← addAudit
│   │   └── setup.js           ← requiresInitialSetup, wizard instalare
│   ├── modules/
│   │   ├── inventory/         ← Gestiune/Stocuri
│   │   ├── production/        ← Producție Asfalt
│   │   ├── procurement/       ← Achiziții + PAAP + Referate + CPV
│   │   ├── fleet/             ← Mecanizare + Foi Parcurs + GPS
│   │   ├── technical/         ← Tehnic + Controlling
│   │   ├── workflow/          ← Flux documente
│   │   ├── system/            ← Admin + Backup + Update
│   │   ├── hr/                ← HR + Pontaj + Echipamente
│   │   ├── anaf/              ← e-Factura + SPV
│   │   ├── referate/          ← Referate Aprovizionare + Servicii
│   │   ├── nomenclator/       ← Coduri CPV
│   │   └── scim/              ← Control Intern Managerial (viitor)
│   └── shared/
│       ├── utils.js
│       ├── excel.js
│       └── validators.js
├── client/                    ← frontend React + Vite (src/, public/, dist/)
├── db/
│   ├── mssql-schema.sql       ← schema existentă
│   ├── migrations/            ← migrări versionate
│   └── seeds/                 ← date inițiale (CPV, etc.)
├── scripts/
│   ├── windows/               ← PowerShell scripts
│   ├── build-installer.ps1    ← BUILD EXE (citește versiunea din package.json)
│   └── import-cpv.js          ← import 9454 coduri CPV
├── updates/                   ← changelog per update
│   ├── UPDATE_001_gps_fix_markere.md
│   ├── UPDATE_002_gps_responsive_mobil.md
│   ├── UPDATE_003_wizard_instalare.md
│   ├── UPDATE_004_versiune_auto_installer.md
│   ├── UPDATE_005_stabilizari.md
│   ├── UPDATE_006_modul_referate.md
│   ├── UPDATE_007_efactura_fix.md
│   ├── UPDATE_008_paap_cpv.md
│   ├── UPDATE_009_export_paap_pontaj.md
│   └── UPDATE_010_echipamente_hr.md
└── package.json               ← versiunea SURSA DE ADEVĂR
```

---

## 4. SCHEMA MSSQL — DOMENII

```
core.*          — app_settings, roles, permissions, role_permissions,
                  departments, users, devices, audit, notifications,
                  workflow_templates, workflow_steps, schema_migrations

inventory.*     — materials, stock_entries

production.*    — recipes, recipe_versions, recipe_materials,
                  consumptions, consumption_items, production_plans,
                  plan_items, clients, asphalt_sales

procurement.*   — suppliers, orders, order_lines, receipts,
                  referate, referate_items, referate_flux,
                  referate_counter, paap, paap_executie

department.*    — requests, department_stocks, department_consumptions

fleet.*         — assets, requests, work_logs, odometer_readings

accounting.*    — cost_centers, expenses

integration.*   — scale_tickets, scale_product_map, nexus_map,
                  autominder_sync, gps_credentials

work.*          — projects, work_items

workflow.*      — requests, steps, audit

hr.*            — employees, contracts, time_sheets, leave_requests,
                  authorizations, salary_base, reges_export,
                  echipamente_tipuri, echipamente_marimi,
                  echipamente_departament, angajat_echipamente,
                  echipamente_dotari

nomenclator.*   — cpv_codes

documents.*     — document_types, documents, circuit_steps,
                  circuit_audit, document_shares

messaging.*     — channels, channel_members, messages, mentions

tickets.*       — tickets, comments, attachments, escalations

anaf.*          — efactura_documents, efactura_lines

scim.*          — proceduri, registru_riscuri, chestionare,
                  raportari (VIITOR)
```

---

## 5. MODULE — STATUS IMPLEMENTARE

### ✅ IMPLEMENTAT ȘI FUNCȚIONAL (v2.10.5)

```
Core System
  ✅ Auth + sesiuni + permisiuni
  ✅ Roluri + departamente
  ✅ Audit trail
  ✅ Notificări
  ✅ Backup + Restore
  ✅ Update sistem (patch files)
  ✅ Setări societate
  ✅ Wizard instalare (v2.10.3)
  ✅ Versiune auto din package.json în installer
  ✅ Dashboard comercial generic cu onboarding modular (v2.12.412)
  ✅ Shell comercial generic în sidebar, Setări și fallback-uri server (v2.12.413)
  ✅ Module operaționale cu limbaj generic în pagini și rapoarte (v2.12.414)
  ✅ Seed-uri și exemple comerciale generice (v2.12.415)
  ✅ Onboarding și demo comercial curățate de exemple nișate (v2.12.416)
  ✅ Demo și smoke test cu limbaj comercial generic (v2.12.417)
  ✅ Checklist ghidat „Primii pași” pe Dashboard (v2.12.418)
  ✅ Checklist onboarding inteligent cu progres automat (v2.12.419)
  ✅ Asistent configurare vizibil în Setări (v2.12.420)
  ✅ Asistent configurare pliabil și compact automat (v2.12.421)
  ✅ Asistent discret pentru portofoliul de contracte (v2.12.422)
  ✅ Dashboard generic cu KPI „Rezultat operațional azi” și flux simplu Documente (v2.12.458)
  ✅ Panou vizibil în Setări pentru workflow configurabil pe organizație și tip document (v2.12.459)
  ✅ Editor simplu pentru șabloane de workflow documente în Setări (v2.12.460)
  ✅ Aplicare șabloane workflow la lansarea documentelor cu snapshot pe document (v2.12.461)
  ✅ Testare simulată a fluxului workflow înainte de lansare în Setări (v2.12.462)
  ✅ Condiții ghidate pentru pașii de workflow documente în Setări (v2.12.463)
  ✅ Reguli workflow structurate în configurație și snapshot document (v2.12.464)
  ✅ Evaluator safe pentru reguli workflow în simulatorul din Setări (v2.12.465)
  ✅ Diagnostic vizual pentru workflow configurabil în Setări (v2.12.466)
  ✅ Aplicare controlată a regulilor workflow în engine-ul documentelor (v2.12.467)
  ✅ Reparare ghidată pentru diagnostic workflow configurabil (v2.12.468)
  ✅ Pași workflow săriți vizibili în dosarul documentului (v2.12.469)
  ✅ Editor workflow responsive și audit configurare în Setări (v2.12.470)
  ✅ Audit persistat pentru modificările workflow configurabil (v2.12.471)
  ✅ Audit decizii workflow în dosarul documentului (v2.12.472)
  ✅ Acțiuni rapide în dosarul documentului (v2.12.473)
  ✅ Radar compact documente pe Dashboard (v2.12.474)
  ✅ Filtre rapide în Inbox Documente (v2.12.475)
  ✅ Acțiuni în masă pentru Documente (v2.12.476)
  ✅ Watchlist documente urmărite cu filtru rapid și audit (v2.12.488)
  ✅ Notificări pentru documente urmărite la activitate de circuit (v2.12.489)
  ✅ Radar Dashboard pentru documente urmărite cu activitate nouă și termene (v2.12.490)
  ✅ Citire automată activitate documente urmărite la deschiderea dosarului (v2.12.491)
  ✅ Acțiuni rapide în radarul de documente urmărite (v2.12.492)
  ✅ Grupare activitate documente urmărite pe termen, responsabil și tip (v2.12.493)
  ✅ Flux simplu Contract Management: contract → dosar complet → consum → alerte → task-uri → raport/închidere (v2.12.452)

Gestiune / Depozit
  ✅ Materiale + categorii
  ✅ Intrări/Ieșiri stoc
  ✅ Transferuri departamente
  ✅ Inventariere
  ✅ Rapoarte zilnice/periodice
  ✅ Export Excel
  ✅ Confirmări UX pentru acțiuni critice pe stoc (v2.12.405)
  ✅ Asistent discret pentru stocuri, praguri și nomenclator (v2.12.424)
  ✅ Flux simplu Gestiune / Depozit: catalog → furnizori/contracte → NIR → consum → inventar → raport (v2.12.451)

Mecanizare / Fleet
  ✅ Evidență utilaje/vehicule
  ✅ Catalog manual autovehicule/utilaje și importuri tratate ca adaptoare opționale (v2.12.477)
  ✅ Foi parcurs (PWA offline + semnătură)
  ✅ FAZ (fișe activitate zilnică)
  ✅ Odometru + consum combustibil
  ✅ Alertă carburant estimat din alimentări minus consum bonuri (v2.12.478)
  ✅ Praguri configurabile pentru alerta de carburant estimat (v2.12.479)
  ✅ Sold carburant estimat pe utilaj/vehicul cu acțiuni rapide (v2.12.480)
  ✅ Filtre rapide și export Excel pentru carburant pe resursă (v2.12.481)
  ✅ Control capacitate rezervor pentru soldul estimat pe resursă (v2.12.482)
  ✅ Filtru rezervor nesetat și deep-link către fișa resursei (v2.12.483)
  ✅ Editare rapidă date tehnice carburant din panoul pe resursă (v2.12.484)
  ✅ Editare completă autovehicule/utilaje din catalogul Parc Utilaje (v2.12.485)
  ✅ Arhivare/reactivare controlată resurse parc fără pierdere istoric (v2.12.486)
  ✅ Timeline operațional unificat în fișa resursei parc (v2.12.487)
  ✅ Alerte scadențe ITP/RCA
  ✅ Import Autominder XML ca adaptor opțional, nu sursă implicită
  ✅ Confirmări UX FAZ, ștergeri și import PIUSI (v2.12.411)
  ✅ Asistent discret pentru cereri, planificări, bonuri, import carburant, intervenții și scadențe (v2.12.427)
  ✅ Flux simplu Parc & Resurse: parc → cereri → planificare → bonuri/FAZ → combustibil/intervenții → scadențe/raport (v2.12.457)
  ✅ GPS Live — urmariregps.ro ✅ (v2.10.1)
     → 23 vehicule afișate pe hartă
     → Responsive mobil cu tabs (v2.10.2)
     → Re-autentificare automată sesiune PHP
     → Markere colorate: verde/galben/roșu

Producție Asfalt
  ✅ Rețete + versiuni
  ✅ Consum materiale
  ✅ Planuri producție
  ✅ Raport tehnic + controlling
  ✅ Flux simplu Producție / Operațiuni: rețetă/BOM → plan → realizare → stoc → raport → control costuri (v2.12.455)

Tehnic / Controlling
  ✅ Jurnale de lucru (work-logs)
  ✅ Centre de cost
  ✅ Cost/utilaj automat
  ✅ Vânzări asfalt
  ✅ Raport controlling

Achiziții
  ✅ Furnizori
  ✅ Comenzi + linii
  ✅ Recepții
  ✅ Cântar (scale tickets)
  ✅ Plan Anual PAAP complet + CPV (v2.10.8)
  ✅ Asistent discret pentru firul necesar → comandă → recepție → PAAP (v2.12.423)
  ✅ Flux simplu Achiziții: necesar → CPV/PAAP → comandă → contract → recepție → cântar/raport (v2.12.453)

Referate
  ✅ Referate Aprovizionare + Servicii (v2.10.6)
  ✅ Flux 11 pași aprobare
  ✅ PDF tipărit pentru dosar fizic
  ✅ Alertă diferență factură > 5%
  ✅ Integrare stocuri + comenzi automate
  ✅ Flux simplu Referate: necesar → poziții/CPV → aprobare → comandă/contract → recepție → PDF/dosar (v2.12.456)

Resurse Umane
  ✅ Angajați + contracte
  ✅ Pontaj zilnic
  ✅ Export Pontaj Nexus pentru import salarii (v2.10.9)
  ✅ Cereri concediu (CO/CM/CFP/CED)
  ✅ Autorizații + scadențe
  ✅ Documente HR
  ✅ Echipamente protecție angajați (v2.10.10)
  ✅ Confirmări UX HR pentru pontaj, concedii, evaluări și dosar angajat (v2.12.406)
  ✅ Asistent discret pentru concedii, pontaj, dosar, scadențe și Kiosk (v2.12.425)
  ✅ Flux simplu HR: angajat → contract → pontaj → concedii/medicale → dosar/Kiosk → salarizare (v2.12.454)

Servicii Publice
  ✅ Salubrizare (rute, colectări)
  ✅ Siguranța Circulației (indicatoare, marcaje)
  ✅ Deszăpezire
  ✅ Teren
  ✅ Mediu complet (v2.12.9)
     → Autorizații, PRODDES/MUN, emisii, monitorizare,
       incidente, alerte și export SIM Excel

Contabilitate / Salarizare
  ✅ Dashboard contabil cu verificări, reconciliere și flux ghidat lună (v2.12.428)
  ✅ Flux simplu Salarizare: HR → stat → notă contabilă → plăți → obligații → D112 (v2.12.429)
  ✅ Flux simplu Facturi: terți → draft → validare → plată/încasare → e-Factura (v2.12.430)
  ✅ Flux simplu Trezorerie: scadențar → plată/încasare → corelare → validare → notă contabilă (v2.12.431)
  ✅ Flux simplu Închidere lună: verificări → blocaje → închidere → depunere → dosar lunar (v2.12.432)
  ✅ Flux simplu Situații financiare: profil → mapări → balanță/control → raport → export (v2.12.433)
  ✅ Flux simplu Balanță: verdict debit-credit → filtre → registru/carte mare → export (v2.12.434)
  ✅ Flux simplu Cartea Mare: interval → conturi → mișcări → coerență → fișă cont/export (v2.12.435)
  ✅ Flux simplu Fișă cont: interval → mișcări → sold progresiv → registru/balanță/export (v2.12.436)
  ✅ Flux simplu Profit și pierdere: perioadă → venituri → cheltuieli → rezultat → verificare/export (v2.12.437)
  ✅ Flux simplu Registru jurnal: note → drafturi/devalidate → debit-credit → balanță/export (v2.12.438)
  ✅ Flux simplu Operațiuni contabile: surse → stocuri → control → închidere → audit/export (v2.12.439)
  ✅ Flux simplu Centru fiscal: control → TVA/D300 → declarații → termen/recipisă → audit/export (v2.12.440)
  ✅ Flux simplu Declarații diverse: D205 → Intrastat → status fiscal → export/control (v2.12.441)
  ✅ Flux simplu Audit fiscal: acceptanță → validator D406 → SAF-T → recipise/dosar fiscal (v2.12.442)
  ✅ Flux simplu Plan de conturi: caută → selectează → analitic → fișă cont/control (v2.12.443)
  ✅ Flux simplu Solduri inițiale: an fiscal → conturi → debit-credit → salvare/verificare Balanță (v2.12.444)
  ✅ Flux simplu Șabloane note contabile: tip document → șabloane active → conturi → folosire pe facturi (v2.12.445)
  ✅ Flux simplu Jurnale contabile: lună → facturi → casă/bancă → export dosar lunar (v2.12.446)
  ✅ Flux simplu Terți contabili: catalog → analitice → scadențar → confirmări sold (v2.12.447)
  ✅ Flux simplu Alerte legislative: alerte noi → impact fiscal → declarații → audit (v2.12.448)
  ✅ Flux simplu ANAF / e-Factura: partener → factură → XML/SPV → recipisă → SPV (v2.12.449)
  ✅ Flux simplu Controlling: centre → obiecte legate → cheltuieli → buget vs real → raport (v2.12.450)
  ✅ Salarizare internă integrată cu HR, pontaj, plăți și D112 preliminar
  ✅ Confirmări UX Salarizare pentru plăți, stornări și rectificări (v2.12.407)

ANAF / e-Factura
  ✅ UI creare factură (modal)
  ✅ Export XML UBL 2.1 CIUS-RO
  ✅ Căutare CIF ANAF
  ✅ Parteneri
  ✅ Flux ghidat e-Factura pentru partener, factură, XML/SPV, recipisă și conectare SPV (v2.12.449)
  ✅ TVA 21% disponibil și implicit din settings (v2.10.7)
  ✅ Draft editabil + validată readonly/editare admin (v2.10.7)
  ❌  Integrare automată SPV (după înregistrare ANAF)

Workflow
  ✅ Engine flux documente
  ✅ Solicitări între departamente
  ✅ Notificări automate
  ✅ Asistent discret pentru Inbox, urgențe, drafturi, template-uri și legături document-email-task (v2.12.426)
  ✅ Flux simplu Documente: intrare → clasificare → circuit → legături → arhivare (v2.12.458)
  ✅ Direcție workflow configurabil vizibilă în Setări și roadmap comercial (v2.12.459)
  ✅ Șabloane workflow editabile și persistente în profilul organizației (v2.12.460)
  ✅ Șabloane workflow aplicate la lansarea documentelor, cu snapshot/versionare vizibilă în dosar (v2.12.461)
  ✅ Testare simulată a fluxului înainte de lansarea documentului (v2.12.462)
  ✅ Condiții ghidate prin câmp, operator și valoare pentru pașii workflow (v2.12.463)
  ✅ Reguli workflow structurate `condition_rule` păstrate în settings și snapshot (v2.12.464)
  ✅ Simulatorul evaluează `condition_rule` și arată pași aplicați/săriți (v2.12.465)
  ✅ Diagnostic read-only pentru fluxuri incomplete, aprobatori și reguli lipsă (v2.12.466)
  ✅ Engine-ul aplică `condition_rule` la lansarea documentelor în circuit (v2.12.467)
  ✅ Diagnosticul workflow oferă reparații ghidate în draft înainte de salvare (v2.12.468)
  ✅ Dosarul documentului explică pașii aplicați/săriți și scenariul evaluat (v2.12.469)
  ✅ Editorul workflow din Setări este responsive și afișează audit configurare (v2.12.470)
  ✅ Modificările șabloanelor workflow sunt păstrate într-un istoric dedicat (v2.12.471)
  ✅ Dosarul documentului afișează auditul deciziilor reale din circuit (v2.12.472)
  ✅ Dosarul documentului afișează următorul pas și acțiuni rapide de deblocare (v2.12.473)
  ✅ Dashboard-ul afișează un radar compact pentru documente în inbox sau blocate (v2.12.474)
  ✅ Inbox-ul Documente are filtre rapide pentru acțiune, blocaje, scadențe, urgențe, drafturi și email (v2.12.475)
  ✅ Documente are selecție multiplă, task-uri în masă și export CSV pentru lista de lucru (v2.12.476)

Comunicare
  ✅ Chat intern pe canale, mențiuni și notificări live
  ✅ Fundație Inbox ERP organizațional (v2.12.370)
  ✅ Categorii email, importanță, status, atașamente și sursă ERP
  ✅ Task din email Inbox ERP (v2.12.371)
  ✅ Document din email Inbox ERP (v2.12.372)
  ✅ Sursa email vizibilă în Documente (v2.12.373)
  ✅ Task din document (v2.12.374)
  ✅ Task-uri legate în dosarul documentului (v2.12.375)
  ✅ Task-uri filtrate din dosarul documentului (v2.12.376)
  ✅ Compunere și trimitere email din Mesaje (v2.12.377)
  ✅ CC/BCC și atașamente la email din Mesaje (v2.12.378)
  ✅ Răspunde și redirecționează email din Inbox ERP (v2.12.379)
  ✅ Drafturi email în Inbox ERP (v2.12.380)
  ✅ Hotfix configurare SMTP (v2.12.381)
  ✅ Diagnostic SMTP prietenos (v2.12.382)
  ✅ Acțiuni rapide Inbox ERP (v2.12.383)
  ✅ Acțiuni în masă Inbox ERP (v2.12.384)
  ✅ Primire email prin IMAP manual (v2.12.385)
  ✅ Configurare IMAP explicită (v2.12.386)
  ✅ Sincronizare automată Inbox IMAP (v2.12.387)
  ✅ Status sincronizare Inbox IMAP (v2.12.388)
  ✅ Reguli automate email Inbox (v2.12.389)
  ✅ Reguli email vizibile și testabile (v2.12.390)
  ✅ Legare email de entități ERP (v2.12.391)
  ✅ Emailuri legate vizibile în dosare ERP (v2.12.392)
  ✅ Deep-link direct către emailuri ERP (v2.12.393)
  ✅ Modal detalii email ERP (v2.12.394)
  ✅ Download atașamente email ERP (v2.12.395)
  ✅ Import IMAP cu atașamente descărcabile (v2.12.396)
  ✅ Document ERP din atașament email (v2.12.397)
  ✅ Descărcare atașament sursă din document (v2.12.398)
  ✅ Hotfix eroare atașament Inbox ERP (v2.12.399)
  ✅ Notificări live fără token real în URL (v2.12.401)
  ✅ Confirmări UX PAAP fără dialoguri native (v2.12.402)
  ✅ Confirmări UX contracte cu motiv auditat (v2.12.403)
  ✅ Confirmări UX în Setări (v2.12.404)
  ✅ Confirmări UX în Gestiune (v2.12.405)
  ✅ Confirmări UX HR pentru pontaj și dosar angajat (v2.12.406)
  ✅ Confirmări UX Salarizare pentru plăți, stornări și rectificări (v2.12.407)
  ✅ Confirmări UX Facturi și Registru jurnal (v2.12.408)
  ✅ Confirmări UX Controlling și raportări contabile (v2.12.409)
  ✅ Confirmări UX Producție, Așternere, Documente și Dashboard (v2.12.410)
  ✅ Confirmări UX Mecanizare, FAZ și operațiuni contabile (v2.12.411)

Task Management
  ✅ Fundație task-uri personale și delegate (v2.12.355)
  ✅ Delegare controlată pe departament (v2.12.356)
  ✅ Manager direct și delegare către subordonați direcți (v2.12.357)
  ✅ Panou organigramă operațională (v2.12.358)
  ✅ Vedere Task-uri „Echipa mea” (v2.12.359)
  ✅ Task-uri în Kiosk și acces rapid sidebar (v2.12.360)
  ✅ Acțiuni rapide task în Kiosk (v2.12.361)
  ✅ Dovezi atașate pe task din Kiosk (v2.12.362)
  ✅ Șabloane rapide pentru task-uri (v2.12.363)
  ✅ Șabloane personalizate pentru task-uri (v2.12.364)
  ✅ Legare generică task de surse ERP (v2.12.365)
  ✅ Task ERP din dosar contract (v2.12.366)
  ✅ Deep-link dosar contract din task (v2.12.367)
  ✅ Sursa task-ului în Kiosk (v2.12.368)
  ✅ Status, prioritate, scadență și comentarii
  ✅ Integrare în Dashboard „Ce ai de făcut azi”

Sistem
  ✅ Diagnostice
  ✅ Backup/Restore
  ✅ Update pachete
  ✅ Audit log
  ✅ Audit complet aplicație și backlog prioritar (v2.12.399)
  ✅ Exporturi și printări fără token în URL (v2.12.400)
  ✅ Notificări live fără token real în URL (v2.12.401)
  ✅ Confirmări UX PAAP fără dialoguri native (v2.12.402)
  ✅ Confirmări UX contracte cu motiv auditat (v2.12.403)
  ✅ Confirmări UX în Setări (v2.12.404)
```

### ✅ IMPLEMENTAT ÎN SURSĂ (v2.10.6 → v2.11.5)

```
UPDATE 006 — Modul Referate (v2.10.6) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Referate Aprovizionare + Servicii
  ✅ Flux 11 pași aprobare
  ✅ PDF tipărit pentru dosar fizic
  ✅ Alertă diferență factură > 5%
  ✅ Integrare stocuri + comenzi automate
  Tabele: procurement.referate, referate_items,
          referate_flux, referate_counter

UPDATE 007 — e-Factura fix (v2.10.7) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ TVA 21% adăugat în dropdown
  ✅ Câmpuri editabile în formular
  ✅ Cota TVA din settings aplicată automat
  ✅ Buton editare factură validată (admin)

UPDATE 008 — PAAP complet + CPV (v2.10.8) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Plan Anual Achiziții complet
  ✅ Execuție bugetară în timp real per CPV
  ✅ Generare plan din istoric comenzi
  ✅ Proceduri automate după praguri legale:
     < 135.060 lei → Achiziție directă
     135.060-668.280 lei → Procedură simplificată
     > 668.280 lei → Licitație deschisă
  ✅ Alerte depășire plafon CPV
  ✅ 9454 coduri CPV (RO + EN) importate
  ✅ CPVSelector live search în Referate, Comenzi și Materiale
  ✅ Adăugare manuală cod CPV cu verificare unicitate
  Tabele: procurement.paap, paap_executie,
          nomenclator.cpv_codes

UPDATE 009 — Export PAAP + Pontaj Nexus (v2.10.9) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Export PAAP format oficial SEAP
     (identic cu sablon.xlsx de referință)
     Coloane: Obiect, CPV, Tip procedură, Tip contract,
     Responsabil, Val RON fără/cu TVA, Val EUR,
     Date început/sfârșit, Finanțare, Desfășurare
  ✅ Export Pontaj format Nexus (import salarii)
     (identic cu MODEL_PONTAJ_2026_rev_1.xlsx)
     2 rânduri per angajat, formatare Excel completă,
     Sheet Legenda, zilele weekend/libere colorate

UPDATE 010 — Echipamente Protecție HR (v2.10.10) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Mărimi per angajat (salopetă/bocanci/cizme)
  ✅ Istoric dotări + data expirare
  ✅ Raport necesar per departament
     (format identic tABELE_MARIMI_ECHIPAMENT.xlsx)
  ✅ Export Excel pentru furnizor cu coduri articol
  ✅ Creare automată Referat Aprovizionare din raport
  ✅ Alerte expirare echipamente (30/60/90 zile)
  Tabele: hr.echipamente_tipuri, marimi,
          departament, angajat_echipamente, dotari
  Date seed: Ares 82/83 (Bleomarin/Kaki),
             4100217 (Portocaliu), bocanci, cizme

UPDATE 011 — Stabilizare instalare + CPV + Referate + DB (v2.11.1) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Wizard URL client Electron la instalare fresh
  ✅ Upload manual ZIP pentru update
  ✅ Import CPV startup + endpoint superadmin + fallback JSON
  ✅ Migrări MSSQL startup și pooling cu reconnect
  ✅ Watchdog serviciu Windows
  ✅ Referate superadmin fără departament obligatoriu

UPDATE 012 — Stabilizare update + HR + GPS (v2.11.2) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Upload ZIP tolerant și erori explicite
  ✅ Departamente HR din nomenclatorul central
  ✅ Explicație sursă catalog CPV inclus
  ✅ Configurare GPS salvată înainte de test
  ✅ Furnizori GPS alternativi prin API JSON/XML

UPDATE 013 — Hotfix installer + autentificare (v2.11.3) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Seed curat dedicat instalărilor noi
  ✅ Wizard inițial activ pe server nou
  ✅ Finalizare wizard disponibilă înainte de autentificare
  ✅ Mesaj login invalid afișat fără reload

UPDATE 014 — Hotfix wizard inițial (v2.11.4) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Lookup ANAF public înainte de autentificare
  ✅ Erori wizard păstrate în pagină
  ✅ Finalizare wizard pe ruta modernă

UPDATE 015 — Hotfix sesiune după wizard (v2.11.5) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Sesiune salvată după configurarea inițială
  ✅ Redirect direct în dashboard
  ✅ Autofill actualizat cu administratorul creat

UPDATE 016 — Notă Comandă PDF (v2.11.6) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Document HTML A4 portrait pentru print direct din browser
  ✅ Date automate firmă, furnizor, produse și semnături
  ✅ Watermark DRAFT și minimum 10 rânduri produse
  ✅ Buton Tipărește în lista comenzilor

UPDATE 017 — Editor vizual documente (v2.11.7) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Quill.js CDN în formularul Template nou
  ✅ Variabile inserabile ca badge-uri colorate
  ✅ Preview cu date fictive și toolbar cu tabele
  ✅ Categorii template extinse

UPDATE 018 — Kiosk universal pentru toți angajații (v2.11.8) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Permisiuni Kiosk implicite pentru orice utilizator activ
  ✅ Rol implicit Angajat nedezactivabil, independent de rolul principal
  ✅ Endpoint agregat cu datele personale ale utilizatorului
  ✅ Acces Kiosk permanent în sidebar și în administrarea utilizatorilor

UPDATE 019 — Restart după update ZIP (v2.11.9) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Restart automat pentru serviciul Windows InfraFlow
  ✅ Restart automat pentru task-ul programat InfraFlow ERP
  ✅ Oprire controlată a procesului vechi înainte de relansare

UPDATE 019b — Scule/Unelte + Catalog gestionar (v2.11.10) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Scule, unelte și inventar urmărite individual
  ✅ Catalog editabil de gestionar cu serie și valoare inventar
  ✅ Inventar complet angajat, lichidare și total răspundere în Kiosk

UPDATE 020 — Restart robust după update ZIP (v2.11.11) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Restart prin task Windows temporar independent de server
  ✅ Compatibil serviciu InfraFlow, task InfraFlow ERP și fallback direct
  ✅ Jurnal diagnostic runtime/restart-last.log

UPDATE 020 — Foi Parcurs Digital Complet (v2.12.0) ✅ IMPLEMENTAT ÎN SURSĂ
  ✅ Trimitere responsabil → șofer și completare verso mobilă
  ✅ Semnătură șofer + link public 24h pentru responsabil
  ✅ PDF final cu semnături și QR de verificare
  ✅ Aprobare șef mecanizare și notificări Web Push
```

### 📋 BACKLOG (după BUILD v2.11.0)

```
PRIORITATE 1 — Comercial imediat:
  [ ] Modul Contabilitate complet (model Saga C)
      → Plan conturi OMFP 1802/2014
      → Jurnale: vânzări, cumpărări, casă, bancă
      → Balanță de verificare (sintetică + analitică)
      → Registru jurnal + Cartea Mare
      → Bilanț + Cont profit și pierdere
      → D300, D394, D112, D205, D406/SAF-T
      → Intrastat
      → e-Factura integrată (nu modul separat)
      → Date vin AUTOMAT din toate modulele
      Referință: HelpSC.chm (97 pagini manual Saga)
                 + saga.zip (screenshots + PDF declarații)

  [ ] Modul CRM (model CRM AMC)
      → Clienți + Potențiali
      → Oferte → Contracte → Facturi
      → Facturi recurente
      → Chitanțe
      → Pipeline vânzări
      → Integrat cu toate modulele InfraFlow
      → Diferențiator: date vin automat din ERP

  [ ] Modul Contract Management
      → Contracte pe valoare, durată, furnizor/client și responsabil
      → Consum automat din facturi, NIR-uri, comenzi și situații de lucrări
      → Alerte la 80/90/100% valoare consumată sau termen apropiat
      → Pentru România: urmărire pe coduri CPV, PAAP și praguri achiziții
      → Manageri de contract cu raportare către Achiziții/Contabilitate
      → Dashboard contract: valoare contractată, facturată, rămasă, depășiri
      → Integrări: Achiziții, Contabilitate, Documente, Workflow, Controlling

  [ ] Modul SCIM — Control Intern Managerial
      → Proceduri operaționale (Ordinul 600/2018)
      → Registru riscuri
      → Chestionare autoevaluare (format de referință)
      → Raportări semestriale/anuale
      → OBLIGATORIU pentru toate instituțiile publice
      → Referință: Chestionar_autoevaluare_2025.docx
                   Anexa-3_7-Model-procedura-achizitii.docx
                   your-scim.herokuapp.com (platformă referință)

PRIORITATE 2 — Expansiune platformă:
  [ ] Modul Salarizare (înlocuiește Nexus)
      Faza 1: Export Nexus ✅ (UPDATE 009)
      Faza 2: Calcul intern — sporuri, rețineri,
              stat de plată, fluturași, D112, Revisal,
              export viramente bancă

  [ ] Portal Autoritate Locală
      → Cont extern pentru beneficiar
      → Trimite comenzi/solicitări
      → Urmărește statusul în timp real
      → Primește documente finalizate (PDF)
      → Flux: Portal → Secretariat → Tehnic → Portal

  [ ] Modul Task Management
      → Faza 1: task-uri personale/delegate, status, prioritate,
        scadență și comentarii ✅ UPDATE 375
      → Faza 2: reguli de delegare pe departament ✅ UPDATE 376
      → Faza 3: manager direct și subordonați direcți ✅ UPDATE 377
      → Faza 4: panou organigramă operațională ✅ UPDATE 378
      → Faza 5: vedere task-uri pe echipă ✅ UPDATE 379
      → Faza 6: task-uri în Kiosk, acces rapid sidebar și notificări ✅ UPDATE 380
      → Faza 7: acțiuni rapide task în Kiosk ✅ UPDATE 381
      → Faza 8: dovezi atașate pe task din Kiosk ✅ UPDATE 382
      → Faza 9: șabloane rapide pentru task-uri repetitive ✅ UPDATE 383
      → Faza 10: șabloane personalizate pentru task-uri repetitive ✅ UPDATE 384
      → Faza 11: legare generică task de surse ERP ✅ UPDATE 385
      → Faza 12: task ERP direct din dosar contract ✅ UPDATE 386
      → Faza 13: deep-link dosar contract din task ✅ UPDATE 387
      → Faza 14: sursa task-ului în Kiosk ✅ UPDATE 388
      → Faza 15: task direct din document și deep-link document ✅ UPDATE 394
      → Faza 16: task-uri legate vizibile în dosarul documentului ✅ UPDATE 395
      → Faza 17: task-uri filtrate după sursa documentului ✅ UPDATE 396
      → Faza 18: organigramă completă cu lanț ierarhic și echipe
      → Legare task de documente, contracte, sesizări, HR, gestiune,
        achiziții, contabilitate sau proiecte
      → Dashboard personal „ce am de făcut azi”
      → Respectă ierarhia și permisiunile, nu doar departamentul textual

  [ ] Demo Tenant
      → demo.infraflow.ro
      → Date fictive precompletate (Construct Demo SRL)
      → User demo: max 5 operațiuni noi
      → Reset automat zilnic la 03:00
      → Banner "Mod Demo" + buton "Vreau să cumpăr"

  [ ] GPS Multi-provider
      → Arhitectură driver-based
      → urmariregps.ro ✅ (funcțional)
      → Driver 2, 3... (la identificarea furnizorilor)
      → Clientul alege furnizorul din Setări

  [ ] Fleet / Mecanizare multi-adapter
      → Catalogul manual de autovehicule și utilaje este sursa de pornire
      → Autominder rămâne referință/adaptor opțional pentru import istoric
      → PIUSI rămâne adaptor opțional; trebuie pregătite CSV/Excel și alți furnizori carburant
      → Alimentările manuale trebuie să funcționeze complet fără PIUSI
      → Alertă stoc carburant estimat pe baza alimentărilor, consumurilor și pragurilor definite de client ✅ Fundație v2.12.478, praguri configurabile v2.12.479, sold pe resursă v2.12.480, filtre/export v2.12.481, control capacitate v2.12.482, filtru rezervor nesetat v2.12.483, editare rapidă date tehnice v2.12.484, editare completă catalog v2.12.485, arhivare/reactivare v2.12.486, timeline fișă resursă v2.12.487
      → Mapări configurabile per furnizor, nu hardcodate pe o singură companie

  [ ] Modul Warehouse / WMS
      → Gestiune depozite de la mic la mare
      → Locații, rafturi, zone, loturi, seriale
      → Picking, packing, transferuri, inventariere mobilă
      → Recepții avansate, retururi, trasabilitate
      → Integrare Achiziții, Vânzări/CRM, Contabilitate și Logistică

  [ ] Modul Logistics
      → Comenzi transport și livrare
      → Rute, încărcări, descărcări, dovadă livrare (POD)
      → Cost/km, cost/livrare, integrare Fleet și GPS
      → Status client/beneficiar în timp real

  [ ] Modul Ecarisaj / Public Health Services
      → Sesizări, programări intervenții, capturi/transport
      → Evidență carcase/animale, documente sanitar-veterinare
      → Rute, echipe, vehicule, costuri și raportări locale
      → Adaptabil pe legislația țării și cerințele autorității

PRIORITATE 3 — Infrastructură comercială:
  [ ] Licențiere modulară automată
      Pachete: Core + Conta | Core + Tehnic |
               Core + HR | Core + CityPaw |
               Enterprise (toate)
      Cheie licență: format XXXXX-XXXXX-XXXXX-XXXXX
      Activare online sau offline

  [ ] Site prezentare infraflow.ro
      → Landing page profesional
      → Demo live integrat
      → Prețuri module
      → Contact + trial request

  [ ] Serviciu migrare date (contra cost)
      → Import din Excel/CSV vechi
      → Script standardizat per modul
      → Raport validare + erori
      → Tarif: fix per modul (200-300€) sau zi lucru

  [ ] API Anthropic pe SRL
      → Un singur cont Anthropic (persoană juridică)
      → Toți clienții trec prin același API key
      → Markup 3-5x față de cost Anthropic
      → Haiku 4.5 pentru operațiuni simple
      → Sonnet 4.6 pentru analize complexe
      → Contor tokens per instalare client

  [ ] Comunicare / Inbox ERP
      → Faza 1: fundație Inbox ERP, categorii și filtre ✅ UPDATE 390
      → Faza 2: creare task direct din email ✅ UPDATE 391
      → Faza 3: creare document draft direct din email ✅ UPDATE 392
      → Faza 4: sursa email vizibilă în Documente ✅ UPDATE 393
      → Faza 5: compunere și trimitere email din Mesaje ✅ UPDATE 397
      → Faza 6: CC/BCC și atașamente la email ✅ UPDATE 398
      → Faza 7: răspunde și redirecționează email ✅ UPDATE 399
      → Faza 8: drafturi email în Inbox ERP ✅ UPDATE 400
      → Faza 9: hotfix configurare SMTP ✅ UPDATE 401
      → Faza 10: diagnostic SMTP prietenos ✅ UPDATE 402
      → Faza 11: acțiuni rapide Inbox ERP ✅ UPDATE 403
      → Faza 12: acțiuni în masă Inbox ERP ✅ UPDATE 404
      → Faza 13: primire email prin IMAP manual ✅ UPDATE 405
      → Faza 14: configurare IMAP explicită ✅ UPDATE 406
      → Faza 15: sincronizare automată Inbox IMAP ✅ UPDATE 407
      → Faza 16: status sincronizare Inbox IMAP ✅ UPDATE 408
      → Faza 17: reguli automate email Inbox ✅ UPDATE 409
      → Faza 18: reguli email vizibile și testabile ✅ UPDATE 410
      → Faza 19: legare email de entități ERP ✅ UPDATE 411
      → Faza 20: emailuri legate vizibile în dosare ERP ✅ UPDATE 412
      → Faza 21: deep-link direct către emailuri ERP ✅ UPDATE 413
      → Faza 22: modal detalii email ERP ✅ UPDATE 414
      → Faza 23: download atașamente email ERP ✅ UPDATE 415
      → Faza 24: import IMAP cu atașamente descărcabile ✅ UPDATE 416
      → Faza 25: document ERP din atașament email ✅ UPDATE 417
      → Faza 26: descărcare atașament sursă din document ✅ UPDATE 418
      → Faza 27: audit complet aplicație și hotfix Inbox ERP ✅ UPDATE 419
      → Email organizațional per utilizator, fără conturi personale
      → Inbox integrat în aplicație, cu categorii și importanță
      → Filtre după dată, expeditor, categorie, modul, sursă ERP și atașamente
      → Legare email de contracte, task-uri, documente, furnizori, clienți și facturi
      → Conversie email → task sau document intrat
      → SMTP global ca fallback pentru instalări mici și notificări de sistem
      → Viitor: alias centralizat, OAuth/SMTP per utilizator și politici pe tenant

  [ ] Workflow configurabil pe organizație și tip document
      → Fiecare organizație își definește propriile fluxuri, nu există un traseu universal hardcodat
      → Fluxurile se configurează pe tip document: referat, contract, factură, HR, cerere internă, document juridic etc.
      → Pașii pot fi departamente, roluri, utilizatori nominali sau managerul direct al inițiatorului
      → Condiții pe valoare, departament, centru de cost, țară/jurisdicție, prioritate sau sursă document
      → Interfață vizuală simplă: adaugă pas, aprobator, condiție, termen, escaladare și notificări ✅ Fundație v2.12.460
      → Șabloane de flux per profil organizație, dar editabile de client ✅ Fundație v2.12.460
      → Versionare fluxuri: documentele pornite păstrează versiunea de flux activă la data lansării ✅ Fundație v2.12.461
      → Testare flux înainte de lansare cu tip document, inițiator, departament, valoare și prioritate ✅ Fundație v2.12.462
      → Condiții ghidate pe pași prin câmp, operator și valoare, fără expresii tehnice ✅ Fundație v2.12.463
      → Salvare condiții și ca regulă structurată field/operator/value în settings și snapshot ✅ Fundație v2.12.464
      → Evaluator safe în simulator pentru pași aplicați/săriți/date lipsă ✅ Fundație v2.12.465
      → Diagnostic read-only pentru fluxuri incomplete, aprobatori lipsă și reguli neclare ✅ Fundație v2.12.466
      → Aplicare controlată în engine: sar doar pașii cu reguli structurate evaluate fals ✅ Fundație v2.12.467
      → Reparare ghidată în draft pentru problemele semnalate de diagnostic ✅ Fundație v2.12.468
      → Dosar document cu scenariu evaluat, pași aplicați și pași săriți de reguli ✅ Fundație v2.12.469
      → Editor responsive pe carduri și audit vizibil al configurării workflow ✅ Fundație v2.12.470
      → Audit persistat pentru modificarea șabloanelor workflow ✅ Fundație v2.12.471
      → Audit decizii reale din circuit vizibil în dosarul documentului ✅ Fundație v2.12.472
      → Acțiuni rapide din dosarul documentului când un pas este blocat ✅ Fundație v2.12.473
      → Radar compact pe Dashboard pentru inbox, blocaje și termene documente ✅ Fundație v2.12.474
      → Filtre rapide în Inbox Documente pentru acțiune, blocaje, scadențe și sursă email ✅ Fundație v2.12.475
      → Acțiuni în masă: selecție, task-uri per document și export CSV ✅ Fundație v2.12.476
      → Watchlist documente urmărite cu filtru rapid și audit ✅ Fundație v2.12.488
      → Notificări pentru documente urmărite la lansare, aprobare, respingere, retragere și partajare ✅ Fundație v2.12.489
      → Radar personal pe Dashboard pentru documente urmărite, activitate nouă și termene ✅ Fundație v2.12.490
      → Marcarea automată ca citită a activității urmărite când utilizatorul deschide documentul ✅ Fundație v2.12.491
      → Acțiuni rapide din radar: task legat de document și scoatere din urmărite ✅ Fundație v2.12.492
      → Grupare urmărite pe termen, responsabil și tip document ✅ Fundație v2.12.493

  [ ] Multi-limbă + profil de țară
      → i18n în frontend
      → Toate labelurile/mesajele traduse
      → Limbă, țară, monedă și formate regionale în profil organizație
      → Reguli legislative configurabile pe țară, treptat pe module
      → Template-uri documente și rapoarte pe limbă/jurisdicție

  [ ] Web SaaS + Mobile
      → Același cod Node.js → hosted
      → Capacitor.js → Android APK + iOS
      → 1 codebase → 4 platforme

MODUL SPECIAL:
  [ ] CityPaw — Urban Animal Management
      → Capturi câini comunitari
      → Evidență adăpost (boxe, animale)
      → Fișe medicale (vaccinări, sterilizări, tratamente)
      → Adopții + contracte
      → Raportări DSP/Primărie
      → Integrare Core (angajați, vehicule, cheltuieli)
      → Target: Primării, SPAS-uri, servicii publice
```

---

## 6. CONVENȚII STRICTE

### Regula 0 — Nu strici ce funcționează
Fiecare modificare menține comportamentul identic.
Același request HTTP → același răspuns JSON.

### Regula 1 — Un modul, un domeniu
Dependențele circulare între module sunt interzise.
Shared utilities → `shared/`.

### Regula 2 — DB layer centralizat
Tot accesul DB trece prin `core/db.js`.

### Regula 3 — Erori consistente
```javascript
{ "error": "Mesaj în română", "code": "OPTIONAL_CODE" }
// HTTP: 200, 201, 204, 400, 401, 403, 404, 409, 422, 500
```

### Regula 4 — Audit pe orice write
Orice POST/PUT/PATCH/DELETE cheamă `addAudit()`.

### Regula 5 — Anulare, nu ștergere
Înregistrările se marchează `cancelledAt/By/Reason`, nu se șterg fizic.

### Regula 6 — Stocul din mișcări
`stoc_curent` = SUM(cantitate) din mișcări. Nu se actualizează manual.

### Regula 7 — Fără dependențe noi fără analiză
Dependențe acceptate: `express`, `mssql`, `xlsx`, `typescript`.

### Regula 8 — Compatibilitate DB_MODE=json
Funcționează și fără MSSQL (demo/dev local).

### Regula 9 — Migrări versionate
Modificări schemă = fișier nou în `db/migrations/`.
Format: `012_descriere.sql`. Nu modifica `mssql-schema.sql` direct.

### Regula 10 — Sistem updates
Fiecare modificare funcțională = fișier în `updates/UPDATE_00X_descriere.md`
La UPDATE #10 = BUILD complet (Server + Client EXE)
Versiunea = MEREU din package.json (nu hardcodat)

---

## 7. VERSIONING & BUILD

```
VERSIUNE CURENTĂ SURSĂ: 2.12.493
BUILD EXE EXISTENT: 2.12.459 ✅
UPDATE ZIP CURENT: 2.12.493 ✅

UPDATES ÎN LUCRU:
  2.10.6  → UPDATE 006 Referate ✅
  2.10.7  → UPDATE 007 e-Factura fix ✅
  2.10.8  → UPDATE 008 PAAP + CPV ✅
  2.10.9  → UPDATE 009 Export PAAP + Pontaj Nexus ✅
  2.10.10 → UPDATE 010 Echipamente HR ✅
  2.11.1  → UPDATE 011 Stabilizare instalare + CPV + Referate + DB ✅
  2.11.2  → UPDATE 012 Stabilizare update + HR + GPS ✅
  2.11.3  → UPDATE 013 Hotfix installer + autentificare ✅
  2.11.4  → UPDATE 014 Hotfix wizard inițial ✅
  2.11.5  → UPDATE 015 Hotfix sesiune după wizard ✅
  2.11.6  → UPDATE 016 Notă Comandă PDF ✅
  2.11.7  → UPDATE 017 Editor vizual documente ✅
  2.11.8  → UPDATE 018 Kiosk universal pentru toți angajații ✅
  2.11.9  → UPDATE 019 Restart după update ZIP ✅
  2.11.10 → UPDATE 019b Scule/Unelte + Catalog gestionar ✅
  2.11.11 → UPDATE 020 Restart robust după update ZIP ✅
  2.12.0  → UPDATE 020 Foi Parcurs Digital Complet ✅
  2.12.1  → UPDATE 021 Migrare completă pe MSSQL ✅
  2.12.2  → UPDATE 022 Hotfix acces MSSQL Task Scheduler ✅
  2.12.3  → UPDATE 023 MSSQL izolat InfraFlow ✅
  2.12.4  → UPDATE 024 Pornire robustă + MSSQL server + regresii pilot ✅
  2.12.5  → UPDATE 025 Detectare automată instanță SQL Server ✅
  2.12.6  → UPDATE 026 Installer curat + restore MSSQL ✅
  2.12.7  → UPDATE 027 Pornire automată unificată ✅
  2.12.8  → UPDATE 028 Detectare profil SQL Server ✅
  2.12.9  → UPDATE 029 Modul Mediu Complet ✅
  2.12.10 → UPDATE 030 Hotfix pornire după UPDATE 029 ✅
  2.12.11 → UPDATE 031 Installer server cu SQL automat ✅
  2.12.12 → UPDATE 032 Hotfix pornire modul Mediu ✅
  2.12.13 → UPDATE 033 Hotfix Dashboard după Kiosk ✅
  2.12.14 → UPDATE 034 Centre cost/profit client pilot ✅
  2.12.15 → UPDATE 035 Asigurări + ITP + ISCIR + Taxe ✅
  2.12.16 → UPDATE 036 Integrare PIUSI Self-Service ✅
  2.12.17 → UPDATE 037 Căi surse externe ✅
  2.12.171 → UPDATE 191 Acceptanță contabilă MSSQL ✅
  2.12.172 → UPDATE 192 Formulare financiare configurabile ✅
  2.12.173 → UPDATE 193 Adaptoare D300/D394 ✅
  2.12.174 → UPDATE 194 SAF-T MasterFiles + registru general ✅
  2.12.175 → UPDATE 195 SAF-T documente sursă ✅
  2.12.176 → UPDATE 196 Dosar fiscal lunar ✅
  2.12.177 → UPDATE 197 Audit fiscal ghidat ✅
  2.12.178 → UPDATE 198 Schema oficială SAF-T + validare XSD ✅
  2.12.183 → UPDATE 203 DUK operațional ✅
  2.12.184 → UPDATE 204 Corelare completă SAF-T ✅
  2.12.185 → UPDATE 205 Remediere și reverificare SAF-T ✅
  2.12.186 → UPDATE 206 Dosar fiscal lunar ✅
  2.12.187 → UPDATE 207 Test contabil end-to-end ✅
  2.12.188 → UPDATE 208 Recipise ANAF D406 ✅
  2.12.189 → UPDATE 209 Închidere fiscală controlată ✅
  2.12.190 → UPDATE 210 Build complet ✅
  2.12.179 → UPDATE 199 Generator SAF-T complet + XSD ✅
  2.12.180 → UPDATE 200 Nomenclatoare SAF-T + integrare DUK ✅
  2.12.181 → UPDATE 201 Validare DUK SAF-T ✅
  2.12.182 → UPDATE 202 DUK asistat + remediere SAF-T ✅
  2.12.179 → UPDATE 199 Generator SAF-T conform structural XSD ✅
  2.12.180 → UPDATE 200 Nomenclatoare SAF-T + integrare DUK ✅
  2.12.251 → UPDATE 271 Adevăr proiect + audit local ✅
  2.12.252 → UPDATE 272 Split rute update sistem ✅
  2.12.253 → UPDATE 273 Split rute backup sistem ✅
  2.12.254 → UPDATE 274 Split rute utilizatori si roluri ✅
  2.12.255 → UPDATE 275 Split rute setari sistem ✅
  2.12.256 → UPDATE 276 Split rute licenta sistem ✅
  2.12.257 → UPDATE 277 Split rute departamente sistem ✅
  2.12.258 → UPDATE 278 Split rute database sistem ✅
  2.12.259 → UPDATE 279 Split navigatie HR frontend ✅
  2.12.260 → UPDATE 280 Split header si filtre HR frontend ✅
  2.12.261 → UPDATE 281 Split dashboard HR frontend ✅
  2.12.262 → UPDATE 282 Split inbox HR frontend ✅
  2.12.263 → UPDATE 283 Split lista angajati HR frontend ✅
  2.12.264 → UPDATE 284 Split pontaj HR frontend ✅
  2.12.265 → UPDATE 285 Split pontaj avansat HR frontend ✅
  2.12.266 → UPDATE 286 Split ture si program HR frontend ✅
  2.12.267 → UPDATE 287 Split modal tura HR frontend ✅
  2.12.268 → UPDATE 288 Split tichete masa HR frontend ✅
  2.12.269 → UPDATE 289 Split training si evaluari HR frontend ✅
  2.12.270 → UPDATE 290 Documente Word-first ✅
  2.12.271 → UPDATE 291 Smoke suite module read-only ✅
  2.12.272 → UPDATE 292 Split echipamente HR frontend ✅
  2.12.273 → UPDATE 293 Split echipamente fisa angajat HR ✅
  2.12.274 → UPDATE 294 Split modaluri echipamente HR ✅
  2.12.275 → UPDATE 295 Split profil angajat HR ✅
  2.12.276 → UPDATE 296 Split date personale fisa angajat HR ✅
  2.12.277 → UPDATE 297 Split pontaj si concedii fisa angajat HR ✅
  2.12.278 → UPDATE 298 Split scadente si Kiosk fisa angajat HR ✅
  2.12.279 → UPDATE 299 Split flux onboarding/offboarding fisa angajat HR ✅
  2.12.280 → UPDATE 300 Split contracte si transferuri fisa angajat HR ✅
  2.12.281 → UPDATE 301 Split dosar angajat HR ✅
  2.12.282 → UPDATE 302 Split modal angajat HR ✅
  2.12.283 → UPDATE 303 Split modaluri concedii si salarizare medicala HR ✅
  2.12.284 → UPDATE 304 Split modal compensare banca de ore HR ✅
  2.12.285 → UPDATE 305 Split modal evaluari HR ✅
  2.12.286 → UPDATE 306 Split modal import angajati HR ✅
  2.12.287 → UPDATE 307 Split modal export pontaj Nexus HR ✅
  2.12.288 → UPDATE 308 Split modal editare zi pontaj HR ✅
  2.12.289 → UPDATE 309 Split modal editare sablon document HR ✅
  2.12.290 → UPDATE 310 Split modal testare sablon Word HR ✅
  2.12.291 → UPDATE 311 Split carcasa modal fisa angajat HR ✅
  2.12.292 → UPDATE 312 Split router taburi fisa angajat HR ✅
  2.12.293 → UPDATE 313 Split documente HR frontend ✅
  2.12.294 → UPDATE 314 Productizare comerciala modulara ✅
  2.12.295 → UPDATE 315 Catalog module active si onboarding organizatie ✅
  2.12.296 → UPDATE 316 Split functii print documente HR ✅
  2.12.297 → UPDATE 317 Helper contextual reutilizabil UI ✅
  2.12.298 → UPDATE 318 Helper contextual module operationale ✅
  2.12.299 → UPDATE 319 Directie internationala si verticale comerciale ✅
  2.12.300 → UPDATE 320 Profil international organizatie ✅
  2.12.301 → UPDATE 321 Registry reguli pe tara ✅
  2.12.302 → UPDATE 322 Defaulturi fiscale din registry tara ✅
  2.12.303 → UPDATE 323 Declaratii fiscale lunare din registry tara ✅
  2.12.304 → UPDATE 324 Centre cost generice si legaturi Controlling ✅
  2.12.305 → UPDATE 325 Demo comercial generic ✅
  2.12.306 → UPDATE 326 Restart robust dupa update ✅
  2.12.307 → UPDATE 327 Health rapid MSSQL ✅
  2.12.308 → UPDATE 328 Setari rapide fara verificare schema automata ✅
  2.12.309 → UPDATE 329 PIUSI status rapid in Setari ✅
  2.12.310 → UPDATE 330 Scheduler PIUSI cu backoff si log rar ✅
  2.12.311 → UPDATE 331 Release check pentru pachete update ✅
  2.12.312 → UPDATE 332 Release check integrat in pachetarea ZIP ✅
  2.12.313 → UPDATE 333 Status update si restart in UI ✅
  2.12.314 → UPDATE 334 Fundatie Contract Management ✅
  2.12.315 → UPDATE 335 UI minimal Contract Management ✅
  2.12.316 → UPDATE 336 Legare documente sursa la contract ✅
  2.12.317 → UPDATE 337 Selector contract in documente sursa ✅
  2.12.318 → UPDATE 338 Contracte in Achizitii si Receptii ✅
  2.12.319 → UPDATE 339 Contracte in Referate ✅
  2.12.320 → UPDATE 340 Dosar operational contract ✅
  2.12.321 → UPDATE 341 Manageri si remindere contracte ✅
  2.12.322 → UPDATE 342 Task-uri operationale contract ✅
  2.12.323 → UPDATE 343 Ticketing pentru task-uri contract ✅
  2.12.324 → UPDATE 344 Cockpit dosar contract ✅
  2.12.325 → UPDATE 345 Fișă printabilă contract ✅
  2.12.326 → UPDATE 346 Raport portofoliu contracte ✅
  2.12.327 → UPDATE 347 Export Excel portofoliu contracte ✅
  2.12.328 → UPDATE 348 Atașamente pe contract ✅
  2.12.329 → UPDATE 349 Acte adiționale pe contract ✅
  2.12.330 → UPDATE 350 Startup robust dupa Windows Update ✅
  2.12.331 → UPDATE 351 Act aditional cu fisier atasat ✅
  2.12.332 → UPDATE 352 Timeline dosar contract ✅
  2.12.333 → UPDATE 353 Contracte cu risc ✅
  2.12.334 → UPDATE 354 Checklist completitudine contract ✅
  2.12.335 → UPDATE 355 Plan rapid de acțiune contract ✅
  2.12.336 → UPDATE 356 Task din acțiune contract ✅
  2.12.337 → UPDATE 357 Acțiuni contract cu task legat ✅
  2.12.338 → UPDATE 358 Dashboard comercial generic ✅
  2.12.339 → UPDATE 359 Închidere controlată contract ✅
  2.12.340 → UPDATE 360 Redeschidere controlată contract ✅
  2.12.341 → UPDATE 361 Anulare controlată contract ✅
  2.12.342 → UPDATE 362 Reactivare controlată contract anulat ✅
  2.12.343 → UPDATE 363 Audit portofoliu contracte ✅
  2.12.344 → UPDATE 364 Filtre avansate portofoliu contracte ✅
  2.12.345 → UPDATE 365 Rapoarte portofoliu contracte filtrate ✅
  2.12.346 → UPDATE 366 Vederi salvate portofoliu contracte ✅
  2.12.347 → UPDATE 367 Acțiuni rapide portofoliu contracte ✅
  2.12.348 → UPDATE 368 Mini-modal asignare manager contract ✅
  2.12.349 → UPDATE 369 Upload rapid document semnat contract ✅
  2.12.350 → UPDATE 370 Acțiuni în masă și radar executiv contracte ✅
  2.12.351 → UPDATE 371 Asistent operațional contracte ✅
  2.12.352 → UPDATE 372 Priorități azi în dashboard ✅
  2.12.353 → UPDATE 373 Priorități dashboard pe profil utilizator ✅
  2.12.354 → UPDATE 374 Contabilitate hub și roadmap task-uri ✅
  2.12.355 → UPDATE 375 Fundație Task Management ✅
  2.12.356 → UPDATE 376 Delegare task-uri pe departament ✅
  2.12.357 → UPDATE 377 Manager direct pentru task-uri ✅
  2.12.358 → UPDATE 378 Panou organigramă operațională ✅
  2.12.359 → UPDATE 379 Task-uri Echipa mea ✅
  2.12.360 → UPDATE 380 Task-uri în Kiosk și sidebar ✅
  2.12.361 → UPDATE 381 Acțiuni rapide task în Kiosk ✅
  2.12.362 → UPDATE 382 Dovezi atașate pe task din Kiosk ✅
  2.12.363 → UPDATE 383 Șabloane rapide pentru task-uri ✅
  2.12.364 → UPDATE 384 Șabloane personalizate pentru task-uri ✅
  2.12.365 → UPDATE 385 Legare generică task de surse ERP ✅
  2.12.366 → UPDATE 386 Task ERP din dosar contract ✅
  2.12.367 → UPDATE 387 Deep-link dosar contract din task ✅
  2.12.368 → UPDATE 388 Sursa task-ului în Kiosk ✅
  2.12.369 → UPDATE 389 Direcție Email ERP organizațional ✅
  2.12.370 → UPDATE 390 Fundație Inbox ERP ✅
  2.12.371 → UPDATE 391 Task din email Inbox ERP ✅
  2.12.372 → UPDATE 392 Document din email Inbox ERP ✅
  2.12.373 → UPDATE 393 Sursa email vizibilă în Documente ✅
  2.12.374 → UPDATE 394 Task din document ✅
  2.12.375 → UPDATE 395 Task-uri legate în dosarul documentului ✅
  2.12.376 → UPDATE 396 Task-uri filtrate din dosarul documentului ✅
  2.12.377 → UPDATE 397 Compunere și trimitere email din Mesaje ✅
  2.12.378 → UPDATE 398 CC/BCC și atașamente la email ✅
  2.12.379 → UPDATE 399 Răspunde și redirecționează email ✅
  2.12.380 → UPDATE 400 Drafturi email în Inbox ERP ✅
  2.12.381 → UPDATE 401 Hotfix configurare SMTP ✅
  2.12.382 → UPDATE 402 Diagnostic SMTP prietenos ✅
  2.12.383 → UPDATE 403 Acțiuni rapide Inbox ERP ✅
  2.12.384 → UPDATE 404 Acțiuni în masă Inbox ERP ✅
  2.12.385 → UPDATE 405 Primire email prin IMAP ✅
  2.12.386 → UPDATE 406 Configurare IMAP explicită ✅
  2.12.387 → UPDATE 407 Sincronizare automată Inbox IMAP ✅
  2.12.388 → UPDATE 408 Status sincronizare Inbox IMAP ✅
  2.12.389 → UPDATE 409 Reguli automate email Inbox ✅
  2.12.390 → UPDATE 410 Reguli email vizibile și testabile ✅
  2.12.391 → UPDATE 411 Legare email de entități ERP ✅
  2.12.392 → UPDATE 412 Emailuri legate vizibile în dosare ERP ✅
  2.12.393 → UPDATE 413 Deep-link direct către emailuri ERP ✅
  2.12.394 → UPDATE 414 Modal detalii email ERP ✅
  2.12.395 → UPDATE 415 Download atașamente email ERP ✅
  2.12.396 → UPDATE 416 Import IMAP cu atașamente descărcabile ✅
  2.12.397 → UPDATE 417 Document ERP din atașament email ✅
  2.12.398 → UPDATE 418 Descărcare atașament sursă din document ✅
  2.12.399 → UPDATE 419 Audit complet aplicație și hotfix Inbox ERP ✅
  2.12.400 → UPDATE 420 Exporturi și printări fără token în URL ✅
  2.12.401 → UPDATE 421 Notificări live fără token real în URL ✅
  2.12.402 → UPDATE 422 Confirmări UX PAAP fără dialoguri native ✅
  2.12.403 → UPDATE 423 Confirmări UX contracte cu motiv auditat ✅
  2.12.404 → UPDATE 424 Confirmări UX în Setări ✅
  2.12.405 → UPDATE 425 Confirmări UX în Gestiune ✅
  2.12.406 → UPDATE 426 Confirmări UX HR ✅
  2.12.407 → UPDATE 427 Confirmări UX Salarizare ✅
  2.12.408 → UPDATE 428 Confirmări UX Facturi și Registru jurnal ✅
  2.12.409 → UPDATE 429 Confirmări UX Controlling și raportări contabile ✅
  2.12.410 → UPDATE 430 Confirmări UX Producție, Așternere, Documente și Dashboard ✅
  2.12.411 → UPDATE 431 Confirmări UX Mecanizare, FAZ și operațiuni contabile ✅
  2.12.412 → UPDATE 432 Dashboard comercial generic și onboarding modular ✅
  2.12.413 → UPDATE 433 Shell comercial generic ✅
  2.12.414 → UPDATE 434 Module operaționale cu limbaj generic ✅
  2.12.415 → UPDATE 435 Seed-uri și exemple comerciale generice ✅
  2.12.416 → UPDATE 436 Curățare onboarding și demo comercial ✅
  2.12.417 → UPDATE 437 Demo și smoke test cu limbaj comercial ✅
  2.12.418 → UPDATE 438 Checklist primii pași după instalare ✅
  2.12.419 → UPDATE 439 Checklist onboarding inteligent ✅
  2.12.420 → UPDATE 440 Asistent configurare în Setări ✅
  2.12.421 → UPDATE 441 Asistent configurare pliabil ✅
  2.12.422 → UPDATE 442 Asistent discret Contracte ✅
  2.12.423 → UPDATE 443 Asistent discret Achiziții ✅
  2.12.424 → UPDATE 444 Asistent discret Gestiune ✅
  2.12.425 → UPDATE 445 Asistent discret HR ✅
  2.12.426 → UPDATE 446 Asistent discret Documente ✅
  2.12.427 → UPDATE 447 Asistent discret Mecanizare + hotfix Inbox HR ✅
  2.12.428 → UPDATE 448 Asistent discret Contabilitate ✅
  2.12.429 → UPDATE 449 Flux simplu Salarizare ✅
  2.12.430 → UPDATE 450 Flux simplu Facturi ✅
  2.12.431 → UPDATE 451 Flux simplu Trezorerie ✅
  2.12.432 → UPDATE 452 Flux simplu Închidere lună ✅
  2.12.433 → UPDATE 453 Flux simplu Situații financiare ✅
  2.12.434 → UPDATE 454 Flux simplu Balanță ✅
  2.12.435 → UPDATE 455 Flux simplu Cartea Mare ✅
  2.12.436 → UPDATE 456 Flux simplu Fișă cont ✅
  2.12.437 → UPDATE 457 Flux simplu Profit și pierdere ✅
  2.12.438 → UPDATE 458 Flux simplu Registru jurnal ✅
  2.12.439 → UPDATE 459 Flux simplu Operațiuni contabile ✅
  2.12.440 → UPDATE 460 Flux simplu Centru fiscal ✅
  2.12.441 → UPDATE 461 Flux simplu Declarații diverse ✅
  2.12.442 → UPDATE 462 Flux simplu Audit fiscal ✅
  2.12.443 → UPDATE 463 Flux simplu Plan de conturi ✅
  2.12.444 → UPDATE 464 Flux simplu Solduri inițiale ✅
  2.12.445 → UPDATE 465 Flux simplu Șabloane note contabile ✅
  2.12.446 → UPDATE 466 Flux simplu Jurnale contabile ✅
  2.12.447 → UPDATE 467 Flux simplu Terți contabili ✅
  2.12.448 → UPDATE 468 Flux simplu Alerte legislative ✅
  2.12.449 → UPDATE 469 Flux simplu ANAF / e-Factura ✅
  2.12.450 → UPDATE 470 Flux simplu Controlling ✅
  2.12.451 → UPDATE 471 Flux simplu Gestiune / Depozit ✅
  2.12.452 → UPDATE 472 Flux simplu Contract Management ✅
  2.12.453 → UPDATE 473 Flux simplu Achiziții ✅
  2.12.454 → UPDATE 474 Flux simplu HR ✅
  2.12.455 → UPDATE 475 Flux simplu Producție / Operațiuni ✅
  2.12.456 → UPDATE 476 Flux simplu Referate ✅
  2.12.457 → UPDATE 477 Flux simplu Parc & Resurse ✅
  2.12.458 → UPDATE 478 Dashboard generic și flux simplu Documente ✅
  2.12.459 → UPDATE 479 Workflow configurabil vizibil în Setări ✅
  2.12.460 → UPDATE 480 Editor șabloane workflow documente ✅
  2.12.461 → UPDATE 481 Aplicare șabloane workflow la lansarea documentelor ✅
  2.12.462 → UPDATE 482 Testare flux workflow în Setări ✅
  2.12.463 → UPDATE 483 Condiții ghidate workflow documente ✅
  2.12.464 → UPDATE 484 Reguli workflow structurate ✅
  2.12.465 → UPDATE 485 Evaluator simulator workflow ✅
  2.12.466 → UPDATE 486 Diagnostic workflow configurabil ✅
  2.12.467 → UPDATE 487 Aplicare condition_rule în engine ✅
  2.12.468 → UPDATE 488 Reparare ghidată workflow ✅
  2.12.469 → UPDATE 489 Pași workflow săriți în dosar ✅
  2.12.470 → UPDATE 490 Editor workflow responsive ✅
  2.12.471 → UPDATE 491 Audit workflow persistat ✅
  2.12.472 → UPDATE 492 Audit decizii workflow document ✅
  2.12.473 → UPDATE 493 Acțiuni rapide dosar document ✅
  2.12.474 → UPDATE 494 Radar compact documente Dashboard ✅
  2.12.475 → UPDATE 495 Filtre rapide Inbox Documente ✅
  2.12.476 → UPDATE 496 Acțiuni în masă Documente ✅
  2.12.477 → UPDATE 497 Catalog manual Parc & Resurse ✅
  2.12.478 → UPDATE 498 Alertă carburant estimat Mecanizare ✅
  2.12.479 → UPDATE 499 Praguri configurabile carburant estimat ✅
  2.12.480 → UPDATE 500 Carburant pe resursă Mecanizare ✅
  2.12.481 → UPDATE 501 Filtre și export carburant pe resursă ✅
  2.12.482 → UPDATE 502 Control capacitate rezervor Mecanizare ✅
  2.12.483 → UPDATE 503 Filtru rezervor nesetat Mecanizare ✅
  2.12.484 → UPDATE 504 Editare rapidă date tehnice carburant ✅
  2.12.485 → UPDATE 505 Editare completă resurse parc ✅
  2.12.486 → UPDATE 506 Arhivare controlată resurse parc ✅
  2.12.487 → UPDATE 507 Timeline fișă resursă parc ✅
  2.12.488 → UPDATE 508 Watchlist documente urmărite ✅
  2.12.489 → UPDATE 509 Notificări documente urmărite ✅
  2.12.490 → UPDATE 510 Radar Dashboard documente urmărite ✅
  2.12.491 → UPDATE 511 Citire automată activitate documente urmărite ✅
  2.12.492 → UPDATE 512 Acțiuni rapide radar documente urmărite ✅
  2.12.493 → UPDATE 513 Grupare activitate documente urmărite ✅

NEXT BUILD: la cerere sau după o serie majoră de update-uri
  → InfraFlow-Server-Setup-v[package.version].exe
  → InfraFlow-Client-Setup-v[package.version].exe
  → Versiunea citită automat din package.json
  → Script: scripts/build-installer.ps1

FORMAT VERSIUNE: MAJOR.MINOR.PATCH
  MAJOR: schimbări arhitecturale majore
  MINOR: module noi complete (build nou)
  PATCH: fix-uri și îmbunătățiri (update)
```

---

## 8. INTEGRĂRI EXTERNE

```
GPS — urmariregps.ro ✅
  Auth: POST login → PHPSESSID cookie
  Date: GET vehicule → XML parser
  Re-auth: automată la sesiune expirată
  Polling: 30 secunde
  Status: FUNCȚIONAL ca adaptor configurabil per client

SMTP Email
  Provider: SMTP2GO / Gmail / SMTP client
  DNS: configurabil per domeniul clientului
  Fallback: Gmail App Password pentru instalări mici
  Direcție: Inbox ERP organizațional în aplicație, fără email personal
  Status Inbox ERP: fundație internă + categorii + filtre + task/document din email + sursă vizibilă în Documente + trimitere email din Mesaje + CC/BCC și atașamente + răspuns/forward + drafturi + SMTP stabilizat + diagnostic prietenos + acțiuni rapide/în masă + primire IMAP manuală + configurare IMAP explicită + autosync IMAP + status autosync vizibil + reguli automate email + reguli vizibile/testabile + legare email de entități ERP + emailuri legate vizibile în dosare ERP + deep-link direct către emailuri ERP + modal detalii email ERP + download atașamente email ERP + import IMAP cu atașamente descărcabile + document ERP din atașament email + descărcare atașament sursă din document + hotfix eroare atașament Inbox ERP ✅

ANAF / e-Factura
  Status: Export XML manual (utilizatorul urcă în SPV)
  Viitor: Integrare automată SPV după înregistrare ANAF
  Condiție: site infraflow.ro live + aplicație publicată

Nexus Salarii
  Status: Export Excel format compatibil (UPDATE 009)
  Viitor: Înlocuire completă cu modul Salarizare intern

Cloudflare Tunnel
  URL: domeniu configurabil per instalare
  Status: suportat ✅

Anthropic API (viitor)
  Model principal: claude-haiku-4-5 (operațiuni simple)
  Model avansat: claude-sonnet-4-6 (analize, rapoarte)
  Cont: SRL Constantin (factură deductibilă)
  Markup clienți: 3-5x față de cost Anthropic
```

---

## 9. REFERINȚE DOCUMENTE

```
Contabilitate:
  HelpSC.chm        — Manual complet Saga C (97 pagini)
  saga.zip           — Screenshots Saga + PDF declarații ANAF

HR / Pontaj:
  MODEL_PONTAJ_2026_rev_1.xlsx — Format import Nexus
                                  (2 rânduri/angajat, Legenda 15 tipuri)
  programarea-concediilor-de-odihna_achizitii.doc — Format CO

Achiziții / PAAP:
  sablon.xlsx        — Format oficial SEAP pentru PAAP
                       (14 coloane, date istorice de referință 2025)
  lista-coduri-cpv-romana-engleza.xls — 9454 coduri CPV RO+EN
  Anexa-3_7-Model-procedura-operationala-achizitii.docx

Echipamente:
  tABELE_MARIMI_ECHIPAMENT.xlsx — Mărimi per departament
                                   Coduri: Ares 82/83, 4100217

Control Intern:
  Chestionar_autoevaluare_2025.docx — Format SCIM de referință
  your-scim.herokuapp.com           — Platformă referință SCIM
```

---

## 10. PROMPTURI CODEX — UPDATES ÎN LUCRU

### Regulă generală pentru toate prompturile:
```
Lucrezi pe InfraFlow. Citește AGENTS.md integral.
[descrierea task-ului]
Creează updates/UPDATE_00X_descriere.md
Actualizează package.json → version: "2.10.X"
```

### UPDATE 006 — Modul Referate
```
Lucrezi pe InfraFlow. Citește AGENTS.md integral.

TASK: Implementează modulul complet Referate
(Aprovizionare + Servicii) cu flux 11 pași.

TABELE NOI (db/migrations/012_referate.sql):
  procurement.referate:
    id, uuid, numar INT, serie NVARCHAR(10),
    data_intocmire DATE, tip NVARCHAR(20),
    departament_id FK→core.departments,
    intocmit_de FK→core.users,
    furnizor_id FK→procurement.suppliers,
    furnizor_manual NVARCHAR(200),
    observatii NVARCHAR(MAX),
    status NVARCHAR(30) DEFAULT 'draft',
    valoare_referat DECIMAL(15,2),
    valoare_factura DECIMAL(15,2),
    diferenta_prc AS calculat automat,
    nr_inregistrare NVARCHAR(50),
    data_inregistrare DATETIME,
    created_at DATETIME DEFAULT GETDATE(),
    cancelled_at, cancelled_by, cancelled_reason

  procurement.referate_items:
    id, referat_id FK, nr_crt INT,
    denumire NVARCHAR(300), caracteristici NVARCHAR(500),
    um NVARCHAR(30), cantitate DECIMAL(15,3),
    pret_unitar DECIMAL(15,2), valoare_tva DECIMAL(15,2),
    stoc_magazie DECIMAL(15,3), material_id FK→inventory.materials,
    cpv_cod NVARCHAR(20)

  procurement.referate_flux:
    id, referat_id FK, pas NVARCHAR(50),
    actiune NVARCHAR(20), user_id FK,
    data_actiune DATETIME, observatii NVARCHAR(500)

  procurement.referate_counter:
    an INT PK, last_nr INT DEFAULT 0

FLUX 11 PAȘI:
  draft → inregistrat → la_achizitii → la_gestionar
  → cfp → contabil_sef → dir_adjunct → secretariat_2
  → dir_general → secretariat_final → achizitii_final
  → aprobat | respins

PERMISIUNI NOI:
  referate:view, referate:create, referate:achizitii,
  referate:gestionar, referate:secretariat, referate:cfp,
  referate:contabil_sef, referate:dir_adjunct,
  referate:dir_general, referate:receptie

BACKEND (server/modules/referate/routes.js):
  GET    /api/referate
  POST   /api/referate
  GET    /api/referate/:id
  POST   /api/referate/:id/inainteaza
  POST   /api/referate/:id/receptie
  GET    /api/referate/:id/pdf
  GET    /api/referate/stats

LOGICĂ SPECIALĂ:
  - Stoc magazie preluat automat din inventory.materials
  - La aprobare dir_general → creare automată comandă
  - La recepție factură > referat cu >5% → flux suplimentar
  - Număr automat per an (referate_counter)
  - PDF identic cu formularul fizic din poză
    (7 coloane semnătură: Întocmit|Achiziții|Gestionar|
     Economist|Contabil Șef|Dir.Adj|Dir.General)

FRONTEND:
  - Pagina /referate cu tabs: Toate|Draft|În aprobare|
    Aprobate|Respinse
  - Timeline flux vertical pe pagina detaliu
  - Modal creare cu tabel items + autocomplete materiale
  - Buton [📄 Tipărește PDF]
  - Alertă roșie dacă factură > referat cu >5%

Creează updates/UPDATE_006_modul_referate.md
Actualizează package.json → version: "2.10.6"
```

### UPDATE 007 — e-Factura Fix
```
Lucrezi pe InfraFlow. Citește AGENTS.md integral.

PROBLEMA 1 — Câmpuri nu se pot edita în formular:
  Găsește în componenta modalului facturii
  de ce inputs sunt readonly/disabled.
  Verifică: atribut readonly/disabled hardcodat,
  condiție JS, CSS pointer-events:none,
  overlay transparent.
  Fix: formular nou → toate câmpurile editabile.
  Status draft → editabil.
  Status validat → readonly + buton [Editează] admin.

PROBLEMA 2 — TVA 21% lipsă:
  Înlocuiește lista TVA: [19, 9, 5, 0]
  Cu: [21, 19, 9, 5, 0]
  Default = valoarea din app_settings.tva_implicit
  sau 21 dacă nu există setarea.

PROBLEMA 3 — Cota din settings nu se aplică:
  La deschidere formular factură nou →
  prima linie TVA = valoarea din app_settings.

Creează updates/UPDATE_007_efactura_fix.md
Actualizează package.json → version: "2.10.7"
```

### UPDATE 008 — PAAP Complet + CPV
```
Lucrezi pe InfraFlow. Citește AGENTS.md integral.

TASK PART 1 — Coduri CPV (9454 înregistrări):

Tabele (db/migrations/013_cpv.sql):
  nomenclator.cpv_codes:
    id, cod NVARCHAR(20) UNIQUE, denumire_ro NVARCHAR(500),
    denumire_en NVARCHAR(500), activ BIT, created_at,
    created_by INT NULL (NULL = import sistem)
  INDEX pe cod și denumire_ro.

Script import (scripts/import-cpv.js):
  Citește db/seeds/cpv_codes.json (9454 înregistrări)
  INSERT cu verificare UNIQUE (nu duplică)
  Log: "Importate: X, Duplicate sărite: Y"
  Rulat o singură dată la setup.

API:
  GET /api/cpv/search?q=TERMEN&lang=ro → max 20 rezultate
  GET /api/cpv/:cod
  POST /api/cpv → adăugare manuală cu validare unicitate
                  format: /^\d{8}-\d$/
                  eroare clară dacă există deja
  PUT /api/cpv/:cod → editare denumire

Component reutilizabil CPVSelector:
  Input text cu autocomplete (minim 2 caractere)
  Dropdown live cu max 20 rezultate
  Dacă nu găsește → [+ Adaugă cod nou] → modal
  Format afișat: [31532700-1] Abajururi

TASK PART 2 — PAAP Complet:

Tabele (db/migrations/013_cpv.sql continuare):
  procurement.paap:
    id, an INT, cpv_cod, cpv_denumire (cache),
    material NVARCHAR(300), um, cantitate,
    valoare_estimata, procedura, trimestru TINYINT,
    valoare_executata DEFAULT 0, sursa,
    created_at, created_by

  procurement.paap_executie:
    id, paap_id FK, factura_id, comanda_id,
    valoare, data, note

API:
  GET /api/paap?an=2026 → cu valoare_ramasa și procent
  POST /api/paap → adăugare manuală
  POST /api/paap/genereaza-din-istoric → Body: {an: 2027}
    Analizează comenzile an-1, inserează cu +5% inflație
  PUT /api/paap/:id
  DELETE /api/paap/:id (doar dacă executat=0)
  GET /api/paap/raport?an=2026

Frontend (completează UI existent din Achiziții→Plan anual):
  Tabel cu coloane: CPV|Material|UM|Cant|
    Val.Plan|Executat|Rămas|%|Procedură|Trim|Acțiuni
  Bară progres colorată: <50% verde, 50-90% galben,
    >90% roșu, >100% roșu intens + ⚠️
  Buton [+ Adaugă poziție] cu CPVSelector
  Procedură sugerată automat după valoare:
    <135.060 → Achiziție directă
    135.060-668.280 → Procedură simplificată
    >668.280 → Licitație deschisă
  Buton [Generează din istoric] cu confirmare
  Buton [Exportă Excel] format oficial SEAP
    (identic cu sablon.xlsx de referință — 14 coloane)
  Footer cu totaluri

Alerte automate:
  La consum >90% din plafon → notificare
  La depășire 100% → alertă URGENTĂ

CPVSelector integrat în:
  procurement.referate_items (ALTER TABLE ADD cpv_cod)
  procurement.orders (ALTER TABLE ADD cpv_cod)
  inventory.materials (ALTER TABLE ADD cpv_cod)

Creează updates/UPDATE_008_paap_cpv.md
Actualizează package.json → version: "2.10.8"
```

### UPDATE 009 — Export PAAP + Pontaj Nexus
```
Lucrezi pe InfraFlow. Citește AGENTS.md integral.

TASK 1 — Export PAAP format SEAP oficial:
  Butonul [Exportă Excel] din Plan Anual →
  format EXACT din sablon.xlsx de referință.
  
  14 coloane obligatorii:
  1. Obiectul contractului
  2. Cod și denumire CPV (format: "09134200-9 Motorina")
  3. Tip procedura (Achizitie directa / Procedura
     simplificata / Licitatie deschisa / etc.)
  4. Tipul contractului: "Contract de achizitii publice"
  5. Responsabil achizitie
  6. Valoarea estimata RON fara TVA
  7. Valoarea estimata RON cu TVA (col6 * 1.21)
  8. Valoarea estimata EUR fara TVA (col6 / curs BNR)
  9. Data estimata incepere (DD.MM.YYYY)
  10. Data estimata finalizare (DD.MM.YYYY)
  11. Modalitatea de finantare
  12. Obiectivul din strategia locala
  13. Modalitatea de desfasurare (Online/Offline)
  14. Unitatea responsabila
  
  Header rândul 2, date de la rândul 3.
  Filename: PAAP_[AN]_[YYYY-MM-DD].xlsx

TASK 2 — Export Pontaj format Nexus:
  REFERINȚĂ EXACTĂ: MODEL_PONTAJ_2026_rev_1.xlsx
  Formatul trebuie IDENTIC — Nexus face import
  strict după poziția coloanelor.
  
  ROW 1: "Nume Societate: [company_name] CIF: [cif]"
  ROW 2: "[Dept] - Foaie colectiva prezenta [LUNA] [AN]"
  ROW 3: Header coloane (Nr.Crt|Marcă|Nume|1..31|
    Total ore|CO|CM|CED|CFP|ABS|CIC|SUPL|SL|noapte|
    weekend|cercetare|supl ant1/2|compensate LS|
    %supl|Norma|Zile lucratoare|A152|consemn 15%|
    Centru cost)
  ROW 4: Ziua săptămânii (L/Ma/Mi/J/V/S/D)
  ROW 5: Z/N (lucrătoare/nelucrătoare)
  
  Per angajat 2 rânduri:
    Rând A: ore numerice per zi
    Rând B: coduri tip absență (CO/CM/etc)
  
  Formatare: weekend gri #D9D9D9,
    sărbători roșu #FFB3B3,
    CO galben, CM albastru deschis, ABS roșu
  
  Sheet "Legenda" cu toate 15 abrevierile.
  Footer: "Intocmit: [user]" + spațiu semnătură.
  
  Buton în HR→Pontaj: [📥 Export Nexus]
  Modal: selectezi luna + departament
  Filename: Pontaj_[Dept]_[LUNA]_[AN].xlsx

Creează updates/UPDATE_009_export_paap_pontaj.md
Actualizează package.json → version: "2.10.9"
```

### UPDATE 010 — Echipamente Protecție HR
```
Lucrezi pe InfraFlow. Citește AGENTS.md integral.

TASK: Modul gestiune echipamente protecție angajați.
REFERINȚĂ: tABELE_MARIMI_ECHIPAMENT.xlsx (referință istorică)

TABELE NOI (db/migrations/014_echipamente.sql):
  hr.echipamente_tipuri:
    id, denumire, tip_marimi (numeric/text),
    durata_luni, activ
    
  hr.echipamente_marimi:
    id, tip_id FK, marime, ordine
    
  hr.echipamente_departament:
    id, departament_id FK, tip_id FK,
    culoare, cod_articol, obligatoriu
    
  hr.angajat_echipamente:
    id, angajat_id FK, tip_id FK, marime,
    updated_at, updated_by
    
  hr.echipamente_dotari:
    id, angajat_id FK, tip_id FK, marime,
    data_dotare DATE, cantitate, stare,
    data_expirare AS calculat, observatii,
    inregistrat_de

SEED DATE (din tABELE_MARIMI_ECHIPAMENT.xlsx):
  Tipuri: Salopetă(40-66,12luni), Bocanci(38-46,12luni),
    Cizme cauciuc(38-46,24luni), Jachetă(40-66,12luni),
    Pantalon(40-66,12luni), Vestă refl.(S-XL,12luni)
  
  Departamente + culori + coduri:
    Mecanizare → Bleomarin → Ares 82,83
    Asfalt → Portocaliu → 4100217
    Betoane → Bleomarin → 4100217
    St.Asfalt → Portocaliu → 4100217
    Canalizare → Bleomarin → 4100217
    Salubrizare → Kaki → Ares 82,83
    Circulație → Reflectorizant

API:
  GET /api/hr/echipamente/angajat/:id
  GET /api/hr/echipamente/raport-necesar
  GET /api/hr/echipamente/expirari
  POST /api/hr/echipamente/dotare
  GET /api/hr/echipamente/comanda-excel

FRONTEND:
  Tab [🦺 Echipamente] în fișa angajat:
    Secțiunea mărimi (dropdown per tip)
    Tabel istoric dotări cu data expirare
    Buton [+ Înregistrează dotare nouă]
  
  Pagina HR→Echipamente (3 tabs):
    Tab 1: Necesar per Departament
      (format identic tABELE_MARIMI_ECHIPAMENT.xlsx)
      Export Excel
    Tab 2: Expirări (30/60/90 zile)
    Tab 3: Comandă Furnizor (grupat pe cod articol)
      + Buton [🛒 Creează Referat Aprovizionare]
        CPV: 18114000-1 (Salopete) /
             18143000-3 (Echipamente protecție)

Creează updates/UPDATE_010_echipamente_hr.md
Actualizează package.json → version: "2.10.10"
```

---

## 11. BUILD PROCESS

```powershell
# Verifică versiunea curentă
cat package.json | Select-String "version"

# Build complet (citește versiunea automat)
.\scripts\build-installer.ps1

# Generează:
#   InfraFlow-Server-Setup-v2.10.10.exe
#   InfraFlow-Client-Setup-v2.10.10.exe

# Restart server (dacă rulează ca serviciu)
Restart-Service -Name "InfraFlow" -Force

# Găsește numele serviciului
Get-Service | Where-Object {$_.DisplayName -like "*Infra*"}
```

---

## 12. PROFIL COMERCIAL ȘI NOTE ISTORICE

```
InfraFlow este produs general, nu implementare dedicată unui client.

Profiluri comerciale urmărite:
  - firmă privată generală;
  - construcții / asfalt;
  - servicii publice;
  - instituție publică;
  - HR + salarizare;
  - contabilitate;
  - depozit / WMS;
  - logistică;
  - ecarisaj / servicii sanitar-veterinare;
  - enterprise complet.

Datele istorice de client pilot pot rămâne în backup-uri, update-uri
vechi sau documente de migrare, dar nu se folosesc ca fallback vizibil,
template implicit sau identitate de produs.

Orice dezvoltare nouă trebuie să poată funcționa pe o organizație demo
generică și pe o organizație reală configurată de utilizator.
Pentru funcționalități noi, limba, țara, moneda, template-urile și regulile
legislative trebuie tratate ca extensibile pe profil de țară, nu hardcodate
definitiv pentru o singură jurisdicție.
```

---

## 13. NOTĂ ARHITECTURALĂ — VIITOR

```
ACUM (Monolit funcțional modularizat gradual):
  server/app.js → montează rute Express pe module
  client/src → frontend React + Vite

DIRECȚIE (fără să strici ce merge):
  1. Extragere module → server/modules/*/routes.js
  2. TypeScript incremental pe module noi
  3. Frontend React (opțional, ultima etapă)
  4. Capacitor.js pentru mobile (după web SaaS)

PRINCIPIU: Codul care funcționează în producție
  nu se rescrie. Se extrage treptat.
  Fiecare extragere = comportament identic.
```

---

*AGENTS.md actualizat: 6 August 2026 | InfraFlow sursă v2.12.493*
*Actualizează acest fișier la orice schimbare majoră de arhitectură sau stare module.*
