# UPDATE 139 - Contabilitate: registru confirmari sold

Versiune: 2.12.118 -> 2.12.119
Data: 2026-06-24

## Schimbari

- Am adaugat export Excel pentru registrul confirmarilor de sold.
- Exportul este disponibil in meniul `Export` din paginile `Clienti` si `Furnizori`.
- Raportul include codul tertului, CUI, analiticul, soldul, soldul depasit, statusul confirmarii, datele de trimitere/primire, soldul confirmat si diferenta.

## Backend

- `GET /api/accounting/clients-status/confirmations/export`
- `GET /api/accounting/suppliers-status/confirmations/export`

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
