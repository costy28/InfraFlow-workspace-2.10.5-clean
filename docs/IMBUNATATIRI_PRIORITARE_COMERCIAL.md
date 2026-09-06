# InfraFlow — listă prioritară de îmbunătățiri comerciale

Data: `2026-09-06`  
Versiune de pornire: `2.12.533`  
Status: backlog operațional activ

## Scop

Această listă este șina de lucru după auditul aplicației. Nu înlocuiește backlog-ul complet din `AGENTS.md`, ci îl transformă în pași executabili, mici, verificabili și potriviți pentru update-uri succesive.

Principiul de produs rămâne simplu:

> InfraFlow poate fi foarte complex în spate, dar utilizatorul trebuie să vadă mereu următorul pas clar.

## Ordinea recomandată

### 1. Securitate fișiere și atașamente

Obiectiv: niciun fișier sensibil să nu fie accesibil prin scurtături directe sau linkuri greu de auditat.

Pași:

- mutare graduală a tuturor descărcărilor de fișiere către endpoint-uri dedicate pe entitate;
- verificare permisiune pe dosar, document, contract, email sau task înainte de download;
- audit pentru descărcări sensibile;
- mesaje clare când utilizatorul nu are drepturi.

Primul update recomandat: audit automat care detectează expuneri rămase către `/storage` sau path-uri interne în API.

### 2. Audit autentificări, stații și permisiuni

Obiectiv: administratorul să vadă rapid încercări suspecte și schimbări cu impact mare.

Pași:

- jurnal pentru login eșuat, login reușit și logout;
- jurnal pentru stații noi sau sesiuni noi;
- audit vizibil pentru modificări de roluri, permisiuni și politici de securitate;
- filtre în Setări → Securitate pentru evenimente critice.

### 3. Simplitate operațională pe fiecare modul

Obiectiv: ecranele să nu pară pline doar pentru că sistemul este puternic.

Pași:

- card „Următorul pas” pe modulele mari;
- grupare acțiuni rare sub „Avansat”;
- explicații scurte pentru blocaje;
- buton principal unic pe fiecare ecran important;
- mod compact pentru operatori.

Module prioritare: Documente, Contracte, HR, Parc & Resurse, Contabilitate.

### 4. Modularizare tehnică fără rescriere riscantă

Obiectiv: fișierele foarte mari să fie sparte gradual, fără schimbare de comportament.

Pași:

- inventar automat al fișierelor mari;
- extragere helper-e pure în `server/shared` sau `client/src/shared`;
- split pe subcomponente unde UI-ul depășește o zonă logică;
- teste/smoke după fiecare split.

Regulă: nu se rescrie un modul funcțional; se extrage treptat.

### 5. Curățare comercială și internaționalizare

Obiectiv: aplicația să fie generală, configurabilă și pregătită pentru clienți diferiți.

Pași:

- eliminare referințe vizibile la client pilot din UI, demo și fallback-uri;
- păstrare termenilor de asfalt doar în profil/modul unde sunt relevanți;
- mutare texte și reguli locale către profil de țară;
- template-uri documente pe limbă și jurisdicție.

### 6. Pregătire release comercial

Obiectiv: fiecare update important să poată fi livrat și verificat rapid.

Pași:

- audit local complet înainte de ZIP;
- smoke comercial cu fluxuri reale;
- listă „ce s-a schimbat” pe înțelesul clientului;
- build EXE periodic după pachete mari de update-uri;
- demo curat, resetabil, fără date istorice de client.

## Backlog pe module

### Core / Sistem

- 2FA pentru administratori și roluri sensibile;
- audit securitate vizibil: login, permisiuni, stații, remote access;
- politici de sesiune diferențiate pe rol;
- diagnostic update/restart mai explicit pentru instalări Windows.

### Dashboard

- „Ce am de făcut azi” pe rol;
- radar de blocaje pe module active;
- onboarding adaptat pachetului comercial ales;
- ascunderea cardurilor irelevante când modulul nu este activ.

### Documente / Workflow

- endpoint-uri dedicate pentru toate atașamentele;
- simulator de flux mai simplu pentru administrator;
- timeline document compact;
- reguli de escaladare aplicate automat și auditate;
- template-uri pe limbă/țară.

### Contracte

- consum automat din facturi, NIR-uri, comenzi și situații;
- manager de contract cu responsabilități clare;
- alertă prag valoric și termen;
- raport de închidere contract;
- CPV și PAAP active doar pe profil România / achiziții publice.

### HR

- dosar angajat mai ghidat;
- checklist contract/date obligatorii pe țară;
- REGES doar ca adaptor România;
- salarizare explicată pe blocaje, nu doar calcule.

### Contabilitate

- reconciliere pe sursele ERP care alimentează contabilitatea;
- explicații pentru blocaje fiscale/salarizare;
- exporturi mai clare pentru dosarul lunar;
- audit de modificări pe documente contabile importante.

### Parc & Resurse / Mecanizare

- alimentări manuale complet autonome față de PIUSI;
- adaptoare CSV/Excel pentru furnizori diferiți;
- alertă carburant/stoc estimat mai vizibilă;
- timeline operațional simplificat pentru resurse.

### Gestiune / Depozit

- locații, rafturi, zone, loturi și seriale;
- inventariere mobilă;
- picking/packing pentru WMS;
- trasabilitate intrare → consum → factură.

### Achiziții / Referate

- traseu mai scurt pentru firme private;
- PAAP/CPV doar când profilul o cere;
- referate transformabile în comandă/contract/document;
- explicații clare pentru praguri și bugete.

### Mesaje / Email / Task-uri

- reguli email mai ușor de înțeles;
- email → task/document/contract cu pași ghidați;
- task-uri personale și delegate în dashboard;
- notificări în Kiosk doar pentru ce cere acțiune.

## Regula de lucru

Fiecare update viitor trebuie să aleagă un singur punct mic din lista de mai sus, să îl implementeze, să îl verifice și să îl marcheze în `AGENTS.md` / changelog.
