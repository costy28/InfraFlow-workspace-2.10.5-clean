# UPDATE 135 - Contabilitate: istoric facturi in fisa tertului

Versiune: 2.12.115  
Data: 2026-06-24

## Schimbari

- Modalul de detaliu client/furnizor include sectiunea `Istoric facturi`.
- Sunt afisate ultimele 30 facturi ale tertului, cu status, total, achitat/incasat si rest.
- Exportul `Fisa tert` include foaie separata `Istoric facturi`.
- Nu s-a modificat logica de calcul a soldurilor; schimbarea este de vizualizare si raportare.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
