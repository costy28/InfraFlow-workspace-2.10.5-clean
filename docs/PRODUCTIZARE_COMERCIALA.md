# InfraFlow — productizare comercială modulară

Data: `2026-07-14`  
Status: direcție activă de produs

## Poziționare

InfraFlow este un ERP modular self-hosted / cloud-ready pentru firme private, servicii publice și instituții care au nevoie de operațional, documente, HR, contabilitate, teren, depozite, logistică și raportare într-un singur sistem.

Produsul nu mai este legat de un client pilot. Orice referință la date reale istorice trebuie tratată ca material de test/migrare, nu ca identitate de produs.

Direcția comercială pe termen mediu este internațională: aceeași platformă trebuie să poată porni în limba și țara alese de client, cu reguli, formulare, termene și nomenclatoare adaptabile pe jurisdicție.

## Principiu de produs

Aplicația poate fi complexă în profunzime, dar trebuie să pară simplă la suprafață.

Regula de aur:

> Utilizatorul nu trebuie să știe ce modul, tabel sau flux tehnic se află în spate. El trebuie să vadă următorul pas clar.

## Pachete comerciale propuse

| Pachet | Pentru cine | Module principale |
| --- | --- | --- |
| Core | orice organizație | Dashboard, utilizatori, roluri, documente, notificări, audit, backup/update |
| HR | firme cu angajați | Angajați, contracte, pontaj, concedii, dosar personal, echipamente, Kiosk |
| Operațional | servicii / teren | Fleet, mecanizare, foi parcurs, lucrări teren, GPS, echipamente |
| Gestiune + Achiziții | depozite / administrativ | stocuri, comenzi, recepții, PAAP, referate, furnizori |
| Warehouse / WMS | depozite mici-medii-mari | locații, rafturi, loturi, seriale, picking, packing, transferuri, inventariere mobilă |
| Logistics | distribuție / transport | comenzi transport, rute, încărcări, livrări, POD, cost/km, integrare fleet |
| Contabilitate | contabil intern | contabilitate, declarații, SAF-T, D112, salarizare, dosar fiscal |
| Task Management | echipe mixte / management | task-uri personale, task-uri delegate, subordonați, scadențe, status, comentarii, legare la documente/contracte/module |
| City Services | servicii publice | salubrizare, deszăpezire, siguranță circulație, mediu |
| Public Health / Ecarisaj | servicii specializate | sesizări, capturi, transport, carcase/animale, documente sanitar-veterinare, trasee |
| Enterprise | organizații mari | toate modulele + workflow avansat + AI + integrări |

## Profiluri de pornire

La instalare / demo, aplicația trebuie să poată porni cu profil:

- firmă privată generală;
- construcții / asfalt;
- servicii publice;
- instituție publică;
- HR + salarizare;
- contabilitate;
- depozit / logistică;
- servicii specializate: salubrizare, ecarisaj, mediu, teren;
- demo complet.

Profilul activează module, exemple și pași recomandați, dar nu blochează utilizatorul.

## Internaționalizare și profil de țară

InfraFlow trebuie gândit ca platformă multi-country, nu ca aplicație cu texte traduse superficial.

Profilul de țară controlează gradual:

- limba interfeței și fallback-ul de traduceri;
- formatul datelor, numerelor, monedei și adreselor;
- denumirile câmpurilor fiscale și comerciale;
- nomenclatoare locale: coduri fiscale, forme juridice, regiuni, orașe, coduri poștale;
- reguli legislative pe modul: HR, salarizare, fiscal, achiziții publice, mediu, servicii publice;
- template-uri documente și rapoarte specifice țării;
- termene legale, alerte și checklisturi locale.

Regulă de implementare:

> În codul nou nu se hardcodează legislație românească acolo unde regula poate deveni profil de țară. România rămâne primul profil complet, dar nu singurul model mental.

Etape recomandate:

1. `locale`, `country`, `currency`, `timezone` și `jurisdiction_profile` în profilul organizației. ✅ Fundație tehnică în v2.12.300.
2. Catalog intern de țări: RO, EN/global demo, apoi țări țintă. ✅ Endpoint inițial în v2.12.300.
3. Separare traduceri UI de reguli legislative. ✅ Registry inițial reguli pe țară în v2.12.301; primele defaulturi fiscale consumate din registry în v2.12.302; declarațiile fiscale lunare citite din registry în v2.12.303.
4. Separare template-uri documente pe țară și limbă.
5. Validatoare locale pentru fiscal/HR doar când profilul țării este activ.

## Elemente care cresc adopția

1. **Următorul pas recomandat** pe fiecare ecran important.
2. **Checklist de configurare** per modul.
3. **Tips scurte contextualizate**, nu manuale lungi.
4. **Date demo ușor de resetat**.
5. **Import Excel ghidat** pentru migrare rapidă.
6. **Stări explicite**: lipsesc date, e pregătit, necesită verificare, poate fi trimis.
7. **Buton de acțiune principal clar** pe fiecare pagină.
8. **Explicații contabile/fiscale pe înțelesul operatorului**, nu doar coduri.
9. **Kiosk simplu pentru angajați**, fără încărcare administrativă.
10. **AI helper opțional**, cu răspunsuri pe datele organizației.

## Organizare pe roluri, task-uri și contabilitate ca hub

În multe firme private, contabilitatea nu este doar un modul izolat: primește date din HR, gestiune, achiziții, contracte și documente. InfraFlow trebuie să trateze contabilitatea ca hub de raportare și validare, fără să ofere automat acces operațional complet tuturor contabililor.

Principii:

- contabilitatea vede sinteze și semnale din modulele care o alimentează;
- accesul operațional rămâne granular: HR, gestiune, achiziții, contracte, documente;
- o persoană desemnată doar pentru HR nu primește implicit gestiune sau contabilitate completă;
- o persoană desemnată doar pentru gestiune nu primește implicit HR;
- rolurile pot grupa module pentru firme mici, dar pot separa atribuții pentru firme mari.

Direcție Task Management:

- directorul/șeful poate crea task-uri pentru subordonați;
- orice utilizator își poate crea task-uri personale;
- task-urile pot fi legate de documente, contracte, sesizări, HR, gestiune sau contabilitate;
- fiecare task are responsabil, scadență, prioritate, status, comentarii și istoric;
- dashboard-ul afișează task-urile relevante pentru rolul utilizatorului;
- task-urile delegate trebuie să respecte ierarhia și permisiunile, nu doar departamentul textual.

## Workflow configurabil pe organizație

Nu toate organizațiile aprobă documentele prin aceleași departamente sau în aceeași ordine. InfraFlow trebuie să trateze fluxul de documente ca parte configurabilă a profilului organizației, nu ca traseu fix.

Direcție:

- fluxuri definite pe tip document: referat, contract, factură, HR, juridic, cerere internă etc.;
- pași pe rol, departament, utilizator nominal sau manager direct;
- condiții pe valoare, departament, centru de cost, prioritate, țară/jurisdicție sau sursă document;
- termene, escaladări și notificări configurabile;
- șabloane de flux pentru pornire rapidă, dar editabile de client;
- versionare de flux: documentele deja lansate păstrează traseul valabil la data lansării;
- audit complet pentru orice modificare de flux și pentru fiecare decizie de aprobare.

Regulă de implementare:

> Fluxurile implicite pot exista ca exemple sau șabloane, dar clientul trebuie să poată modifica traseul fără intervenție în cod.

Stadiu implementare:

- `v2.12.459`: direcția este vizibilă în `Setări > Module`.
- `v2.12.460`: șabloanele de flux pot fi editate și salvate în profilul organizației (`settings.workflow_document_flows`).
- `v2.12.461`: documentul lansat în circuit primește snapshot-ul versiunii de flux active, ca aprobările istorice să rămână stabile.
- `v2.12.462`: administratorul poate testa simulat fluxul înainte de lansare, cu inițiator, departament, valoare, prioritate și tip document.
- `v2.12.463`: condițiile pașilor pot fi compuse prin câmp, operator și valoare, fără expresii tehnice.
- `v2.12.464`: condițiile ghidate se salvează și ca `condition_rule` structurat în configurație și în snapshot-ul documentului.
- `v2.12.465`: simulatorul evaluează safe `condition_rule` și marchează pașii care se aplică, ar fi săriți sau au date lipsă.
- `v2.12.466`: Setări afișează diagnostic read-only pentru fluxuri incomplete, aprobatori lipsă, reguli cu valori lipsă și condiții text libere.
- `v2.12.467`: engine-ul aplică `condition_rule` la lansarea documentului și sare doar pașii cu reguli structurate evaluate fals.
- `v2.12.468`: diagnosticul oferă reparații ghidate în draft pentru aprobatori lipsă, termene, reguli și duplicate, cu salvare explicită de către administrator.
- `v2.12.469`: dosarul documentului afișează scenariul evaluat, pașii aplicați și pașii săriți de reguli, cu actual/așteptat.
- `v2.12.470`: editorul de workflow din Setări este responsive pe carduri, iar panoul afișează auditul configurării și ultima salvare.
- `v2.12.471`: modificările șabloanelor workflow sunt păstrate într-un istoric dedicat, vizibil în Setări, cu utilizator, dată, sumar și fluxuri schimbate.
- `v2.12.472`: dosarul documentului afișează auditul deciziilor reale din circuit, cu pas, status înainte/după și următor responsabil.
- `v2.12.473`: dosarul documentului afișează „Următorul pas” și oferă aprobări, respingeri, task-uri de deblocare și lansare draft direct din dosar.
- `v2.12.474`: Dashboard-ul grupează documentele din inbox și cele blocate într-un radar compact cu termen, prioritate și deep-link direct în dosar.
- `v2.12.475`: Inbox-ul Documente primește filtre rapide pentru acțiune, blocaje, scadențe, urgențe, drafturi și documente venite din email.
- `v2.12.476`: Documente permite selecție multiplă, task-uri în masă pentru documentele selectate și export CSV al listei de lucru.
- Următorul pas: marcare „urmărit” / watchlist documente și notificări pe documentele urmărite.

## Fleet / Mecanizare ca modul generic

Mecanizarea nu trebuie să presupună un furnizor unic de import sau o structură moștenită de la un client pilot. Prima experiență trebuie să fie catalogul manual: organizația își adaugă autovehiculele, utilajele și echipamentele, apoi conectează adaptoare doar dacă are nevoie.

Principii:

- autovehiculele și utilajele se pot crea manual, fără import obligatoriu;
- Autominder este tratat ca adaptor opțional și sursă de inspirație pentru date istorice, nu ca model unic;
- PIUSI este tratat ca adaptor opțional pentru carburant, nu ca flux implicit;
- alimentările manuale trebuie să rămână flux complet, inclusiv pentru firme care nu au pompă sau soft dedicat;
- importurile viitoare trebuie să accepte CSV/Excel și furnizori diferiți, cu mapări configurabile;
- următorul pas util este alertarea stocului estimat de carburant pe baza alimentărilor, consumurilor și pragurilor definite de client.

Stadiu implementare:

- `v2.12.477`: Parc & Resurse are butoane vizibile pentru adăugare manuală autovehicul/utilaj, iar tab-ul PIUSI este prezentat generic ca Import carburant cu adaptor opțional.
- `v2.12.478`: Dashboard-ul Parc & Resurse afișează sold carburant estimat lunar din alimentări introduse/importate minus consumul real din bonuri.
- `v2.12.479`: Pragurile pentru alerta de carburant estimat sunt configurabile de organizație și se salvează auditat.
- `v2.12.480`: Soldul estimat de carburant este vizibil pe fiecare utilaj/vehicul, cu status, explicație și acțiuni rapide de completare.
- `v2.12.481`: Panoul carburant pe resursă are filtre rapide pentru probleme și export Excel al listei filtrate.
- `v2.12.482`: Soldul estimat este comparat cu capacitatea rezervorului pentru a marca alimentări duplicate sau bonuri lipsă.

## Reguli de decuplare de client

- Nu se adaugă nume de client în fallback-uri, template-uri implicite sau UI.
- Exemplele trebuie să folosească `Organizație Demo`, `Construct Demo SRL` sau date generice.
- Datele istorice reale pot rămâne în backup-uri sau documente de migrare, dar nu sunt prezentate ca identitate InfraFlow.
- Orice modul nou trebuie să funcționeze fără departamente sau fluxuri presupuse de un client anume.
- Orice integrare externă se prezintă ca adaptor configurabil.
- Seed-urile sau mapările operaționale de la clienți pilot nu se livrează în pachetele comerciale; dacă există istoric, acesta se dezactivează prin migrare versionată.

## Direcție imediată

1. Curățare referințe vizibile la client pilot.
2. Introducere configurare module active / licență.
3. Checklist onboarding organizație.
4. Helper contextual reutilizabil în UI.
5. Separare traduceri UI de regulile legislative pe profil de țară.
6. Template-uri documente pe țară și limbă.
7. Demo generic resetabil.
8. Roadmap module verticale: WMS, Logistics, Ecarisaj/Public Health.
9. Revenire la splituri tehnice, dar cu componente pregătite pentru modularizare comercială.
