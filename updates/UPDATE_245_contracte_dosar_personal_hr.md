# UPDATE 245 — Contracte si dosar personal HR

Versiune: **2.12.225**  
Data: **2026-07-09**

## Imbunatatiri

- Fișa angajatului are acum zona **Contracte salarizare**, separată de **Dosar electronic**.
- Contractele operaționale pot fi create și editate din HR:
  - număr contract;
  - tip contract;
  - data contractului;
  - data începerii activității;
  - data sfârșit;
  - normă ore/zi;
  - salariu bază brut;
  - cost oră;
  - status;
  - observații.
- Dosarul electronic permite editarea metadatelor documentului:
  - denumire;
  - tip document;
  - data documentului;
  - data expirării.
- Documentele din dosarul electronic pot fi anulate controlat, nu șterse fizic.
- Contractele cu status SQL `NULL` sunt afișate ca active și în fișa angajatului.

## Clarificare operationala

Fișierul CIM încărcat în dosarul electronic este documentul real, scanat/PDF/DOCX. Contractul din zona **Contracte salarizare** este sursa de date pentru pontaj, salarizare, REGES intern și D112.

## Verificare

- `node --check server/modules/hr/routes.js`
- `node --check server/modules/hr/employee-file-routes.js`
- `npm --prefix client run build -- --mode development`
