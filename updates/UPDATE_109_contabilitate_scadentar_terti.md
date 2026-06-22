# UPDATE 109 - Contabilitate scadentar terti

Versiune: 2.12.88 -> 2.12.89
Data: 2026-06-22

## Schimbari

- Adaugat scadentar pe furnizori si clienti.
- Soldurile tertilor sunt impartite pe vechime: nescadent, 1-30 zile, 31-60 zile, 61-90 zile si peste 90 zile.
- Lista de terti afiseaza valoarea totala depasita pentru filtrul curent.
- Coloanele depasite sunt colorate gradual pentru scanare rapida.
- Adaugate endpoint-uri de export:
  - `GET /api/accounting/suppliers-status/export`
  - `GET /api/accounting/clients-status/export`
- Exportul Excel include sold, total facturat, achitat/incasat, bucket-uri de scadenta si date de contact.

## Fisiere modificate

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/TertiContab.jsx`

## Verificare

- `npm run build` in `client`
- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
