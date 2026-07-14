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

1. `locale` și `country` în profilul organizației.
2. Catalog intern de țări: RO, EN/global demo, apoi țări țintă.
3. Separare traduceri UI de reguli legislative.
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

## Reguli de decuplare de client

- Nu se adaugă nume de client în fallback-uri, template-uri implicite sau UI.
- Exemplele trebuie să folosească `Organizație Demo`, `Construct Demo SRL` sau date generice.
- Datele istorice reale pot rămâne în backup-uri sau documente de migrare, dar nu sunt prezentate ca identitate InfraFlow.
- Orice modul nou trebuie să funcționeze fără departamente sau fluxuri presupuse de un client anume.
- Orice integrare externă se prezintă ca adaptor configurabil.

## Direcție imediată

1. Curățare referințe vizibile la client pilot.
2. Introducere configurare module active / licență.
3. Checklist onboarding organizație.
4. Helper contextual reutilizabil în UI.
5. Profil organizație cu limbă, țară, monedă și jurisdicție.
6. Demo generic resetabil.
7. Roadmap module verticale: WMS, Logistics, Ecarisaj/Public Health.
8. Revenire la splituri tehnice, dar cu componente pregătite pentru modularizare comercială.
