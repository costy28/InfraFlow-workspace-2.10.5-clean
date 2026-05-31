# Arhitectura InfraFlow 1.0

## Model general

InfraFlow 1.0 foloseste arhitectura server-client:

- server intern in reteaua firmei;
- baza SQL Server separata pentru InfraFlow;
- API versionat;
- client desktop Windows pentru statii de lucru;
- acces Android/PWA ulterior, doar prin reteaua interna sau VPN;
- licentiere pe firma, module, utilizatori si statii.

## Module standard

| Modul | Rol |
| --- | --- |
| Productie | retete, consumuri, planificari, vanzari asfalt |
| Gestiune | stoc general, miscari, fise, transferuri, confirmari |
| Achizitii | comenzi, furnizori, receptii partiale |
| Tehnic | lucrari, ore utilaje, situatii, productie pe lucrare |
| Mecanizare | utilaje, autovehicule, solicitari, programari, pontaje |
| Contabilitate | centre de cost, subcentre, cheltuieli, rapoarte |
| Betoane | productie si solicitari beton, ulterior |
| Asternere asfalt | lucrari, materiale si utilaje, ulterior |
| Siguranta circulatiei | materiale si lucrari specifice, ulterior |
| Canalizare | lucrari, materiale si utilaje, ulterior |

## API

Prefix standard:

```text
/api/v1
```

Reguli:

- raspunsuri JSON consistente;
- autentificare cu sesiune/token server-side;
- permisiuni verificate pe server;
- audit pentru actiuni critice;
- paginare pe liste mari;
- filtre identice intre ecran, export si print;
- endpointurile breaking se muta in `/api/v2`.

## Baza de date

Schema este impartita pe domenii:

- `core`: firma, setari, module, roluri, utilizatori, statii, audit;
- `inventory`: materiale, stocuri, miscari si transferuri;
- `production`: retete, consumuri, planuri, vanzari;
- `procurement`: furnizori, comenzi, receptii;
- `workflow`: solicitari, pasi, statusuri, audit workflow;
- `fleet`: utilaje, autovehicule, programari, pontaje;
- `accounting`: centre de cost si cheltuieli;
- `integration`: Cantar Auto, Nexus, Autominder;
- `work`: lucrari, santiere, contracte.

## Client desktop

Clientul Windows este un shell WebView2:

- citeste adresa serverului din configuratie;
- verifica `/api/v1/version` la pornire;
- afiseaza aplicatia in fereastra proprie;
- daca serverul nu raspunde, arata mesaj clar;
- nu contine baza de date.

## Update

Serverul se actualizeaza controlat:

1. backup baza;
2. backup folder configuratie;
3. oprire server;
4. copiere fisiere;
5. rulare migrari;
6. pornire server;
7. verificare health/version/login.

Statiile de lucru nu se reinstaleaza pentru updateuri normale de frontend/API.

