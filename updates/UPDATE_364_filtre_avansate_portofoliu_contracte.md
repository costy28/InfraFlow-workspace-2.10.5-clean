# UPDATE 364 — Filtre avansate portofoliu contracte

Versiune: `2.12.344`  
Data: `2026-07-20`

## Scop

Portofoliul de contracte devine mai ușor de controlat operațional, mai ales când numărul de contracte crește.

## Backend

- `GET /api/contracts` acceptă filtre avansate:
  - status;
  - căutare liberă;
  - partener;
  - CPV;
  - manager/responsabil;
  - risc;
  - alerte;
  - consum minim/maxim;
  - termen apropiat sau expirat;
  - evenimente de ciclu de viață.
- Răspunsul include `filters_applied`, util pentru rapoarte/API-uri viitoare.

## Frontend

- Pagina `Contracte` are filtre rapide:
  - Toate;
  - Active;
  - Cu alerte;
  - Cu risc;
  - Anulate.
- Panou avansat:
  - căutare liberă;
  - status;
  - risc;
  - consum;
  - termen;
  - ciclu de viață.
- Se afișează sumarul filtrelor active și câte contracte rămân în listă.
- Există reset rapid pentru revenirea la portofoliul complet.

## Compatibilitate

- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.
