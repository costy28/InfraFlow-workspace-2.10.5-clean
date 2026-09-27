# UPDATE 581 — Fundație CRM / Sales Automation relațională

Versiune: `v2.12.561`  
Data: `2026-09-26`

## Scop

Pregătește CRM-ul ca modul comercial separat, fără să activeze încă ecrane sau fluxuri de vânzare incomplete.

## Modificări

- modul activabil `crm` în catalogul și pachetele comerciale;
- 12 permisiuni CRM granularizate, fără rol comercial impus;
- migrare MSSQL versionată pentru leads, conturi, contacte, activități, oferte, acceptări, comenzi, verificări de stoc, facturare și evenimente integrare;
- UUID, audit de creare/modificare și anulare logică pentru entitățile CRM;
- indexuri și FK-uri interne pentru integritatea ofertă → comandă → integrare;
- puncte de extensie fără apeluri reale pentru Inventory, Procurement, Accounting, Documents, Tasks, Workflow și Billing;
- provider de facturare stub cu contract pentru proformă/factură;
- endpoint protejat `GET /api/crm/health`;
- documentația tehnică livrată în pachetul de update și copiată la aplicare;
- fără copie CRM în `DB_MODE=json`, fără CRUD și fără UI comercial în acest sprint.

## Verificare

- `node --test server/tests/crm-foundation.test.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run audit:file-exposure`
- `git diff --check`
