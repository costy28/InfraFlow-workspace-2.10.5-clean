# UPDATE 138 - Contabilitate: status confirmari sold

Versiune: 2.12.117 -> 2.12.118
Data: 2026-06-24

## Schimbari

- Am adaugat evidenta interna pentru confirmarile de sold ale clientilor si furnizorilor.
- Lista de terti afiseaza ultima stare: `netrimisa`, `trimisa` sau `confirmata`.
- Detaliul tertului are actiuni pentru marcarea confirmarii ca trimisa sau primita.
- Confirmarea salveaza soldul, soldul depasit, numarul de facturi deschise si diferenta confirmata.

## Backend

- `POST /api/accounting/clients-status/:id/confirmation/sent`
- `POST /api/accounting/clients-status/:id/confirmation/received`
- `POST /api/accounting/suppliers-status/:id/confirmation/sent`
- `POST /api/accounting/suppliers-status/:id/confirmation/received`

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `node --check server/modules/accounting/accounting-engine.js`
- `npm run check` in `server`
- `npm run build` in `client`
