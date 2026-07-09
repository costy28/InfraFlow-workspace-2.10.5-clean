# UPDATE 247 — Documente HR din contracte si acte aditionale

Versiune: **2.12.227**  
Data: **2026-07-09**

## Functionalitati

- Contractele salariale pot genera document CIM printabil direct din fișa angajatului.
- Actele adiționale salvate în istoricul contractului pot genera document printabil.
- Documentele sunt generate HTML, pregătite pentru tipărire sau salvare PDF din browser.
- Șablonul CIM folosește contractul operațional selectat:
  - număr contract;
  - data contractului;
  - data începerii activității;
  - norma;
  - salariul de bază;
  - data sfârșit, dacă există.
- Șablonul de act adițional completează automat:
  - număr act;
  - data actului;
  - contractul de referință;
  - data efectului;
  - tipul modificării;
  - valorile salvate pe act.

## Flux operational

Date contract → act adițional → document printabil → salvare PDF/scanare în dosarul electronic.

## Verificare

- `node --check server/modules/hr/routes.js`
- `npm --prefix client run build -- --mode development`
