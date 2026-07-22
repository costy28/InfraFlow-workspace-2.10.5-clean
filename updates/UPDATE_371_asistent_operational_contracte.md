# UPDATE 371 — Asistent operațional contracte

Versiune: `2.12.351`  
Data: `2026-07-22`

## Scop

Adaugă un panou ghidat în Contract Management care traduce riscurile portofoliului în acțiuni concrete pentru utilizator.

## Modificări

- `client/src/pages/modules/ContractePage.jsx`
  - panou nou `Asistent operațional contracte`;
  - recomandări generate din contoarele vederilor salvate, alerte, task-uri și sumarul de risc;
  - recomandare pentru contracte fără manager → pregătește selecția și deschide acțiunea de asignare în lot;
  - recomandare pentru contracte fără document semnat → pregătește selecția și deschide acțiunea de task-uri în lot;
  - recomandare pentru contracte scadente → pregătește task-uri de verificare/prelungire/închidere;
  - recomandare pentru contracte depășite → pregătește task-uri urgente;
  - recomandare globală pentru generarea task-urilor din riscurile curente;
  - acces rapid pentru trimitere remindere către responsabili;
  - stare `Portofoliu curat` când nu există intervenții urgente.

## Compatibilitate

- Nu necesită migrări DB.
- Compatibil cu `DB_MODE=json` și MSSQL.
- Refolosește funcționalitățile existente de vederi salvate, acțiuni batch, task-uri și remindere.

## Testare

- `node --check server/modules/contracts/routes.js`
- `npm run build`
- `npm run release:check -- --no-zip`
- `npm run test:smoke`
