# UPDATE 354 — Checklist completitudine contract

Versiune: `2.12.334`  
Data: `2026-07-19`

## Ce s-a schimbat

- Dosarul contractului include checklist de completitudine.
- Checklist-ul separă pașii obligatorii de recomandări.
- Sunt verificate:
  - număr contract;
  - obiect/titlu;
  - partener;
  - valoare;
  - perioadă;
  - manager/responsabil;
  - fișier contract semnat;
  - cod CPV pentru achiziții;
  - centru cost;
  - documente sursă;
  - acte adiționale cu fișier atașat.
- Cockpit-ul include procentul de completitudine și obligatorii lipsă.
- UI-ul afișează acțiuni concrete pentru elementele lipsă.

## Compatibilitate

- Nu necesită migrare DB.
- Nu modifică fluxurile de creare/editare contract.
- Checklist-ul este calculat din datele existente în dosarul contractului.

## Verificări

- `node --check server/modules/contracts/routes.js`
- `npm --prefix client run build`
