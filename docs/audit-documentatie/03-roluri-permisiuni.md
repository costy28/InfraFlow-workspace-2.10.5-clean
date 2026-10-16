# Roluri și permisiuni

## Model confirmat

Accesul este compus din trei straturi:

1. modul licențiat și activ în organizație;
2. rolul utilizatorului și permisiunile sale granulare;
3. filtrele de proprietate/departament aplicate de API și interfață.

Catalogul canonic calculează drepturile efective (`effectiveEntitlements`). O bifă în interfață nu trebuie considerată suficientă: API-ul aferent trebuie să aplice aceeași permisiune. Rolurile personalizate sunt posibile, deci denumirea rolului singură nu garantează accesul.

## Roluri încorporate (12)

| ID rol | Denumire funcțională | Scop confirmat | Nivel orientativ | Observații |
|---|---|---|---|---|
| `superadmin` | Superadmin | toate permisiunile, setări sensibile, sistem și audit | administrare totală | singurul rol potrivit pentru editorul Ajutor și operațiuni critice |
| `admin` | Administrator | aproape toate permisiunile | administrare operațională | exclude `settings:manage`, `audit:manage`, `system:view` în setul legacy |
| `manager` | Manager | vizualizare largă, aprobări, planificare, rapoarte și audit | management | nu echivalează cu Superadmin |
| `inventory` | Gestiune | stoc, NIR, livrări, achiziții și rapoarte | operațional specializat | include vizualizare audit în configurația legacy |
| `hr` | Resurse Umane | angajați, pontaj, concedii, contracte, rapoarte și REGES | date sensibile | accesul medical/personal trebuie verificat separat |
| `procurement` | Achiziții | referate, comenzi, livrări, registre și planificare | operațional/aprobare | pașii din circuit depind de configurația organizației |
| `mechanization` | Mecanizare | parc, cereri, foi, planificare și audit | operațional specializat | asociat resurselor și flotei |
| `technical` | Tehnic | lucrări, worklog, export, consum și planificare | operațional specializat | denumirea UI recomandată este Lucrări / Execuție |
| `accounting` | Contabilitate | contabilitate, costuri, registre și rapoarte | financiar | acțiunile de postare au permisiuni granulare suplimentare |
| `operator` | Operator producție | consumuri, rețete, materiale și solicitări | execuție | acces limitat la creare consum și citire necesară |
| `department` | Departament | solicitări proprii, operațiuni tehnice și planificare | departamental | vizibilitatea trebuie filtrată pe departament |
| `viewer` | Viewer | consultare fără modificări pentru setul legacy | read-only | nu înseamnă acces la toate modulele |

## Roluri implicite configurabile (11)

| ID rol | Denumire UI | Permisiuni/activități esențiale confirmate |
|---|---|---|
| `demo-admin` | Administrator Demo | aproape toate permisiunile, fără utilizatori, setări sensibile, audit administrativ, sistem și import Devize |
| `sofer` | Șofer | foi parcurs consultare/creare/închidere, HR propriu, mesaje și tichete proprii |
| `mecanic-utilaj` | Mecanic / Operator utilaj | cereri mecanizare, foi, fișe combustibil, worklog, HR propriu, mesaje și tichete |
| `gestionar` | Gestionar | NIR, consum, inventar, administrare/rapoarte gestiune, stoc, recepții, comenzi și echipamente |
| `magaziner` | Magaziner | NIR, bon consum, intrări/ieșiri, materiale în citire și recepții curente |
| `hr-manager` | HR Manager | administrare HR completă, date sensibile, pontaj, concedii, contracte, rapoarte, REGES și training |
| `contabil` | Contabil | controlling, centre/bugete, costuri, registre, rapoarte și exporturi; citire operațională relevantă |
| `sef-departament` | Șef Departament | solicitări, mecanizare, worklog, planificare, pontaj echipă, mesaje și tichete departamentale |
| `angajat` | Angajat | Dashboard, HR propriu, pontaj/concediu propriu, mesaje și tichete proprii |
| `dispecer` | Dispecer | planificare, foi/fișe flotă în citire, cereri și mecanizare |
| `operator-statie` | Operator stație / servicii | consumuri, raport zilnic, rețete/materiale în citire și solicitări departamentale |

## Matrice operațională reprezentativă

Legendă: **C** creare, **V** vizualizare, **M** modificare/gestionare, **A** aprobare/validare, **X** export, **—** neacordat implicit. Matricea rezumă rolurile implicite; configurația reală a clientului are prioritate.

| Domeniu/acțiune | Superadmin | Admin | Manager | Gestionar | Magaziner | HR Manager | Contabil | Șef dept. | Angajat | Șofer | Dispecer | Operator servicii |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dashboard | V/M | V/M | V | V | V | V | V | V | V | V | V | V |
| Utilizatori și roluri | C/V/M | conform permisiunii | — | — | — | — | — | — | — | — | — | — |
| Setări sensibile/sistem | C/V/M | limitat | — | — | — | — | — | — | — | — | — | — |
| Materiale | C/V/M/X | C/V/M/X | V | C/V/M/X | V | — | V/X | V | — | — | — | V |
| NIR și intrări | C/V/M/X | C/V/M/X | V | C/V/M/X | C/V | — | V/X | — | — | — | — | — |
| Consum/ieșiri stoc | C/V/M/X | C/V/M/X | V | C/V/M/X | C/V | — | V/X | — | — | — | — | C/V |
| Inventar | C/V/M/X | C/V/M/X | V | C/V/M/X | — | — | V/X | — | — | — | — | — |
| Achiziții/referate | C/V/M/A/X | C/V/M/A/X | V/A | C/V/M | V | — | V/A | C/V/M | — | — | V/M | C/V |
| Lucrări/worklog | C/V/M/X | C/V/M/X | C/V/M/X | — | — | — | V/X | C/V/M | — | C limitat | V | — |
| Parc/foi parcurs | C/V/M/A/X | C/V/M/A/X | V/A | V | — | — | V | V/C | — | C/V/închidere | V/M | — |
| HR fișe și contracte | C/V/M/X | după permisiune | limitat | propriu | propriu | C/V/M/A/X | propriu | propriu/echipă | propriu | propriu | propriu | propriu |
| Pontaj/concedii proprii | C/V/M | C/V/M | V/A | C/V | C/V | C/V/M/A/X | C/V | C/V/A echipă | C/V | C/V | C/V | C/V |
| Controlling | C/V/M/A/X | C/V/M/A/X | V/X | — | — | — | C/V/M/A/X | — | — | — | — | — |
| Contabilitate/postare | C/V/M/A/X | după permisiune | V rapoarte | — | — | — | C/V/M/A/X | — | — | — | — | — |
| Documente proprii | C/V/M/A/X | C/V/M/A/X | V/A | — | — | C/V dept. | V | — | — | — | — | — |
| Mesaje | C/V/M | C/V/M | conform rolului | C/V | C/V | C/V | C/V | C/V | C/V | C/V | C/V | C/V |
| Tichete proprii | C/V/M/A | C/V/M/A | V/A | C/V | C/V | C/V | — | C/V dept. | C/V | C/V | C/V | C/V |
| Ajutor: citire | V | V | V | V | V | V | V | V | V | V | V | V |
| Ajutor: editare/import/export | C/V/M/X | — implicit | — | — | — | — | — | — | — | — | — | — |

## Verificări obligatorii pentru fiecare rol

1. Logare cu utilizator dedicat rolului, fără sesiune Superadmin reutilizată.
2. Confirmarea meniului vizibil conform modulelor efective.
3. Acces direct la URL-ul unei funcții nepermise: răspunsul trebuie să fie interzis, nu doar buton ascuns.
4. Cerere API directă pentru create/update/delete/export nepermis.
5. Separarea datelor proprii, de departament și globale.
6. Auditarea acțiunilor sensibile și lipsa secretelor în răspuns/log.

## Matrice de verificare frontend/backend

Această matrice indică verificările cerute înainte de a declara controlul complet. „Permis” descrie configurația implicită identificată, nu orice rol custom.

| Modul | Operațiune | Rol | Permis | Verificare backend | Status |
|---|---|---|---|---|---|
| Setări | Administrare sistem | Superadmin | Da | permisiuni `settings/system` și rutele system | Confirmat în cod; UAT |
| Setări | Administrare sistem | Angajat | Nu | acces direct URL și endpoint | NECONFIRMAT – necesită testare |
| Ajutor | Citire articole active | Utilizator autentificat | Da | `GET /help` | Confirmat în cod |
| Ajutor | Creare/editare/import/export | Superadmin | Da | rutele `/help/articles`, `/help/import`, `/help/export` | Confirmat în cod; UAT import |
| Ajutor | Creare/editare/import/export | Admin/Manager | Nu implicit | aceeași rută apelată direct | Confirmat în cod pentru Superadmin; test negativ necesar |
| Stocuri | NIR/bon consum | Gestionar | Da | middleware permisiuni gestiune | Confirmat în cod; UAT |
| Stocuri | NIR/bon consum | Viewer/Angajat | Nu | endpoint create direct | NECONFIRMAT – necesită testare |
| Achiziții | Creare comandă | Achiziții/Gestionar autorizat | Da | `procurement_orders:create` | Confirmat în cod; UAT |
| Referate | Aprobare pas | Aprobator configurat | Da condiționat | permisiune pas + stare curentă | Confirmat în cod; UAT pe circuit |
| CRM | Creare/editare ofertă | Vânzări autorizat | Da | permisiuni CRM pe rutele offers | Confirmat în cod; UAT |
| CRM | Aprobare ofertă | Manager comercial autorizat | Da condiționat | permisiune + stare/revizie | Confirmat în cod; UAT |
| Contracte | Activare contract | Manager autorizat | Da condiționat | drept + dosar complet | Confirmat în cod; UAT |
| Documente | Aprobare pas | Aprobator curent | Da condiționat | `documents:approve` + responsabil/stare | Confirmat în cod; UAT concurență |
| Parc & Resurse | Închidere foaie parcurs | Șofer | Da pentru propria alocare | `fleet:trip_log_close` + proprietate | Confirmat în permisiuni; UAT izolare |
| HR | Editare date personale | HR Manager | Da | `hr:employees_manage/personal_sensitive` | Confirmat în cod; UAT |
| HR | Consultare alt angajat | Angajat | Nu | acces direct la ID străin | NECONFIRMAT – necesită testare |
| Contabilitate | Postare factură | Contabil autorizat | Da | permisiune de postare + perioadă | Confirmat în cod; UAT critic |
| Contabilitate | Postare factură | Viewer | Nu | endpoint postare direct | NECONFIRMAT – necesită testare |
| Tichete | Vizualizare tichet propriu | Angajat | Da | `tickets:view_own` + proprietate | Confirmat în permisiuni; UAT izolare |
| Tichete | Vizualizare toate tichetele | Angajat | Nu | query/API fără filtru UI | NECONFIRMAT – necesită testare |

## Neconfirmat

- Matricea completă pentru rolurile personalizate ale fiecărei instalații.
- Portarea rolurilor custom între instalații.
- Paritatea absolută între toate controalele frontend și toate endpointurile backend; necesită UAT pe matricea de mai sus.

