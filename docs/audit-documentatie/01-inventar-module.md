# Inventar module și suprafețe funcționale

## Metodă și numărătoare

Inventarul pornește din catalogul canonic `server/core/module-catalog.js`, apoi verifică navigarea din `client/src/components/layout/Sidebar.jsx`, rutele din `client/src/App.jsx` și permisiunile din `server/core/permissions.js`.

- **25 module canonice/licențiabile**.
- **8 suprafețe transversale** documentate separat.
- **33 unități funcționale** care trebuie acoperite de Ajutor și onboarding.

O suprafață transversală nu este raportată ca modul comercial și nu trebuie facturată/activată ca unul fără o decizie explicită de produs.

## A. Module canonice

| ID | Denumire UI | Cheie canonică | Scop și operațiuni principale | Intrare UI / rute orientative | Roluri/permisiuni dominante | Legături cu alte module | Stare audit |
|---|---|---|---|---|---|---|---|
| MOD-01 | Core | `core` | autentificare, sesiune, profil, notificări și navigare | login, shell, profil | toate rolurile autentificate; administrarea revine Superadmin/Admin | toate modulele | Confirmat în cod |
| MOD-02 | Producție & Operațiuni | `production` | rețete, planuri, consumuri, rapoarte și cantități generice | `/productie`, rute producție/consum | operator, manager, tehnic; `consumptions:*`, `recipes:*` | stocuri, lucrări, rapoarte | Confirmat în cod; UAT necesar |
| MOD-03 | Stocuri & Depozite | `inventory` | nomenclator, intrări/ieșiri, transferuri, inventar și rapoarte | `/stocuri`, `/gestiune` | gestionar, magaziner; `inventory:*`, `materials:*`, `gestiune:*` | achiziții, producție, contracte | Confirmat în cod |
| MOD-04 | Rapoarte | `reports` | rapoarte operaționale, periodice, contabile și exporturi | dashboard/rapoarte din module | manager, contabil, roluri cu `*:reports`/`*:export` | toate domeniile | Confirmat în cod; conținut dependent de permisiuni |
| MOD-05 | Flotă, Echipamente & Resurse | `fleet` | parc, foi parcurs, FAZ, carburant, mentenanță, scadențe, GPS | `/mecanizare`, `/flota` | mecanizare, dispecer, șofer; `fleet:*`, `mechanization:*` | logistică, HR, lucrări | Confirmat în cod |
| MOD-06 | Lucrări / Execuție | `technical` | lucrări, rapoarte zilnice, progres, consum și recepții | `/asternere` și rute compatibile | tehnic/manager; `technical:*` | producție, stoc, contracte | Confirmat; terminologie legacy păstrată intern |
| MOD-07 | Aprovizionare & Achiziții | `procurement` | necesar, referate, comenzi, recepții, furnizori, PAAP/CPV | `/achizitii`, `/referate` | achiziții, gestionar, aprobatori; `procurement_*`, `referate:*` | CRM, stoc, contabilitate, contracte | Confirmat în cod |
| MOD-08 | Logistică & Transport | `logistics` | curse, alocări, avize, CMR, dovezi, cost și raportare | `/logistica` | dispecer/manager; `logistics:*` | CRM, flotă, stoc, contracte | Confirmat în cod; transmisii externe nu sunt automate |
| MOD-09 | Contracte | `contract_management` | dosar contractual, valori, consum, documente-sursă, alerte, task-uri și închidere | `/contracte` | manager și roluri contractuale | CRM, achiziții, documente, task-uri | Confirmat în cod |
| MOD-10 | CRM / Vânzări | `crm` | leaduri, prospecte, contacte, activități, oferte, comenzi și facturare draft | `/crm`, `/crm/oferte` | vânzări/manager; `crm:*` | contracte, achiziții, stoc, contabilitate | Confirmat în cod |
| MOD-11 | Resurse Umane | `hr` | angajați, contracte, pontaj, concedii, ture, autorizări, echipamente și raportări | `/hr` | HR Manager și self-service; `hr:*` | documente, kiosk, flotă | Confirmat în cod; date sensibile |
| MOD-12 | Controlling | `controlling` | centre de cost, cheltuieli, bugete, validare și rapoarte | pagini controlling/costuri | contabil/manager; `controlling:*`, `cost_accounting:*` | contabilitate, lucrări, flotă | Confirmat în cod |
| MOD-13 | Contabilitate | `accounting` | terți, facturi, plan conturi, trezorerie, note, rapoarte, fiscal și închidere | `/contabilitate/*` | contabil; `accounting_*`, `ledger:*` | CRM, achiziții, contracte, ANAF | Confirmat în cod; validare fiscală live necesară |
| MOD-14 | Rute & Operațiuni teren | `sanitation` | rute, echipe, operațiuni și urmărire servicii de teren | rută dedicată din sidebar | roluri configurate; grup `sanitation` | flotă, HR, teren | Confirmat ca modul; scenariu client dependent |
| MOD-15 | Semnalizare & Intervenții | `traffic_safety` | intervenții, sesizări și evidență operațională | rută dedicată din sidebar | roluri configurate; grup `traffic` | teren, tichete, flotă | Confirmat ca modul; scenariu client dependent |
| MOD-16 | Mediu & Conformitate | `environment` | obligații, documente și urmărire conformitate | rută dedicată din sidebar | roluri configurate; grup `environment` | documente, tichete | Confirmat ca modul; legislația trebuie profilată |
| MOD-17 | Operațiuni sezoniere | `snow_removal` | planificare și execuție operațiuni sezoniere | rută dedicată din sidebar | roluri configurate; grup snow removal | flotă, stoc, teren | Confirmat ca modul; utilizare sezonieră |
| MOD-18 | Documente | `documents` | dosare, tipuri, workflow, aprobare, semnare, partajare, watchlist | `/documente` | utilizatori cu `documents:*` | toate modulele | Confirmat în cod |
| MOD-19 | Mesaje | `messaging` | canale, membri, mesaje, mențiuni și fișiere | `/mesaje` | `messaging:view/send/manage` | toate echipele | Confirmat în cod |
| MOD-20 | Solicitări & Incidente | `tickets` | tichete P1–P4, comentarii, atașamente, alocare, escaladare și SLA | `/tichete` | solicitant, departament, agent; `tickets:*` | notificări, task-uri, suport | Confirmat în cod |
| MOD-21 | Proiecte & Activitate în teren | `field` | proiecte, activități, progres și raportare din teren | rută field/proiecte | `field:*` | lucrări, documente, HR | Confirmat în cod |
| MOD-22 | Juridic | `legal` | evidențe și documente juridice | `/juridic` | `legal:*` | contracte, documente | Confirmat ca modul; profunzime UAT necesară |
| MOD-23 | Arhivă | `archive` | arhivare, căutare și consultare evidențe | `/arhiva` | `archive:*` | documente, secretariat | Confirmat ca modul |
| MOD-24 | Registratură & Corespondență | `secretariat` | registru intrări/ieșiri, corespondență și distribuire | `/secretariat` | `secretariat:*` | documente, referate, arhivă | Confirmat în cod |
| MOD-25 | AI Assistant | `ai` | interogare asistată și integrare date autorizate | `/ai` | `ai:*`, licență și configurare | modulele permise utilizatorului | Opțional; integrarea live este neconfirmată |

## B. Suprafețe transversale

| ID | Suprafață | Scop | Acces | De ce necesită documentație separată |
|---|---|---|---|---|
| SUP-01 | Dashboard | sumar contextual, onboarding, radare și scurtături | utilizator autentificat cu `dashboard:view` | este punctul de pornire și diferă după drepturi/module |
| SUP-02 | Kiosk Angajat | operațiuni self-service rapide | roluri de angajat/șofer/operator | interfață și condiții distincte de aplicația completă |
| SUP-03 | Task-uri | lucru individual/departamental și follow-up automat | utilizatori autorizați | este folosit de fluxuri din CRM, contracte și documente |
| SUP-04 | Setări | organizație, module, utilizatori, roluri, securitate, integrări, workflow și update | predominant Superadmin/Admin | concentrează configurarea și acțiunile cu risc mare |
| SUP-05 | Import date vechi | import/migrare controlată | administratori autorizați | necesită modele, validări și procedură de rollback |
| SUP-06 | Ajutor | bibliotecă internă căutabilă și editor de articole | citire autentificată; editare Superadmin | este canalul principal al documentației în produs |
| SUP-07 | Devize | integrare generică, import/export și taburi contextuale | roluri/permisiuni tehnice | este integrare, nu modul comercial autonom confirmat |
| SUP-08 | Ofertare internă | simulare internă pachete/tarife și predare controlată în CRM | Superadmin și flag local | instrument intern izolat, absent implicit la client și Demo |

## Hartă de rute și dovezi principale

Toate routerele backend enumerate mai jos sunt montate sub `/api` în `server/app.js`, cu excepția rutelor publice CRM montate sub `/public` și a webhookului WhatsApp. Prefixul concret al fiecărei operațiuni se verifică în fișierul de rute indicat.

| Domeniu | Rută frontend confirmată | Router backend / dovadă |
|---|---|---|
| Producție | `/productie/*` | `server/modules/production/routes.js` |
| Stocuri/Gestiune | `/stocuri/*`, `/gestiune/*` | `server/modules/inventory/routes.js`, `server/modules/gestiune/routes.js` |
| HR | `/hr/*` | `server/modules/hr/routes.js` și routerele HR specializate |
| Lucrări / Execuție | `/tehnic/*`, `/asternere/*` | `server/modules/technical/routes.js`, `server/modules/asternere/routes.js` |
| Contracte | `/contracte/*` | `server/modules/contracts/routes.js` |
| Logistică | `/logistica/*` | `server/modules/logistics/routes.js` |
| CRM | `/crm/*`, `/crm/oferte/*`, public `/oferta/:token` | `server/modules/crm/routes.js`, `server/modules/crm/public-routes.js` |
| Contabilitate | `/contabilitate/*` | `server/modules/accounting/accounting-routes.js` și routerele accounting specializate |
| Parc & Resurse | `/flota/*`, `/foi-parcurs/*`, `/fc-utilaje/*`, `/faz-utilaje/*`, `/fleet/asset/:id` | `server/modules/fleet/*-routes.js`, `server/modules/mechanization/routes.js` |
| Achiziții/Referate | `/achizitii/*`, `/referate/*` | `server/modules/procurement/routes.js`, `paap-routes.js`, `server/modules/referate/routes.js` |
| Teren și servicii | `/teren/*`, `/salubrizare/*`, `/siguranta-circ/*`, `/mediu/*`, `/deszapezire/*` | routerele `field`, `sanitation`, `traffic-safety`, `environment`, `snow-removal` |
| Documente/Mesaje/Tichete | `/documente/*`, `/mesaje/*`, `/sesizari/*` | routerele `documents`, `messaging`, `tickets` |
| Juridic/Arhivă/Secretariat | `/juridic/*`, `/arhiva/*`, `/secretariat/*` | routerele cu aceleași domenii |
| Setări/Ajutor/Import | `/setari/*`, `/ajutor`, `/import-date-vechi` | `server/modules/system/routes.js`, `help-routes.js`, `server/modules/integration/legacy/routes.js` |
| AI | `/ai`, `/ai-assistant` | `server/modules/ai/routes.js` |

Rutele frontend provin din `client/src/App.jsx`; etichetele meniului provin din `client/src/components/layout/Sidebar.jsx`.

## Observații de documentare

1. Denumirea din Ajutor trebuie să urmeze eticheta UI, nu cheia tehnică.
2. Fiecare articol trebuie etichetat cu modulul canonic și permisiunea minimă.
3. Modulele SERVICII sunt configurabile pe scenariul clientului; nu se scriu instrucțiuni universale pentru procese care nu sunt impuse de cod.
4. Conformitatea fiscală, HR și de mediu se documentează distinct pe profil de țară.
5. Aliasurile și rutele legacy sunt suport tehnic, nu denumiri recomandate utilizatorilor.

