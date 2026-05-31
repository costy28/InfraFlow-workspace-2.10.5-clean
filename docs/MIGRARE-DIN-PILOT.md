# Migrare din InfraFlow pilot catre InfraFlow 1.0

Acest document descrie cum mutam datele din aplicatia pilot fara pierderi.

## Surse posibile

Pilotul poate avea date in:

- `data/app-db.json`;
- SQL Server `dbo.app_state`;
- tabele relationale existente in schema pilot.

## Regula principala

Nu se migreaza nimic fara backup.

Backup minim:

- folderul `data`;
- baza SQL Server;
- pachetul pilot complet;
- export diagnostic din aplicatie.

## Strategie

1. Inghetam pilotul pentru cateva minute.
2. Facem backup.
3. Exportam datele pilot intr-un format intermediar JSON verificabil.
4. Validam materialele, utilizatorii, rolurile si retetele.
5. Importam in tabelele 1.0 pe domenii.
6. Rulam rapoarte de verificare:
   - numar materiale;
   - solduri pe materiale;
   - consumuri pe perioada;
   - utilizatori activi;
   - retete active;
   - solicitari deschise;
   - audit minim.
7. Daca totalurile nu se potrivesc, revenim la backup.

## Ordinea de migrare

1. `core`: firma, setari, module, roluri, utilizatori, statii.
2. `inventory`: materiale, stoc initial, miscari, aprovizionari.
3. `production`: retete, consumuri, planificari, vanzari.
4. `workflow`: solicitari departamente si mecanizare.
5. `fleet`: utilaje, autovehicule, pontaje.
6. `accounting`: centre cost si cheltuieli importate.
7. `integration`: mapari Cantar Auto, Nexus, Autominder.

## Validari obligatorii

- niciun material activ fara unitate de masura;
- niciun utilizator activ fara rol;
- niciun consum fara reteta snapshot;
- niciun stoc negativ fara marcaj/explicatie;
- nicio miscare fara data;
- total stoc pilot = total stoc 1.0 pe fiecare material;
- solicitari deschise pastrate cu status echivalent.

