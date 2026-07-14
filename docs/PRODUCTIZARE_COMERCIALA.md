# InfraFlow — productizare comercială modulară

Data: `2026-07-14`  
Status: direcție activă de produs

## Poziționare

InfraFlow este un ERP modular self-hosted / cloud-ready pentru firme private, servicii publice și instituții care au nevoie de operațional, documente, HR, contabilitate, teren și raportare într-un singur sistem.

Produsul nu mai este legat de un client pilot. Orice referință la date reale istorice trebuie tratată ca material de test/migrare, nu ca identitate de produs.

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
| Contabilitate | contabil intern | contabilitate, declarații, SAF-T, D112, salarizare, dosar fiscal |
| City Services | servicii publice | salubrizare, deszăpezire, siguranță circulație, mediu |
| Enterprise | organizații mari | toate modulele + workflow avansat + AI + integrări |

## Profiluri de pornire

La instalare / demo, aplicația trebuie să poată porni cu profil:

- firmă privată generală;
- construcții / asfalt;
- servicii publice;
- instituție publică;
- HR + salarizare;
- contabilitate;
- demo complet.

Profilul activează module, exemple și pași recomandați, dar nu blochează utilizatorul.

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
5. Demo generic resetabil.
6. Revenire la splituri tehnice, dar cu componente pregătite pentru modularizare comercială.
