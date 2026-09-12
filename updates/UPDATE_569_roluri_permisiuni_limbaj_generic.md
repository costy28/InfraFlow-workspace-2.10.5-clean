# UPDATE 569 — Roluri și permisiuni cu limbaj comercial generic

Versiune: 2.12.549  
Data: 2026-09-11

## Scop

Curățare comercială pentru zona de administrare roluri și permisiuni, astfel încât instalările noi să nu pară legate implicit de stații/asfalt.

## Modificări

- rolul vizibil `Șef stație` devine `Manager operațional`;
- rolul vizibil `Operator stație` devine `Operator producție`;
- grupurile `Producție asfalt`, `Așternere asfalt` și `Vânzări asfalt` sunt afișate cu limbaj generic;
- descrierile rolurilor păstrează aceeași logică de business, dar folosesc termeni valabili pentru mai multe industrii;
- permisiunile interne și ID-urile existente rămân compatibile cu datele instalărilor existente.

## Verificare

- build frontend;
- release check;
- audit expuneri fișiere;
- verificare working tree și ZIP update.
