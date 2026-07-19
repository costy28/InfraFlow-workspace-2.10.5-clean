# UPDATE 349 — Acte adiționale pe contract

Versiune: 2.12.329  
Data: 2026-07-18

## Scop

Contract Management avea deja dosar, cockpit, documente sursă și atașamente. Update-ul adaugă o piesă juridică esențială: actele adiționale, astfel încât valoarea, termenul și responsabilul unui contract să poată fi actualizate controlat, cu istoric.

## Implementat

- `contractManagement.addenda` ca registru intern pentru acte adiționale.
- Endpoint `POST /api/contracts/:id/addenda` pentru adăugarea unui act adițional.
- Endpoint `DELETE /api/contracts/:id/addenda/:addendumId` pentru anulare soft.
- Tipuri suportate:
  - majorare;
  - diminuare;
  - prelungire;
  - schimbare responsabil;
  - condiții contractuale;
  - altul.
- Aplicare automată pe contract pentru:
  - valoare contract;
  - data finală;
  - responsabil.
- Trasabilitate înainte/după pentru valoare, termen și responsabil.
- Cockpit contract cu KPI pentru acte adiționale.
- Fișa printabilă a contractului include tabelul actelor adiționale.
- UI în modalul „Dosar contract” pentru formular și istoric acte adiționale.

## Observații

- Anularea unui act adițional nu rescrie automat contractul, pentru a evita alterarea istoricului când există modificări ulterioare.
- Corecțiile operaționale se fac printr-un act adițional nou.

## Verificări

- `node --check server/modules/contracts/routes.js`
- `npm run build`
