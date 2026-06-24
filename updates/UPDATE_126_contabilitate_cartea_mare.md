# UPDATE 126 - Contabilitate: Cartea Mare

Versiune: 2.12.106  
Data: 2026-06-23

## Modificari

- Adaugata pagina `Contabilitate > Rapoarte > Cartea Mare`.
- Raportul afiseaza pe fiecare cont:
  - sold initial;
  - rulaj debit;
  - rulaj credit;
  - sold final;
  - numar miscari.
- Fiecare cont are link direct catre `Fisa cont` pe acelasi interval.
- Adaugat endpoint `GET /api/accounting/general-ledger`.
- Adaugat export Excel `GET /api/accounting/general-ledger/export`.
- Exportul include sumarul pe conturi si miscarile detaliate.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
