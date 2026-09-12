# InfraFlow — listă prioritară de îmbunătățiri comerciale

Data: `2026-09-06`  
Versiune de pornire: `2.12.533`  
Ultimul pas executat: 2.12.551 — Setări General pe carduri și TVA extensibil
Status: backlog operațional activ

## Scop

Această listă este șina de lucru după auditul aplicației. Nu înlocuiește backlog-ul complet din `AGENTS.md`, ci îl transformă în pași executabili, mici, verificabili și potriviți pentru update-uri succesive.

Principiul de produs rămâne simplu:

> InfraFlow poate fi foarte complex în spate, dar utilizatorul trebuie să vadă mereu următorul pas clar.

## Ordinea recomandată

### 1. Securitate fișiere și atașamente

Obiectiv: niciun fișier sensibil să nu fie accesibil prin scurtături directe sau linkuri greu de auditat.

Pași:

- audit automat pentru expuneri de fișiere; ✅ `v2.12.534`
- curățare linkuri directe detectate în `FisaVehicul.jsx` și `MyVehicle.jsx`; ✅ `v2.12.535`
- mutare graduală a tuturor descărcărilor de fișiere către endpoint-uri dedicate pe entitate; în progres: referințe Mecanizare sanitizate ✅ `v2.12.536`; atașamente Tichete securizate ✅ `v2.12.537`; Secretariat securizat ✅ `v2.12.538`; scheme ANAF Contabilitate securizate ✅ `v2.12.539`
- verificare permisiune pe dosar, document, contract, email sau task înainte de download;
- audit pentru descărcări sensibile;
- mesaje clare când utilizatorul nu are drepturi.

Primele șase update-uri recomandate sunt finalizate: audit automat expuneri fișiere ✅ `v2.12.534`; curățare linkuri directe Fleet ✅ `v2.12.535`; referințe documente parc sanitizate ✅ `v2.12.536`; atașamente Tichete prin download controlat ✅ `v2.12.537`; Secretariat cu upload/download controlat ✅ `v2.12.538`; scheme ANAF fără path intern în API ✅ `v2.12.539`.

### 2. Audit autentificări, stații și permisiuni

Obiectiv: administratorul să vadă rapid încercări suspecte și schimbări cu impact mare.

Pași:

- jurnal pentru login eșuat, login reușit și logout; ✅ `v2.12.540`
- jurnal pentru stații noi sau sesiuni noi; ✅ `v2.12.542`
- audit vizibil pentru modificări de roluri, permisiuni, utilizatori, stații și politici sensibile; ✅ `v2.12.541`
- filtre în Setări → Securitate pentru evenimente critice. ✅ `v2.12.541`
- registru de risc pentru stații autorizate, sesiuni active și dispozitive vechi; ✅ `v2.12.542`

### 3. Simplitate operațională pe fiecare modul

Obiectiv: ecranele să nu pară pline doar pentru că sistemul este puternic.

Pași:

- card „Următorul pas” pe modulele mari;
- grupare acțiuni rare sub „Avansat”;
- eliminare dubluri de navigare pentru integrări; Cântarul separat de Conectări externe ✅ `v2.12.550`;
- Setări General rafinat pe carduri și TVA configurabil pe profil de țară ✅ `v2.12.551`;
- explicații scurte pentru blocaje;
- buton principal unic pe fiecare ecran important;
- mod compact pentru operatori.
- pattern reutilizabil pentru tabele lungi compacte, aplicat inițial pe Setări → Securitate; ✅ `v2.12.543`
- extindere liste compacte în Documente și Contracte, fără pierderea accesului la lista completă; ✅ `v2.12.544`

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

- eliminare referințe vizibile la client pilot din UI, demo și fallback-uri; în progres: roluri și permisiuni genericizate ✅ `v2.12.549`;
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

- nomenclator coduri NC pentru operațiuni comerciale și raportări care îl cer;
- e-Transport ca adaptor România, activ doar pe profil/jurisdicție România;
- legare factură/aviz/transport cu documentele comerciale și fiscale;
- reconciliere pe sursele ERP care alimentează contabilitatea;
- explicații pentru blocaje fiscale/salarizare;
- exporturi mai clare pentru dosarul lunar;
- audit de modificări pe documente contabile importante.

### Logistică / Transport

- emitere CMR, bon de transport, aviz de însoțire și documente conexe din modulele relevante;
- flux transport: comandă/livrare → document transport → atașamente/dovezi → factură/contract;
- integrare coduri NC unde sunt necesare pentru mărfuri și raportări;
- adaptoare pe țară: e-Transport pentru România, echivalente locale pentru alte jurisdicții când există;
- pregătire pentru date din `LISTA-CODURI-NC-2024.ods` sau surse oficiale mai noi, validate înainte de import.

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
