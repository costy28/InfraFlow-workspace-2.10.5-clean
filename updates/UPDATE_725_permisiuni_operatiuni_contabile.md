# UPDATE 725 — Permisiuni granulare pentru Operațiuni contabile

Versiune: **2.12.705**  
Data: **15 octombrie 2026**

## Modificări

- Consultarea recepțiilor, reconcilierii bancare, stocurilor, evaluării CMP, imobilizărilor și stării închiderii rămâne disponibilă cu `accounting:view`.
- Importurile bancare și e-Factura, potrivirile, facturile din NIR, notele de credit, contabilizarea stocurilor și amortizarea cer `accounting:post`.
- Crearea, transferul, reevaluarea, inventarierea, casarea și scoaterea din evidență a imobilizărilor cer `accounting:manage`.
- Exporturile, fișele și auditul contabil cer `accounting:reports`.
- Închiderea anuală și reportarea soldurilor cer `accounting:close`.
- Auditul de integritate nu mai este solicitat automat pentru rolurile fără drept de raportare, astfel încât accesul exclusiv de citire rămâne funcțional.

## Compatibilitate

- Nu se schimbă schema, documentele, notele contabile sau regulile de calcul existente.
- Rolurile contabile complete își păstrează fluxul actual.

## Verificări

- teste dedicate și regresii de permisiuni;
- regresie contabilă completă;
- build React/Vite;
- audit de expunere fișiere și verificare release;
- arhive Windows și Linux.
