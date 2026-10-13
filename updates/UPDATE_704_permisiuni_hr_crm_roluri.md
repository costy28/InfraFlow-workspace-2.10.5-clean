# UPDATE 704 — Permisiuni granulare HR, CRM și roluri persistente

Versiune: **2.12.684**  
Data: **13 octombrie 2026**

## Scop

Închiderea auditului de acces pentru HR și CRM și corectarea administrării rolurilor,
fără rescrierea automată a configurațiilor existente ale clientului.

## Modificări

- verificări cumulative pentru datele personale, medicale și salariale HR;
- acces la fișiere limitat la storage-ul și identitatea autorizată;
- invalidarea imediată a sesiunilor Kiosk când asocierea angajatului nu mai este activă;
- acțiuni CRM separate pentru vizualizare, creare lead, creare ofertă și editare ofertă;
- draft CRM read-only pentru rolul care are numai vizualizare;
- corecție MSSQL la înlocuirea liniilor unei oferte, cu păstrarea istoricului anulat;
- rolurile implicite păstrează restrângerile salvate și nu primesc automat drepturi eliminate;
- resetarea la setul implicit rămâne explicită și reversibilă;
- endpointurile de administrare a rolurilor sunt centralizate;
- totalurile din editor corespund permisiunilor vizibile, iar denumirile rolurilor operator sunt neambigue.
- manifestele clientului desktop Electron sunt sincronizate cu versiunea release-ului;
- release check verifică și manifestele Electron;
- documentația clarifică modelul real de implementare și update Windows/Linux/Electron.
- constructorii arhivelor exclud explicit directoarele locale de loguri și storage.

## Compatibilitate

- nu se modifică schema MSSQL;
- nu se șterg și nu se resetează rolurile sau drepturile existente;
- nu se modifică automat utilizatorii, departamentele sau licența;
- pachetele nu includ date demo, baze locale, fișiere `.env` sau secrete.

## Validare

- teste focalizate și relaționale HR;
- suită CRM completă și probă HTTP/UI cu roluri restrictive pe MSSQL izolat;
- teste ale politicii centrale de permisiuni;
- build frontend și audit de expunere fișiere;
- release check și verificarea arhivelor Windows/Linux.
