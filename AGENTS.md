# AGENTS.md — InfraFlow ERP
> Citește acest fișier INTEGRAL înainte de orice acțiune.
> Toate deciziile respectă convențiile de aici.
> Ultima actualizare: 31 Mai 2026

---

## 1. CE ESTE ACEST PROIECT

InfraFlow este un ERP comercial self-hosted pentru instituții publice și firme private.
Dezvoltat solo de Constantin Constantin, Piatra Neamț.
Client pilot activ: **SC PUBLISERV SA** (CIF: RO9126534), Piatra Neamț.

**Versiune curentă sursă: v2.11.11** (build EXE v2.11.5 existent și funcțional)
**Versiune în lucru: hotfix v2.11.11**

Rulează pe **Windows cu SQL Server Express** (MSSQL).
Accesat din rețea locală + extern prin **Cloudflare Tunnel** (acasa.appnode.ro).
Frontend web + PWA + Electron desktop client.

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
| Frontend | Vanilla JS (app.js), HTML, CSS |
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
├── public/                    ← frontend (app.js, index.html, styles.css)
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

Gestiune / Depozit
  ✅ Materiale + categorii
  ✅ Intrări/Ieșiri stoc
  ✅ Transferuri departamente
  ✅ Inventariere
  ✅ Rapoarte zilnice/periodice
  ✅ Export Excel

Mecanizare / Fleet
  ✅ Evidență utilaje/vehicule
  ✅ Foi parcurs (PWA offline + semnătură)
  ✅ FAZ (fișe activitate zilnică)
  ✅ Odometru + consum combustibil
  ✅ Alerte scadențe ITP/RCA
  ✅ Import Autominder XML
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

Referate
  ✅ Referate Aprovizionare + Servicii (v2.10.6)
  ✅ Flux 11 pași aprobare
  ✅ PDF tipărit pentru dosar fizic
  ✅ Alertă diferență factură > 5%
  ✅ Integrare stocuri + comenzi automate

Resurse Umane
  ✅ Angajați + contracte
  ✅ Pontaj zilnic
  ✅ Export Pontaj Nexus pentru import salarii (v2.10.9)
  ✅ Cereri concediu (CO/CM/CFP/CED)
  ✅ Autorizații + scadențe
  ✅ Documente HR
  ✅ Echipamente protecție angajați (v2.10.10)

Servicii Publice
  ✅ Salubrizare (rute, colectări)
  ✅ Siguranța Circulației (indicatoare, marcaje)
  ✅ Deszăpezire
  ✅ Teren
  ✅ Mediu

ANAF / e-Factura
  ✅ UI creare factură (modal)
  ✅ Export XML UBL 2.1 CIUS-RO
  ✅ Căutare CIF ANAF
  ✅ Parteneri
  ✅ TVA 21% disponibil și implicit din settings (v2.10.7)
  ✅ Draft editabil + validată readonly/editare admin (v2.10.7)
  ❌  Integrare automată SPV (după înregistrare ANAF)

Workflow
  ✅ Engine flux documente
  ✅ Solicitări între departamente
  ✅ Notificări automate

Sistem
  ✅ Diagnostice
  ✅ Backup/Restore
  ✅ Update pachete
  ✅ Audit log
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
     (identic cu sablon.xlsx Publiserv)
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

  [ ] Modul SCIM — Control Intern Managerial
      → Proceduri operaționale (Ordinul 600/2018)
      → Registru riscuri
      → Chestionare autoevaluare (format Publiserv)
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

  [ ] Multi-limbă EN/RO
      → i18n în frontend
      → Toate labelurile/mesajele traduse

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
VERSIUNE CURENTĂ SURSĂ: 2.11.11
BUILD EXE EXISTENT: 2.11.5 ✅

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

NEXT BUILD: v2.11.11
  → InfraFlow-Server-Setup-v2.11.11.exe
  → InfraFlow-Client-Setup-v2.11.11.exe
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
  Status: FUNCȚIONAL (23 vehicule Publiserv)

SMTP Email
  Provider: SMTP2GO (în configurare Publiserv)
  DNS: TXT records în Cloudflare pentru publiserv.eu
  Fallback: Gmail App Password

ANAF / e-Factura
  Status: Export XML manual (utilizatorul urcă în SPV)
  Viitor: Integrare automată SPV după înregistrare ANAF
  Condiție: site infraflow.ro live + aplicație publicată

Nexus Salarii
  Status: Export Excel format compatibil (UPDATE 009)
  Viitor: Înlocuire completă cu modul Salarizare intern

Cloudflare Tunnel
  URL: acasa.appnode.ro
  Status: FUNCȚIONAL ✅

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
                       (14 coloane, date reale Publiserv 2025)
  lista-coduri-cpv-romana-engleza.xls — 9454 coduri CPV RO+EN
  Anexa-3_7-Model-procedura-operationala-achizitii.docx

Echipamente:
  tABELE_MARIMI_ECHIPAMENT.xlsx — Mărimi per departament
                                   Coduri: Ares 82/83, 4100217

Control Intern:
  Chestionar_autoevaluare_2025.docx — Format SCIM Publiserv
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
    (identic cu sablon.xlsx Publiserv — 14 coloane)
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
  format EXACT din sablon.xlsx Publiserv.
  
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
REFERINȚĂ: tABELE_MARIMI_ECHIPAMENT.xlsx (Publiserv)

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

## 12. INFORMAȚII CLIENT PILOT

```
Societate: SC PUBLISERV SA
CUI: RO9126534
Localitate: Piatra Neamț, Neamț
URL acces: acasa.appnode.ro (Cloudflare Tunnel)
Email: publiserv.eu (DNS la control panel hosting)
GPS: urmariregps.ro — 23 vehicule active
Nexus: salarii (de înlocuit cu modul intern)
SMTP: în configurare (SMTP2GO + DNS Cloudflare)
Departamente active: Achiziții, Mecanizare,
  Gestiune, HR, Producție, Tehnic, Salubrizare,
  Siguranța Circulației, Deszăpezire

Persoane cheie:
  Administrator: Constantin Constantin
    (Expert Achiziții Publice, Marcă 150)
  Director General: Movila Petcu Victor
  Director Adjunct: Miloiu Cristian Cosmin
  Contabil Șef: Patrascan Elena
  Economist: Marzonetti Oana
  Gestionar: Fodorjean (prenume necunoscut)
```

---

## 13. NOTĂ ARHITECTURALĂ — VIITOR

```
ACUM (Monolitic funcțional):
  server.js → toate rutele
  app.js → frontend vanilla

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

*AGENTS.md actualizat: 1 Iunie 2026 | InfraFlow sursă v2.11.11*
*Actualizează acest fișier la orice schimbare majoră de arhitectură sau stare module.*
