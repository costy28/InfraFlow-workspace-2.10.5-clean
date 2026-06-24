# UPDATE 132 - Contabilitate: export scadentar detaliat

Versiune: 2.12.112  
Data: 2026-06-24

## Schimbari

- Exportul Excel pentru scadentar furnizori/clienti include doua foi:
  - `Scadentar` cu sumar pe tert.
  - `Facturi deschise` cu detaliu factura cu factura.
- Detaliul include document, data, scadenta, total, achitat/incasat, rest, zile intarziere si actiune recomandata.
- Workbook-ul are coloane dimensionate, freeze pe header si filtre active.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
