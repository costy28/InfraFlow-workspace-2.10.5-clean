# InfraFlow — audit tehnic complet

## Modularitate, licențiere, dependențe și pregătire pentru lansare

**Data auditului:** 12 octombrie 2026  
**Versiunea sursei inspectate:** 2.12.683  
**Tip audit:** read-only  
**Repository:** `E:\CODEX 1\InfraFlow-workspace-2.10.5-clean`

Auditul a fost efectuat exclusiv prin inspectarea codului, configurațiilor, testelor și documentației existente. Nu au fost modificate codul, baza de date, configurația, licențele sau serviciile și nu au fost executate teste cu efecte secundare.

## 1. Verdict pentru partea financiară

### 1.1 Poate InfraFlow utiliza pachete personalizate?

**Da.** Mecanismul actual poate reprezenta:

- Start, Business, Operations și Enterprise;
- combinații personalizate de module;
- extensii și add-on-uri;
- număr maxim de utilizatori și dispozitive;
- termen de valabilitate;
- trial și perioadă de grație;
- upgrade sau downgrade prin înlocuirea fișierului `.iflic`.

Nu este necesară înlocuirea mecanismului de licențiere.

Înainte de comercializare trebuie însă consolidată aplicarea licenței în backend. În forma actuală, modulele nu trebuie considerate complet protejate contractual numai pentru că nu apar în interfață.

### 1.2 Poate fi vândut CRM fără Stocuri?

**Da.** Fluxul principal funcționează independent de Stocuri:

```text
Lead
→ Prospect/contact
→ Ofertă
→ Revizie
→ Aprobare internă
→ Trimitere
→ Acceptare client
→ Comandă client
→ Proformă
```

Verificarea stocului și generarea necesarului de aprovizionare sunt acțiuni separate și opționale. Comanda client poate fi creată fără verificarea stocului.

Pentru facturare există două dependențe:

- factura draft folosește motorul Contabilitate;
- factura reală Oblio cere mai întâi factura draft și un terț contabil asociat.

Prin urmare, comercial pot exista următoarele configurații:

- **CRM de bază**, fără Stocuri și fără Contabilitate;
- **CRM + Oblio Proformă**, fără Stocuri, dar cu fundația minimală de partener/facturare;
- **CRM + Facturare completă**, cu modulul Contabilitate sau cu o viitoare fundație comercială comună.

## 2. Rezumat executiv

| Domeniu | Verdict |
|---|---|
| Arhitectură modulară | Bună funcțional, dar modulele sunt montate central și nu sunt izolate fizic |
| Licențiere personalizată | Posibilă cu mecanismul existent |
| Autenticitatea licenței | Semnătură RSA prezentă |
| Legarea licenței de instalație | Nu este demonstrată |
| Aplicare frontend | Implementată în Setări și navigare |
| Aplicare backend | Parțială și neuniformă |
| CRM fără Stocuri | Da |
| Proformă fără Stocuri | Da |
| Factură Oblio fără Contabilitate | Nu complet, în implementarea actuală |
| Date după downgrade | Se păstrează; nu a fost identificată ștergere la dezactivare |
| Funcționare On-Premise offline | Da pentru funcțiile locale; nu pentru SMTP, Oblio, AI, GPS și update online |
| Multi-company în aceeași instalație | Neconfirmat ca izolare reală |
| Pregătire imediată pentru lansare | Aproape, dar sunt necesare câteva corecții P1 și cel puțin un audit P0 |

## 3. Arhitectura identificată

### 3.1 Componente principale

**CONFIRMAT DIN COD:** backend-ul principal este Express și montează routerele modulelor în procesul comun, în `server/app.js`, începând cu zona rutelor `/public` și `/api`.

Componentele principale sunt:

- autentificare și sesiuni: `server/core/auth.js`;
- permisiuni și roluri: `server/core/permissions.js`;
- acces MSSQL și compatibilitate legacy: `server/core/db.js`;
- audit: `server/core/audit.js`;
- configurare inițială: `server/core/setup.js`;
- licență runtime: `server/core/license.js`;
- frontend React/Vite: `client/src`;
- client desktop Electron: `electron`;
- update Windows/Linux: `server/modules/system`, `scripts/windows`, `scripts/linux`;
- update central semnat: `server/modules/system/release-catalog.js` și `server/modules/system/central-update-client.js`.

### 3.2 Model organizațional

Autentificarea încarcă o singură bază și caută utilizatorul direct în `db.users`. Nu introduce un `tenant_id` sau `company_id` în contextul fiecărei cereri.

- **CONFIRMAT DIN COD:** separarea normală este o instalație și o bază per client.
- **INFERAT:** hosted trebuie exploatat cu baze sau instanțe izolate per client.
- **NECONFIRMAT:** izolarea multi-tenant sigură pentru mai multe companii în aceeași bază.

## 4. Auditul licențierii

### 4.1 Format și autentificare

Licența runtime conține cel puțin:

- `licenseId`;
- `client`;
- `pachet`;
- `module`;
- `addons`;
- `limite`;
- `valabilitate`;
- `semnatura`.

Semnătura este verificată RSA/SHA-256 cu cheia publică instalată în `server/core/license.js`, funcția `verificaLicenta`.

Perioada de grație implementată este de 14 zile după expirare.

### 4.2 Constatări

1. **CONFIRMAT DIN COD:** lista modulelor și add-on-urilor este flexibilă și poate reprezenta combinații personalizate.
2. **CONFIRMAT DIN COD:** licența poate fi înlocuită din Setări, este verificată și importul este auditat în `server/modules/system/license-routes.js`.
3. **CONFIRMAT DIN COD:** datele modulelor nu sunt șterse la schimbarea licenței; reactivarea ulterioară ar trebui să le regăsească.
4. **CONFIRMAT DIN COD:** limita de utilizatori este raportată ca neblocantă în ruta modernă de licență.
5. **RISC P1:** există două formate sau verificatoare de licență:
   - formatul RSA folosit la pornirea aplicației;
   - formatul `payload + signature` din `server/core/setup.js`.
   Acestea trebuie unificate înainte de distribuția comercială.
6. **RISC P1:** generatorul complet al licențelor comerciale `.iflic` nu se află în repository. Există generatorul de chei și generatorul licențelor serviciului de update, dar instrumentul proprietarului care produce licențele aplicației nu a putut fi auditat.
7. **RISC P1:** nu a fost identificată o validare sigură a legării licenței de hardware, instalație, domeniu, bază de date sau fingerprint de server.
8. **RISC P2:** câmpul `payload_hash` este extras, dar nu este verificat separat. Semnătura protejează payload-ul rămas, însă existența câmpului poate crea confuzie.
9. **RISC P1:** pachetele comerciale sunt definite în mai multe locuri, cu posibilitatea apariției unor liste divergente:
   - `COMMERCIAL_PROFILES` din `license-routes.js`;
   - `commercialPackages` din `settings-routes.js`;
   - maparea permisiunilor din `permissions.js`;
   - catalogul intern de ofertare.

### 4.3 Upgrade și downgrade

- Upgrade-ul permite module și drepturi suplimentare printr-o licență nouă.
- La downgrade datele rămân, iar interfața ar trebui să ascundă modulele retrase.
- La reactivare, datele existente ar trebui să redevină disponibile.
- Nu a fost identificată o migrare inversă sau o ștergere automată a datelor.

Acesta este comportamentul recomandat pentru un ERP comercial și trebuie păstrat.

## 5. Delimitarea Core și module comerciale

### 5.1 Funcții recomandate pentru Core

- autentificare;
- utilizatori;
- roluri și permisiuni;
- profil organizație;
- audit;
- notificări;
- fișiere și controlul descărcării;
- task-uri de sistem;
- motorul generic de aprobări;
- configurarea modulelor;
- backup, restore și update;
- catalogul generic de parteneri;
- catalogul generic de produse și servicii, fără operațiuni de stoc;
- gestionarea secretelor și adaptoarelor externe.

### 5.2 Module comerciale

- CRM;
- Stocuri/Gestiune;
- Achiziții;
- Contabilitate;
- HR;
- Flotă;
- Logistică;
- Contracte;
- Controlling;
- Juridic;
- City Services;
- AI Assistant.

Recomandarea arhitecturală este ca partenerul comercial, produsul sau serviciul generic și interfața furnizorilor de facturare să fie servicii comune Core. Stocurile, Contabilitatea și CRM trebuie să le consume fără să devină obligatorii unul pentru altul.

## 6. Matricea dependențelor

| Modul | Funcționalități existente | Dependențe obligatorii | Dependențe opționale și integrări | Modificări necesare |
|---|---|---|---|---|
| CRM | lead-uri, contacte, oferte, revizii, comenzi | Core, MSSQL | Stocuri, Achiziții, Contabilitate, SMTP, Oblio | separarea fundației de facturare |
| Stocuri | materiale, intrări/ieșiri, inventar | Core | Achiziții, Producție, CRM | uniformizarea cheilor `inventory/stock` |
| Achiziții | necesar, comenzi, recepții, PAAP | Core | Stocuri, Contracte, CRM | verificarea gate-ului de licență |
| Documente | circuit, aprobări, fișiere | Core | toate modulele | serviciu comun justificat |
| Tichete | incidente și suport | Core | notificări, task-uri | fără problemă majoră identificată |
| Contracte | dosar, consum, alerte | Core | CRM, Achiziții, Documente | gate backend uniform |
| Producție | rețete, planuri, consum | Core; Stocuri funcțional | Controlling | dependență comercială explicită |
| Flotă | parc, foi, FAZ, GPS | Core | HR, Logistică, GPS | gate de licență |
| Proiecte/Teren | jurnale, progres, fotografii | Core | Documente, Flotă | gate de licență |
| HR | angajați, pontaj, concedii | Core | Documente, Contabilitate | verificare completă permisiuni |
| Contabilitate | facturi, jurnale, rapoarte | Core | CRM, Oblio, ANAF | fundația terților poate deveni comună |
| Juridic | dosare și termene | Core | Contracte, Documente | gate de licență |
| Registratură | registre și corespondență | Core | Documente | gate de licență |
| Arhivă | arhivare și regăsire | Core | Documente | gate de licență |
| Controlling | centre și costuri | Core | Producție, Flotă, Contabilitate | gate de licență |
| City Services | rute și intervenții | Core | Flotă, Teren, Contracte | păstrarea profilului compus |
| AI Assistant | asistent contextual | Core | API Anthropic, modulele permise | filtrare strictă a datelor accesibile |

## 7. Audit CRM fără Stocuri

### 7.1 Funcționalități confirmate

- **CONFIRMAT DIN COD:** ofertele acceptă poziții `material`, `service` și `custom` în `server/modules/crm/quote-service.js`.
- Liniile ofertelor nu trebuie să aibă obligatoriu identificator de material.
- Oferta are revizii distincte.
- Oferta aprobată nu mai poate fi editată; se creează o revizie nouă.
- Clientul decide prin link tokenizat, limitat și cu expirare.
- Comanda se creează numai din ofertă acceptată.
- Crearea comenzii este idempotentă.
- Verificarea stocului este un endpoint separat.
- Aprovizionarea este un endpoint separat și necesită explicit o verificare de stoc anterioară.
- Proforma internă nu folosește stocul.
- Oblio transmite `useStock: 0`, `productType: Serviciu` și `save: 0`.
- Emiterea repetată este limitată prin chei de idempotency.
- Factura reală Oblio necesită confirmare explicită.

### 7.2 Limitări

- Acceptarea clientului este implementată.
- Aprobarea internă a ofertei este implementată.
- Nu a fost identificat un flux separat, configurabil, de acceptare a comenzii de către mai multe părți; comanda este creată din oferta acceptată.
- Factura Oblio depinde de factura draft internă și de terțul contabil.
- Proforma Oblio nu depinde de Stocuri, dar necesită un terț contabil.

### 7.3 Verdict comercial CRM

Poate fi oferit următorul pachet:

```text
CRM / Sales
+ Documente
+ Mesaje
+ Tichete
+ Oblio opțional
- fără Stocuri
- fără Achiziții
```

Pentru „Facturare completă” trebuie inclusă Contabilitatea sau extrasă fundația minimală de facturare în Core.

## 8. Activarea și dezactivarea modulelor

### 8.1 Frontend

Setările dezactivează controalele modulelor nelicențiate, iar meniurile sunt filtrate după configurație și licență.

### 8.2 Backend

CRM verifică succesiv:

1. autentificarea;
2. permisiunea;
3. licența;
4. starea activă a modulului;
5. disponibilitatea schemei MSSQL.

Implementarea de referință este `requireCrm` din `server/modules/crm/routes.js`.

Pentru restul modulelor, routerele sunt montate necondiționat în `server/app.js`. Majoritatea endpoint-urilor verifică permisiuni, dar filtrarea licenței depinde de `db.settings.license`, în timp ce licența importată runtime este păstrată și în `global.LICENTA`.

### 8.3 Risc

**RISC P1:** există posibilitatea unei nealinieri între:

- licența `.iflic` încărcată în `global.LICENTA`;
- licența normalizată din `db.settings.license`;
- `modules_enabled`;
- permisiunile rolului.

Este recomandat un singur serviciu `effectiveEntitlements`, utilizat de toate API-urile și de frontend.

## 9. Securitate și permisiuni

### 9.1 P0 — acces generic la fișierele storage

Ruta `/storage` cere autentificare și previne path traversal, dar nu verifică dacă utilizatorul are dreptul asupra obiectului sau documentului solicitat. Un utilizator autentificat care află calea unui document poate încerca să îl descarce.

Recomandare: eliminarea rutei generice sau introducerea autorizării pe tip de obiect și înregistrare.

### 9.2 P1 — gate de licență neuniform

Nu există un middleware central per modul. CRM îl implementează, dar aceeași protecție nu a fost demonstrată pentru toate modulele.

### 9.3 P1 — mapare incompletă licență-permisiuni

`licenseModulePermissions` din `server/core/permissions.js` conține doar o parte dintre module și utilizează chei precum `stock`, `mechanization` și `cost_accounting`, în timp ce catalogul comercial utilizează `inventory`, `fleet`, `controlling`, `contract_management`, `hr`, `documents` și altele.

### 9.4 P1 — izolare multi-company nedemonstrată

Dacă fiecare client are propria bază, riscul este controlat operațional. Dacă aceeași bază ar găzdui mai mulți clienți, modelul curent nu este suficient.

### 9.5 P2 — sesiuni exclusiv în memorie

Sesiunile sunt păstrate într-un `Map`. Restartul deloghează utilizatorii, iar scalarea pe mai multe procese sau noduri nu este posibilă fără un session store partajat.

## 10. Self-service și configurare inițială

### 10.1 Mecanisme existente

- wizard de instalare;
- profil organizație;
- creare Superadmin;
- administrare utilizatori și roluri;
- administrare module;
- configurare SMTP/IMAP;
- configurare Oblio;
- Ajutor administrabil;
- import/export Ajutor;
- onboarding și checklist;
- diagnostic hosted și security;
- update Stable/Preview.

### 10.2 Intervenții manuale rămase

- instalarea SQL Server și crearea bazei;
- configurarea serviciului Windows sau systemd;
- configurarea APP_KEY și a secretelor;
- emiterea și transmiterea licenței;
- configurarea domeniului sau tunelului;
- configurarea SMTP/IMAP;
- configurarea credențialelor Oblio;
- configurarea backupului extern și testarea restaurării;
- maparea rolurilor reale;
- validarea modulelor contractate.

Pentru lansare, acestea trebuie transformate într-un checklist de predare verificabil. Nu este obligatoriu ca toate să fie automatizate înaintea primului pilot.

## 11. Hosted și On-Premise

### 11.1 Compatibilitate confirmată

- Licența este verificată local, deci aplicația poate funcționa offline.
- MSSQL este sursa operațională.
- Windows utilizează Task Scheduler și clientul Electron.
- Linux utilizează systemd și pachet TAR.GZ.
- Update-urile folosesc catalog semnat, SHA-256, ticket temporar, backup și rollback.
- Există canale Stable și Preview.

### 11.2 Funcții indisponibile fără internet

- Oblio;
- SMTP/IMAP extern;
- AI Anthropic;
- GPS extern;
- WhatsApp;
- curs BNR live;
- update online.

Aplicația locală trebuie să degradeze controlat atunci când aceste servicii nu sunt accesibile.

### 11.3 Entry point

**ÎNCHIS LOCAL:** `server/app.js` este entry point-ul canonic pentru manifestele
NPM, deployment Windows/Linux, demo, smoke și acceptanță. Vechiul
`server/src/server.js` rămâne numai adaptor de compatibilitate și deleagă pornirea
către aceeași funcție, fără listener sau tratare de proces duplicată.

## 12. Probleme și prioritizare

| Prioritate | Problemă | Recomandare |
|---|---|---|
| P0 | `/storage` fără autorizare pe obiect | înainte de lansare |
| P1 | gate backend uniform pentru licență și module | înainte de lansare |
| P1 | unificarea formatelor și surselor de licență | înainte de lansare |
| P1 | mapare completă module → permisiuni | înainte de lansare |
| P1 | test downgrade prin URL și API | înainte de lansare |
| Închis local | entry point unic `server/app.js` | verificat în sursă și teste |
| P1 | clarificarea CRM și a facturării minimale | înaintea ofertării comerciale |
| P1 | auditarea generatorului `.iflic` proprietar | înainte de lansare |
| P1 | definirea modelului Hosted per client | înainte de lansare |
| P2 | legarea licenței de instalație | recomandat |
| P2 | session store persistent | după pilot, înainte de scalare |
| P2 | catalog unic pentru pachete | recomandat înaintea unui volum mare de oferte |
| P3 | automatizare completă provisioning | după primele instalări |

## 13. Estimări de efort

Estimările sunt orientative și nu includ remedierea regresiilor suplimentare descoperite în timpul implementării:

- middleware central de entitlement și mapare module: **3–5 zile**;
- teste automate URL/API pentru fiecare modul: **3–5 zile**;
- unificarea formatului și importului de licență: **2–4 zile**;
- autorizare completă storage: **2–5 zile**, în funcție de toate tipurile de fișiere;
- separarea billing foundation din Contabilitate: **4–8 zile**;
- testare downgrade/reactivare și păstrarea datelor: **2–3 zile**;
- testare installer Hosted/On-Premise: **2–4 zile**.

## 14. Plan propus de implementare și testare

### Etapa 1 — blocante de securitate și lansare

1. Inventarierea tuturor fișierelor servite din `storage`.
2. Înlocuirea accesului generic cu download-uri autorizate pe obiect.
3. ✅ Entry point oficial stabilit: `server/app.js`; adaptorul legacy nu mai
   implementează un runtime paralel.
4. Confirmarea modelului Hosted: bază separată per client.

### Etapa 2 — drepturi comerciale

1. Definirea unui catalog canonic al modulelor și aliasurilor.
2. Implementarea unui singur `effectiveEntitlements`.
3. Aplicarea middleware-ului de modul pe toate API-urile.
4. Folosirea aceleiași surse în frontend și backend.
5. Auditarea importului și a schimbării licenței.

### Etapa 3 — licențiere

1. Unificarea formatelor `.iflic`.
2. Auditarea generatorului proprietar.
3. Stabilirea politicii pentru mutarea licenței între servere.
4. Stabilirea politicii pentru expirare și read-only.
5. Testarea upgrade/downgrade/reactivare.

### Etapa 4 — CRM comercial independent

1. Test CRM fără Stocuri și fără Achiziții.
2. Test ofertă cu servicii și poziții custom.
3. Test comandă fără verificare de stoc.
4. Test proformă internă și Oblio.
5. Decizie privind fundația minimală de partener și facturare.
6. Testarea idempotency la emitere repetată.

### Etapa 5 — pachete finale

1. Matrice pachet → module → limite.
2. Reguli comerciale păstrate separat de licență.
3. Testarea arhivelor Windows și Linux.
4. Test instalare curată, update și rollback.
5. Checklist de predare client.

## 15. Întrebări care necesită decizia proprietarului

1. Limita de utilizatori rămâne avertizare comercială sau devine blocantă?
2. Licența trebuie legată de instalație sau poate fi mutată manual între servere?
3. Pachetul CRM simplu include proforma Oblio?
4. Factura Oblio necesită obligatoriu modulul Contabilitate?
5. Hosted va rula o bază separată pentru fiecare client?
6. La expirarea licenței se păstrează acces read-only la date sau rămân accesibile numai Setări, Export și Backup?
7. La downgrade, clientul poate vedea rapoartele istorice ale modulului retras sau modulul devine complet inaccesibil?

## DECIZII RECOMANDATE

1. Se păstrează licențierea prin fișier; mecanismul nu trebuie reconstruit.
2. Se permit licențe personalizate independent de numele pachetului comercial.
3. Licența tehnică trebuie să conțină numai module, limite, perioadă și identificatori.
4. Prețurile, discounturile și condițiile contractuale rămân în ofertare și contract, nu în licență.
5. CRM poate fi vândut fără Stocuri.
6. Pentru Oblio se separă comercial proforma, factura completă și contabilitatea completă.
7. Hosted va utiliza baze sau instanțe izolate per client până la implementarea explicită a unei arhitecturi multi-tenant.

## DE IMPLEMENTAT

1. Un singur serviciu `effectiveEntitlements`.
2. Middleware backend obligatoriu per modul.
3. Catalog canonic unic al modulelor și aliasurilor.
4. Unificarea formatului `.iflic`.
5. Autorizare pe obiect pentru fișiere.
6. Fundație comercială comună pentru parteneri, produse/servicii și billing.
7. Clarificarea entry point-ului oficial.

## DE TESTAT

1. Licență CRM fără Stocuri.
2. Acces direct URL/API la un modul nelicențiat.
3. Upgrade și downgrade fără pierdere de date.
4. Reinstalare și importarea aceleiași licențe.
5. Copierea licenței pe altă instalație.
6. Depășirea limitei de utilizatori.
7. CRM servicii → comandă → proformă Oblio.
8. Emitere repetată Oblio.
9. Expirarea licenței și cele 14 zile de grație.
10. Instalare offline On-Premise.
11. Backup și rollback pe Windows și Linux.
12. Generatorul proprietar de licențe.

## RISCURI / ÎNTREBĂRI DESCHISE

- aplicarea licenței nu este încă uniform demonstrată pe toate API-urile;
- generatorul comercial `.iflic` nu a putut fi auditat;
- licența nu este demonstrat legată de instalație;
- există mai multe surse pentru pachete și drepturi;
- accesul generic la `storage` nu verifică dreptul asupra obiectului;
- modelul multi-company în aceeași bază nu este demonstrat sigur;
- factura Oblio are o dependență reală de fundația Contabilitate;
- entry point-ul sursei și cel al deploymentului trebuie unificate.

## Concluzie

InfraFlow poate construi ofertele și pachetele personalizate pe mecanismul actual de licențiere, iar CRM poate fi comercializat fără Stocuri. Nu este necesară refacerea licențierii, dar aplicarea drepturilor în backend trebuie uniformizată înainte de lansarea comercială.
