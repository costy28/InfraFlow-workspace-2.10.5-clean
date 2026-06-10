# UPDATE 045 - Modul FAZ Utilaje

Versiune sursa: 2.12.24

## Inclus

- Modul nou FAZ Utilaje pentru Foaie Activitate Zilnica pe utilaje.
- Rute backend `/api/fleet/faz` pentru listare, creare, editare draft, semnare, aprobare, raport lunar, CSV si import Autominder.
- Structuri JSON `fazLogs` si `fazNomenclator`, plus fisiere suport `data/faz-logs.json` si `data/faz-nomenclator.json`.
- Migrare MSSQL `db/migrations/025_faz_utilaje.sql` cu tabelele `fleet_faz_logs` si `fleet_faz_nomenclator`.
- Pagina React `/faz-utilaje`, accesibila din sidebar langa Mecanizare.
- Calcul automat pentru ore zi, consum normat, diferenta consum, procent consum si semaforizare.

## Note

- Cerinta originala mentiona 2.12.19 -> 2.12.20, dar workspace-ul era deja la 2.12.23 dupa lucrul pe demo. Update-ul a fost aplicat inainte, la 2.12.24, fara downgrade.
- `updates/UPDATE_040.js` ramane scriptul executabil pentru initializarea structurii JSON cerute de task.
