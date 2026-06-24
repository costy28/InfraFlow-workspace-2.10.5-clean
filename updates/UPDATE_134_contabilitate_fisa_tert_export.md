# UPDATE 134 - Contabilitate: fisa tert exportabila

Versiune: 2.12.114  
Data: 2026-06-24

## Schimbari

- Au fost adaugate exporturi Excel pentru detaliul unui client/furnizor:
  - `GET /api/accounting/clients-status/:id/export`
  - `GET /api/accounting/suppliers-status/:id/export`
- Fisa tertului include foi separate:
  - `Sumar`
  - `Facturi deschise`
  - `Trezorerie`
- Modalul de scadentar are buton `Exporta fisa tert`.
- Exportul include filtre, coloane dimensionate si datele necesare pentru verificarea soldului.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
