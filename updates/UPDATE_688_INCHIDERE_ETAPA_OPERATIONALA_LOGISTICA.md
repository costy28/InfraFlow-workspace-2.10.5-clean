# UPDATE 688 — Închidere etapă operațională Logistică

**Versiune:** v2.12.668  
**Data:** 5 octombrie 2026

## Ce aduce

- O cursă poate fi legată la o comandă client CRM numai dacă aceasta este confirmată; clientul, comanda, contractul și documentele de transport sunt vizibile în același traseu operațional.
- Documentul tipărit păstrează comanda client, comanda de aprovizionare, contractul, cursa și referința externă, fără a crea documente fiscale noi.
- Pregătirea pentru livrare compară exact pozițiile cursei cu materialele existente în Gestiune. Confirmarea este explicită, păstrează un snapshot și un audit, dar nu rezervă și nu scade stocul.
- Evidența RO e-Transport permite păstrarea manuală a verdictului intern, UIT-ului și observațiilor. Nu contactează ANAF, SPV sau niciun API extern.
- Legătura GPS/telematică este un descriptor neutru per cursă pentru un adaptor configurat ulterior. Nu cere credențiale și nu citește poziții, trasee sau date live.

## Limite explicite

- Obligația de declarare RO e-Transport se stabilește de operator prin documentația oficială și situația concretă; aplicația nu o decide automat.
- Nu există transmitere, generare UIT, confirmare sau interogare automată către ANAF/SPV.
- Ieșirea din stoc se înregistrează separat, prin fluxul Gestiune; pregătirea Logistică nu modifică stocul.
- Nu există integrare GPS live sau furnizor implicit în Logistică.
