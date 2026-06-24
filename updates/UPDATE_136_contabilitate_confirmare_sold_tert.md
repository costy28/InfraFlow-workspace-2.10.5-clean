# UPDATE 136 - Contabilitate: confirmare sold tert

Versiune: 2.12.116  
Data: 2026-06-24

## Schimbari

- Au fost adaugate exporturi Excel pentru confirmarea de sold:
  - `GET /api/accounting/clients-status/:id/confirmation`
  - `GET /api/accounting/suppliers-status/:id/confirmation`
- Modalul de detaliu client/furnizor are buton `Confirmare sold`.
- Documentul include datele tertului, soldul deschis, soldul depasit si facturile care compun soldul.
- Confirmarea include zone pentru semnatura emitentului si confirmarea tertului.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
