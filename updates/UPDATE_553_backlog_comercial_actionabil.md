# UPDATE 553 — Backlog comercial acționabil

Versiune: `2.12.533`  
Data: `2026-09-06`

## Scop

Transformă concluziile auditului într-o listă clară de îmbunătățiri pe module, ca dezvoltarea să continue pas cu pas, fără să pierdem direcția comercială.

## Inclus

- Adaugă `docs/IMBUNATATIRI_PRIORITARE_COMERCIAL.md`.
- Grupează următorii pași în:
  - securitate fișiere și atașamente;
  - audit autentificări, stații și permisiuni;
  - simplitate operațională pe module;
  - modularizare tehnică fără rescriere riscantă;
  - curățare comercială și internaționalizare;
  - pregătire release comercial.
- Definește backlog pe module: Core, Dashboard, Documente, Contracte, HR, Contabilitate, Parc & Resurse, Gestiune, Achiziții, Mesaje și Task-uri.
- Leagă documentul în `AGENTS.md`, ca punct de lucru activ după audit.

## Impact tehnic

- Nu schimbă schema bazei de date.
- Nu schimbă comportamentul runtime.
- Nu necesită migrare SQL.
- Pregătește următoarele update-uri funcționale pe o listă clară și urmărită.

## Verificări

- `npm run release:check -- --no-zip`
- Generare ZIP update.
