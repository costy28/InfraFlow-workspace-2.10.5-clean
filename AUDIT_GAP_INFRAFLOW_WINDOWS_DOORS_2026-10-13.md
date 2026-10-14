# Audit GAP — InfraFlow for Windows & Doors

**Data auditului:** 13 octombrie 2026  
**Bază analizată:** InfraFlow v2.12.687  
**Scop:** evaluarea unei verticale comerciale și operaționale pentru tâmplărie PVC/aluminiu, fără implementare și fără transformarea InfraFlow într-un produs CAD/CAM.

## 1. Rezumat executiv

Verticala este **fezabilă**, dar nu prin simpla redenumire a modulelor existente. InfraFlow acoperă deja bine CRM-ul, ofertarea versionată, acceptarea clientului, comanda client, contractele, facturarea/proforma, achizițiile, stocurile, documentele, task-urile, terenul, flota, logistica, incidentele, auditul și o parte importantă din raportare.

Lipsa structurală principală este un agregat unic care să reprezinte lucrarea completă a clientului. `work.projects` este apropiat ca noțiune operațională, iar `crm.customer_orders` este apropiat ca origine comercială, însă niciunul nu leagă nativ măsurătorile, pozițiile de tâmplărie, BOM-ul, producția, montajul, recepția, factura și service-ul într-un singur dosar.

Recomandarea este introducerea conceptuală a entității **`CustomerJob` / `LucrareClient`**, cu relații către entitățile existente, nu duplicarea CRM-ului, contractelor, stocului sau facturării.

Verdict:

- proces comercial și administrativ: reutilizare mare, predominant **A/B**;
- măsurători, lucrare client, poziții și montaj: extensie controlată, predominant **B/D**;
- integrare cu software tehnic: **C**, printr-un strat generic de import;
- CAD, optimizare debitare și CNC: **E**, nu recomandăm în InfraFlow;
- BOM, rezervări și producție discretă pe poziții: necesită dezvoltare **D**, cu complexitate medie–mare.

## 2. Metodă și limite

Au fost verificate codul server, migrările MSSQL, rutele API și ecranele React existente. API-urile din tabele sunt cele relevante pentru reutilizare, nu o listă exhaustivă a tuturor endpointurilor aplicației.

Fluxul `Solicitare → ... → Garanție / Service` este tratat ca ipoteză. Ordinea, statusurile, rolurile și pragurile trebuie validate cu primul client înainte de modelarea finală.

## 3. Inventarul funcțional reutilizabil

| Nevoie | Modul existent | Entități relevante | API-uri relevante | Ecrane existente | Reutilizare / ajustare | Clasă | Complexitate |
|---|---|---|---|---|---|---|---|
| Solicitare / Lead | CRM | `crm.leads`, `crm.activities` | `GET/POST /api/crm/leads`, `GET/PUT/PATCH /api/crm/leads/:id`, `POST /api/crm/leads/:id/follow-up` | CRM, Lead-uri | Direct; câmpuri și surse configurabile | A | mică |
| Client / prospect | CRM | `crm.accounts`, `crm.contacts` | `/api/crm/accounts`, `/api/crm/contacts` | Prospecte și contacte | Direct | A | mică |
| Conversie lead | CRM | lead, account, contact | `POST /api/crm/leads/:id/convert` | Fișă lead | Direct | A | mică |
| Programare măsurători | Task-uri + CRM | task-uri JSON, `crm.activities` | `POST /api/tasks`, `POST /api/crm/activities` | Task-uri, fișă lead | Tip nou de task/activitate și legătură la lucrare | B | mică |
| Măsurători | Teren | `work.projects`, `field.site_journals`, `field.journal_photos`, `field.journal_activities` | `/api/field/journals`, `/api/field/photos/upload` | Proiecte & Activitate în teren | Bază utilă, dar formular dedicat și revizii lipsesc | D | medie |
| Configurație tehnică | Devize/import extern | `integration.intersoft_projects`, `integration.intersoft_articles`, `integration.intersoft_sync_log` | fluxurile existente de integrare Devize | Devize — integrare | Refolosire arhitecturală, nu semantică 1:1 | C | medie |
| Ofertă | CRM | `crm.quotes`, `crm.quote_lines` | `/api/crm/quotes`, `/api/crm/quotes/:id` | Oferte CRM | Direct pentru linii comerciale | A | mică |
| Revizii ofertă | CRM | `quote_group_uuid`, `revision`, snapshot | `POST /api/crm/quotes/:id/revision` | Detaliu ofertă | Direct | A | mică |
| Acceptare client | CRM public | `crm.quote_public_links`, `crm.quote_decisions` | `GET/POST /api/quote/:token` | Ofertă publică | Direct | A | mică |
| Comandă client | CRM | `crm.customer_orders`, `crm.customer_order_lines` | `/api/crm/customer-orders`, `POST /api/crm/quotes/:id/customer-order` | Oferte / comandă asociată | Direct; trebuie legată la LucrareClient | B | mică |
| Contract | Contract Management | `contract_management.contracts`, atașamente, acte adiționale | `/api/contracts`, `/api/contracts/:id`, activare/închidere | Contracte | Direct; legătură explicită la lucrare recomandată | B | mică |
| Avans / proformă | CRM Billing | `crm.billing_documents` | `POST /api/crm/customer-orders/:id/proforma`, `/oblio/proforma` | Comandă CRM / facturare | Proforma există; încasarea avansului trebuie urmărită explicit | B | medie |
| Factură finală | CRM + Contabilitate | `crm.billing_documents`, `accounting_invoices_out` | invoice draft, Oblio invoice, contabilitate facturi ieșire | CRM / Contabilitate | Direct pentru emitere; regulă de sold final necesară | B | medie |
| Stoc | Gestiune | colecțiile materiale/mișcări, `inventory.department_stocks`, transferuri | `/api/materials`, `/api/stock-operations`, `/api/inventory/*` | Stocuri & Depozite / Gestiune | Direct pentru articole simple | A | mică |
| Verificare disponibilitate | CRM–Stoc | `crm.inventory_checks` | `POST /api/crm/customer-orders/:id/inventory-check` | Comandă CRM | Informativă; codul declară explicit `reservation: none` | A pentru verificare, D pentru rezervare | medie |
| Necesar achiziții | CRM + Achiziții | snapshot verificare, cereri departament, comenzi furnizor | `POST /api/crm/customer-orders/:id/procurement-requirements`, `/api/procurement-orders` | CRM / Achiziții | Direct pentru lipsuri simple | B | medie |
| Achiziții | Achiziții | `procurement.suppliers`, orders/receipts, PAAP/referate | `/api/procurement-orders`, receive, requirements | Aprovizionare & Achiziții | Direct | A | mică |
| BOM pe lucrare | Producție + integrare | rețete/materiale și snapshoturi CRM | recipes, config recipes-materials | Producție / Gestiune | Modelul curent este orientat spre rețete/cantități agregate, nu BOM versionat pe poziție | D | mare |
| Producție | Producție + Task-uri | recipes, plans, consumptions, tasks | `/api/plans`, `/api/consumptions`, `/api/tasks` | Producție & Operațiuni / Task-uri | Poate orchestra etape, dar nu are rutare discretă pe fiecare poziție | D | mare |
| Control final | Task-uri + Documente | task, document/checklist viitor | `/api/tasks`, `/api/documents` | Task-uri / Documente | Configurabil minimal; checklist structurat lipsește | B/D | medie |
| Programare montaj | Task-uri + Logistică | tasks, trips | `/api/tasks`, `/api/logistics/trips`, planning-check | Task-uri / Logistică | Calendar de montaj dedicat și echipe lipsesc | D | medie |
| Montaj în teren | Teren | jurnale, echipă, fotografii, probleme, semnături | `/api/field/journals`, activities, photos, sign-request | Proiecte & Activitate în teren | Reutilizare mare; necesită UX și legături specifice | B/D | medie |
| Recepție client | Teren + Documente | semnături teren, documente, audit | `/api/field/sign/:token`, `/api/documents` | Teren / Documente | Semnarea există; proces-verbal dedicat/configurabil | B | medie |
| Flotă / deplasare | Flotă + Logistică | `fleet.assets`, foi parcurs, curse logistice | fleet assets, trip logs, `/api/logistics/trips` | Flotă / Logistică | Direct | A | mică |
| Reclamații | Solicitări & Incidente | `tickets.tickets`, comments, attachments, escalations | `/api/tickets` | Solicitări & Incidente | Direct ca registru de reclamații | A | mică |
| Garanție / Service | Tichete + Task-uri | tickets, tasks | ticket status/assign/escalate, tasks | Tichete / Task-uri | Legătura nativă la lucrare/poziție și garanție lipsește | B/D | medie |
| Documente | Documente | `documents.documents`, types, circuit, audit, shares | `/api/documents` și acțiunile de circuit | Documente | Direct | A | mică |
| Audit | Core + audituri modul | audit global, circuit audit, CRM integration events | rutele de audit și istoricele modulului | Setări / detalii entitate | Direct; evenimente noi trebuie auditate | A | mică |
| Dashboard | Dashboard + module | date CRM, task, contract, ticket, stoc | dashboard CRM/system/module | Dashboard | O parte KPI există; verticala necesită agregare pe LucrareClient | B/D | medie |
| Rapoarte | Rapoarte, Controlling, export Excel | cost entries, rapoarte modul | exporturi Excel/CSV existente | module și Controlling | Bază directă; profit pe lucrare cere costuri legate univoc | B/D | medie |

## 4. Conceptul `CustomerJob` / `LucrareClient`

### 4.1 Ce există apropiat

- `crm.customer_orders` este ancora comercială după acceptarea ofertei și păstrează snapshotul sursei.
- `work.projects` este ancora operațională folosită de teren, progres, jurnale, incidente și controlling.
- `contract_management.contracts` este ancora contractuală și valorică.
- niciuna dintre ele nu acoperă singură întregul dosar solicitat.

Extinderea directă a uneia dintre aceste entități cu zeci de câmpuri ar produce cuplare și ambiguitate. Recomand o entitate separată, subțire, de orchestrare.

### 4.2 Model conceptual recomandat

`CustomerJob`:

- identificare: id/uuid, număr lucrare, titlu, status, versiune;
- client: `crm_account_id`, `crm_contact_id`, adresă lucrare structurată;
- origine: `lead_id`, `quote_group_uuid`, `accepted_quote_id`, `customer_order_id`;
- contract/financiar: `contract_id`, condiții avans, stare avans, stare facturare;
- operare: `work_project_id`, responsabil, echipe, date planificate/reale;
- integrare: software extern, cheie externă, versiune import, checksum;
- control: created/updated/cancelled, audit și stare de blocare.

Legăturile multiple trebuie puse în tabele asociative sau entități copil, nu într-un câmp JSON unic. Snapshoturile externe pot rămâne JSON pentru trasabilitate, dar nu trebuie să fie singura sursă interogabilă.

**Clasificare:** D — dezvoltare, complexitate mare.

## 5. Poziții de tâmplărie

`crm.quote_lines` și `crm.customer_order_lines` pot descrie comercial F01/F02/U01, cantitate, UM, preț și cod extern. `integration.intersoft_articles` demonstrează că aplicația poate importa poziții externe. Totuși, modelul curent nu are o entitate stabilă și versionată pentru poziția tehnică a lucrării.

Concept recomandat `JobPosition`:

- `customer_job_id`, cod poziție, denumire, cantitate;
- lățime/înălțime în mm;
- tip produs, sistem/profil, culoare, pachet sticlă, feronerie, deschidere, accesorii;
- cod și versiune externă;
- snapshot tehnic JSON validat pentru extensii dependente de furnizor;
- legături la schițe/fotografii/documente;
- stare: măsurată, validată, ofertată, lansată, produsă, controlată, montată.

Modelul poate susține datele după extensie, dar **nu suficient doar prin liniile ofertei**. Acestea sunt snapshoturi comerciale și nu trebuie transformate în configurator tehnic.

**Clasificare:** D, complexitate medie–mare.

## 6. Măsurători și teren

### Există deja

- proiecte și jurnale de teren;
- responsabil și echipă (`field.journal_crew`);
- activități, cantități și observații;
- fotografii, thumbnail și coordonate GPS (`field.journal_photos.locatie_gps`);
- probleme/incident și alocare;
- semnătură externă prin token;
- timeline, galerie și progres de proiect;
- task-uri cu termen, responsabil, comentarii și atașamente.

### Lipsește

- vizită de măsurători ca entitate planificabilă cu interval și rezultat;
- set de măsurători versionat și aprobat;
- dimensiuni structurate per poziție;
- diferențiere între măsurătoare preliminară și finală;
- legătură explicită Lead → Lucrare → Vizită → Poziții;
- blocarea lansării în producție dacă măsurătorile nu sunt validate;
- calendar operațional dedicat vizitelor/montajelor.

Recomand reutilizarea serviciilor de upload, task, audit și semnătură, cu UI mobil dedicat măsurătorilor. **B/D, complexitate medie.**

## 7. Integrarea cu software tehnic

InfraFlow are precedente utile: import Excel/XML pentru parc, integrarea genericizată „Devize”, uploaduri controlate, log de sincronizare, evenimente de integrare CRM și procesare XLSX. Nu există încă un pipeline generic complet pentru software tehnic de tâmplărie.

### Arhitectură recomandată

```text
ExternalTechnicalImport
  -> detectare format/adaptor
  -> parsare într-un staging imuabil
  -> validare schemă și semantică
  -> preview diferențe
  -> mapping coduri externe <-> nomenclator InfraFlow
  -> confirmare umană
  -> CustomerJob / JobPositions / JobBOM
  -> verificare stoc
  -> necesar achiziții
  -> jurnal import + checksum + idempotency key
```

Componente generice recomandate:

1. registru de provideri/adaptoare;
2. profil de mapping configurabil per client și versiune software;
3. staging pentru fișier, payload, erori și avertizări;
4. schemă canonică `job`, `positions`, `bom`, `documents`, `statuses`;
5. preview și reconciliere înainte de aplicare;
6. idempotency, checksum și reimport versionat;
7. dead-letter/retry pentru import automat;
8. upload manual pentru CSV/XML/JSON/XLSX;
9. endpoint REST autentificat pentru push/pull ulterior;
10. audit cu utilizator, provider, versiune și rezultat.

Strategie pe format:

- CSV/Excel: potrivite pentru MVP și mapping manual;
- XML/JSON: preferabile pentru structură ierarhică și BOM;
- REST: faza 2, numai după contract API real cu furnizorul;
- import automat din folder: doar on-premises, cu serviciu separat și directoare protejate.

**Clasificare:** C, complexitate medie pentru pipeline; mare pentru primul adaptor real necunoscut.

## 8. BOM și necesar materiale

### Capacitate actuală

- materiale și stoc curent;
- mișcări, intrări, ieșiri, transferuri și consumuri;
- rețete și necesar derivat pentru producția actuală;
- verificare informativă CRM pe baza codului/denumirii;
- generare de candidați de aprovizionare pentru lipsuri;
- comenzi furnizor și recepții.

### Limite

- nu există BOM versionat per lucrare și per poziție;
- liniile comenzii comerciale nu sunt suficiente pentru profile/sticlă/feronerie subordonate;
- nu există rezervare de stoc: codul CRM declară explicit `reservation: none`;
- nu există alocare lot/serie și trasabilitate completă pe poziție;
- nu există conversii UOM robuste;
- nu există substituții materiale aprobate;
- nu există gestionarea resturilor reutilizabile de profil;
- necesarul paralel pentru sticlă, profil și accesorii nu are sincronizare de etapă.

Model conceptual: `JobBomVersion`, `JobBomLine`, `MaterialMapping`, `StockReservation`, legate la `CustomerJob` și opțional la `JobPosition`.

**Clasificare:** D pentru BOM/rezervare, complexitate mare; B pentru simpla verificare și comandă de lipsuri.

## 9. Unități de măsură

Câmpurile existente de tip `unit`/`um` sunt textuale și pot stoca `buc`, `m`, `mm`, `mp`, `set`, `bară`, `pachet`. Acesta este suport de etichetare, nu un sistem de conversie.

Nu a fost identificat un nomenclator canonic UOM cu dimensiune, precizie, factor de conversie și reguli de rotunjire. Prin urmare:

- aceleași unități pot fi scrise neuniform;
- verificarea stocului compară numeric fără conversie;
- `14.200 mm` nu poate fi comparat sigur cu `14,2 m`;
- „2 bare” nu poate fi transformat automat în metri fără specificația articolului.

Pentru bara de 6 m, consum în mm și rest reutilizabil ar fi necesare:

- `units_of_measure` și `unit_conversions`;
- unitate de bază per material;
- conversie dependentă de articol/ambalaj (`1 bară = 6000 mm`);
- rotunjire și toleranță;
- lot/bucată fizică de profil cu lungime inițială și lungime rămasă;
- reguli de eligibilitate a restului și alocare controlată.

Conversiile canonice sunt **D, complexitate medie**. Optimizarea și gestiunea inteligentă a resturilor este **E în MVP** și cel puțin foarte mare dacă va fi construită ulterior.

## 10. Producție și fluxuri paralele

Modulele curente pot crea planuri, consumuri, activități, task-uri, milestone-uri și workflow-uri documentare. Pot reprezenta informativ etape precum debitare, armare, sudare, feronerie, vitrare și control final prin task-uri sau milestone-uri configurate.

Nu există însă un motor de producție discretă cu:

- routing versionat per familie de produs;
- operații per poziție/cantitate;
- stații/centre de lucru și capacități;
- precedențe între operații;
- WIP și scanări pe poziție;
- dependențe între task-uri;
- barieră de sincronizare „profil produs + sticlă sosită + accesorii disponibile”.

Workflow-ul de documente este secvențial/condițional și adecvat aprobărilor, nu planificării producției paralele. Task-urile au stări, responsabil și termen, dar nu un graf nativ de dependențe.

Recomandarea MVP este un workflow configurabil la nivel de lucrare cu etape și checklist-uri, nu MES complet. Dependențele explicite și sincronizarea pot fi faza 2.

**MVP producție:** D, complexitate medie–mare.  
**Planificare avansată/MES:** D/E, complexitate foarte mare.

## 11. Montaj

### Reutilizabil

- task-uri și responsabili;
- echipa din jurnalul de teren;
- proiect/adresă (după extensie);
- flotă și cursă logistică;
- fotografii/GPS/observații;
- incidente și remedieri;
- documente și semnătură cu token;
- audit și timeline.

### De construit/configurat

- programare de montaj cu interval, echipă și capacitate;
- legătură la lucrare și pozițiile ce trebuie montate;
- checklist configurabil înainte/după montaj;
- rezultat per poziție: montat, parțial, neconform;
- proces-verbal de recepție precompletat;
- acceptare/observații client și follow-up automat;
- vedere calendar/dispatch.

**Clasificare:** B pentru dovezi și semnătură; D pentru planificare și execuție structurată. Complexitate medie.

## 12. Garanție și service

Tichetele acoperă deja creare, prioritate, responsabil, status, comentarii, atașamente, escaladări și istoric. Task-urile pot organiza intervenția, iar logistica/flota poate susține deplasarea.

Lipsesc:

- garanție calculată de la recepție per lucrare/poziție;
- tip defect și cauză standardizată;
- legătură obligatorie la `CustomerJob` și opțional `JobPosition`;
- programarea vizitei service;
- materiale/piese consumate și cost garanție vs post-garanție;
- SLA și indicatori specifici service.

**Clasificare:** B pentru reclamații simple; D pentru dosar complet de garanție. Complexitate medie.

## 13. KPI conceptuali

| KPI | Disponibil acum | Ce lipsește |
|---|---|---|
| Lead-uri fără răspuns | Da, derivabil CRM activități/follow-up | prag configurabil și card dedicat |
| Măsurători programate | Parțial, ca task | tip și calendar dedicat |
| Oferte în așteptare | Da | eventual segment vertical |
| Avansuri neîncasate | Parțial | stare încasare și reconciliere pe lucrare |
| Comenzi în producție | Nu unitar | CustomerJob + workflow producție |
| Materiale lipsă | Da, snapshot informativ pe comandă | BOM real și rezervări |
| Lucrări întârziate | Parțial din task/milestone | termen master și status lucrare |
| Montări programate | Nu structurat | calendar montaj |
| Service/reclamații | Da din tichete | legătură la lucrare/garanție |
| Valoare comenzi | Da din CRM | agregare pe perioadă/status |
| Profit estimat/lucrare | Parțial din ofertă + controlling | cost BOM/manoperă/logistică legat univoc |

## 14. Tabel GAP ANALYSIS complet

| Element | Situație actuală | Gap | Recomandare | Clasă | Complexitate |
|---|---|---|---|---|---|
| Lead, client, contact | CRM relațional complet | nimic critic | reutilizare | A | mică |
| Activități/follow-up | există | tipuri verticale | configurare | B | mică |
| Ofertă și revizii | există, versionată | poziții tehnice nu trebuie ținute numai aici | link la JobPosition | A/B | mică |
| Acceptare publică | există | nimic critic | reutilizare | A | mică |
| Comandă client | există | nu este dosar operațional complet | link la CustomerJob | B | mică |
| Contract | există | legătură nativă la lucrare | FK/asociere | B | mică |
| Avans | proforma există | stare scadență/încasare pe lucrare | extensie financiară | B/D | medie |
| Factură finală | draft/Oblio/contabilitate există | regulă sold final | extensie | B | medie |
| Lucrare client | fragmente în CRM/work/contracts | agregat unic absent | CustomerJob | D | mare |
| Adresă lucrare | apare în contexte logistice | nu este master data de lucrare | adresă structurată | D | mică |
| Vizită măsurători | poate fi task | rezultat/revizie absent | MeasurementVisit/Revision | D | medie |
| Fotografii/GPS | există în teren | context lucrare/poziție | reutilizare servicii + legături | B | mică |
| Semnătură | există în teren | documente verticale | șablon/configurare | B | medie |
| Poziții F01/U01 | linii comerciale/import deviz | entitate tehnică stabilă absentă | JobPosition | D | medie–mare |
| Schiță poziție | atașament generic posibil | tip, versiune, asociere | document legat | D | medie |
| Configurator geometric | absent | produs specializat | păstrare externă | E | foarte mare |
| BOM importat | rețete/materiale parțial | BOM versionat per poziție absent | JobBOM + mapping | C/D | mare |
| UOM textuale | există | conversii absente | nomenclator UOM | D | medie |
| Stoc | există | rezervare absentă | StockReservation | D | medie–mare |
| Lot/serie | insuficient pentru cerință | trasabilitate pe poziție | faza 2 | D | mare |
| Necesare | există simplificat | derivare din BOM și reconciliere | extensie | B/D | medie |
| Achiziții/recepții | există | sincronizare cu lucrare/BOM | legături | B | medie |
| Etape producție | plan/task/milestone | routing discret absent | JobWorkflow simplu | D | mare |
| Fluxuri paralele | pot fi imitate cu task-uri | dependențe/barieră absente | graf de dependențe în faza 2 | D | mare |
| CNC/debitare optimizată | absent | algoritmi specializați | păstrare externă | E | foarte mare |
| Programare montaj | task/logistică parțial | calendar echipe absent | InstallationSchedule | D | medie |
| Execuție montaj | teren reutilizabil | checklist/poziții | extensie mobilă | B/D | medie |
| Recepție | semnătură/documente | PV vertical și status per poziție | configurare/extensie | B/D | medie |
| Reclamație | tichete complete | legătură lucrare/poziție | extensie | B | mică |
| Garanție/service | tichete/task parțial | termene, vizite, cost | ServiceCase | D | medie |
| Audit | există | evenimente verticale noi | reutilizare | A | mică |
| Dashboard | infrastructură există | agregări verticale | dashboard vertical | D | medie |
| Profit pe lucrare | controlling parțial | costuri complete și legături | cost ledger lucrare | D | mare |
| Import CSV/XLSX | precedente există | schemă canonică/mapping | pipeline generic | C | medie |
| Import XML/JSON | precedent XML și payloaduri | validare/mapping generic | pipeline generic | C | medie |
| API REST tehnic | infrastructură Express | contract provider necunoscut | adaptor după discovery | C | mare |

## 15. Modificări DB posibile — fără implementare

Ordine conceptuală:

1. `customer_jobs` — agregatul lucrării;
2. `customer_job_links` sau FK-uri controlate către CRM/contract/project;
3. `measurement_visits`, `measurement_revisions`;
4. `job_positions`, `job_position_files`;
5. `technical_imports`, `technical_import_rows`, `external_mappings`;
6. `job_bom_versions`, `job_bom_lines`;
7. `units_of_measure`, `material_unit_conversions`;
8. `stock_reservations`, doar după reguli de concurență și anulare;
9. `job_workflow_instances`, `job_operations`, eventual `job_operation_dependencies`;
10. `installation_appointments`, `installation_checklist_items`, `installation_results`;
11. `service_cases` sau extensii controlate ale tichetelor;
12. `job_cost_entries` sau legături stricte către Controlling.

Nu recomand crearea tuturor în MVP. Primele șase sunt suficiente pentru validarea verticalei, iar rezervările, producția avansată și service-ul structurat pot veni ulterior.

## 16. API-uri noi posibile — fără implementare

- `/api/customer-jobs` și `/api/customer-jobs/:id`;
- `/api/customer-jobs/:id/timeline` și `/dashboard`;
- `/api/customer-jobs/:id/measurements` + revizie/validare;
- `/api/customer-jobs/:id/positions`;
- `/api/customer-jobs/:id/bom` + versiuni;
- `/api/customer-jobs/:id/material-check`;
- `/api/customer-jobs/:id/procurement-requirements`;
- `/api/customer-jobs/:id/workflow` + operații/status;
- `/api/customer-jobs/:id/installations`;
- `/api/customer-jobs/:id/reception`;
- `/api/customer-jobs/:id/service-cases`;
- `/api/technical-imports` upload/preview/confirm/status;
- `/api/technical-integrations/:provider/push|pull`, ulterior.

Toate acțiunile mutabile trebuie să aibă permisiuni granulare, audit și idempotency acolo unde sursa este externă.

## 17. UI-uri noi posibile — fără implementare

1. listă „Lucrări clienți” cu status, termen, client și următor pas;
2. dosar LucrareClient cu timeline și file: Comercial, Măsurători, Poziții, Materiale, Producție, Montaj, Financiar, Service, Documente;
3. formular mobil de măsurători;
4. preview import tehnic și mapping;
5. listă poziții fără desenator geometric;
6. vedere BOM și lipsuri;
7. kanban simplu de producție pe lucrări/poziții;
8. calendar măsurători și montaj;
9. checklist montaj + recepție și semnătură;
10. dashboard vertical.

## 18. Integrări posibile

- WinArhi/Klaes/LogiKal/ReynaPro sau alt produs: adaptor doar după obținerea formatului/API-ului oficial al clientului;
- Oblio: deja disponibil pentru proforme/facturi;
- email/WhatsApp: captare solicitări și comunicare, cu fundații existente;
- GPS/flotă: deplasări și echipe;
- import furnizori/catalog: posibil prin același staging generic;
- scanner cod bare/QR: faza 2 pentru WIP, stoc sau poziții.

## 19. Riscuri tehnice

1. **Model dublu JSON/MSSQL:** unele domenii folosesc colecții/snapshoturi, altele tabele relaționale; verticala trebuie proiectată relațional și sincronizată deliberat.
2. **Identitatea entităților:** UUID, INT și identificatori textuali coexistă; legăturile noi au nevoie de convenție unică.
3. **UOM:** lipsa conversiilor poate produce disponibilități și costuri greșite.
4. **Reimport extern:** fără checksum/idempotency pot apărea duplicate sau suprascrieri greu de auditat.
5. **Versiuni:** oferta, măsurătoarea, configurația externă și BOM-ul pot evolua independent; trebuie înghețat exact snapshotul acceptat.
6. **Rezervări concurente:** verificarea actuală este informativă; rezervarea necesită tranzacții și politici de eliberare.
7. **Cuplare cu un vendor:** maparea directă a coloanelor WinArhi/Klaes în tabelele de domeniu ar bloca produsul.
8. **Scope creep CAD/MES:** geometria, optimizarea și planificarea fină pot depăși obiectivul ERP.
9. **Date sensibile și fișiere:** schițele/fotografiile trebuie descărcate numai prin rute autorizate, conform hardeningului actual.
10. **UX mobil:** măsurătorile și montajul trebuie validate pe telefon/tabletă, nu doar desktop.

## 20. Ce nu merită construit în InfraFlow

Clasificare **E — nu recomandăm**:

- desen tehnic parametric de ferestre/uși;
- configurator geometric și biblioteci constructive complete;
- calcul structural/termic/acustic specializat;
- optimizare de debitare și nesting;
- generare programe CNC;
- baze de date proprietare de profile/feronerie replicate manual;
- motor de preț care dublează integral software-ul tehnic;
- algoritm avansat de reutilizare a resturilor în MVP;
- MES/APS complet înainte de validarea procesului real.

InfraFlow trebuie să păstreze cheia externă, versiunea, documentele, pozițiile normalizate, BOM-ul și statusul, iar sursa tehnică specializată să rămână autoritatea pentru proiectare și optimizare.

## 21. MVP recomandat pentru primul client

### Obiectiv

Un dosar unic de lucrare care pornește din CRM și ajunge până la montaj/recepție, folosind importul tehnic ca „cutie neagră”.

### Conținut MVP

1. validarea procesului real și a software-ului tehnic utilizat;
2. `CustomerJob` legat la lead, ofertă acceptată, comandă, contract și proiect;
3. programare și fișă mobilă de măsurători cu poze;
4. `JobPosition` minimal: cod, dimensiuni, cantitate, descrieri și referință externă;
5. import manual CSV/XLSX sau formatul cel mai simplu disponibil, cu preview și mapping;
6. BOM importat versionat, fără optimizare;
7. verificare stoc și necesar achiziții, inițial fără rezervare automată;
8. workflow simplu, configurabil, la nivel de lucrare;
9. programare montaj, checklist, fotografii, PV și semnătură;
10. tichete de reclamație legate la lucrare;
11. dashboard operațional de bază;
12. audit complet.

Complexitate totală estimată: **mare**. Trebuie împărțită în livrări incrementale și validată pe date reale.

## 22. Faza 2 posibilă

- adaptor automat oficial pentru produsul tehnic real;
- UOM și conversii complete;
- rezervări de stoc și loturi;
- routing de producție per familie și dependențe paralele;
- WIP pe poziții și scanare QR;
- capacitate echipe/stații și calendar avansat;
- gestiune service și garanție completă;
- cost real/profit pe lucrare;
- catalog furnizor și actualizări automate;
- analytics comercial/operațional extins;
- resturi de profil numai dacă analiza economică justifică funcția.

## 23. Întrebări obligatorii pentru discovery cu clientul

Înainte de proiectare trebuie obținute răspunsuri clare la:

1. Ce software tehnic și ce versiune folosește?
2. Ce formate exportă oficial și există API documentat?
3. Care sistem este sursa de adevăr pentru configurație și preț?
4. Cum arată o poziție și un BOM exportat real?
5. Când se îngheață măsurătoarea și cine o aprobă?
6. Produce intern, externalizează sau are flux mixt?
7. Care sunt etapele reale și ce procese rulează paralel?
8. Cum se gestionează sticla, profilele, feroneria și accesoriile?
9. Există rezervări, loturi, coduri de bare și resturi urmărite astăzi?
10. Cum se planifică echipele de măsurători și montaj?
11. Ce documente semnează clientul și când?
12. Cum se înregistrează avansul, soldul și garanția?
13. Ce KPI folosește conducerea efectiv?
14. Ce volum lunar există: lead-uri, lucrări, poziții, importuri, montări, service?

## 24. Decizie recomandată

Se recomandă continuarea cu un **discovery tehnic și operațional**, nu cu implementarea imediată. Primul artefact necesar de la client este un export real și anonimizat din software-ul tehnic, împreună cu o lucrare completă de la solicitare la recepție.

După discovery se poate valida arhitectura `CustomerJob + JobPosition + import generic + BOM versionat`. Aceasta păstrează InfraFlow ca sistem central comercial/operațional și evită concurența inutilă cu aplicațiile CAD/CAM consacrate.

