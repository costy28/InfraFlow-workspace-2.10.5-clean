# UPDATE 122 - Contabilitate: administrare sabloane note

Versiune: 2.12.101 -> 2.12.102  
Data: 2026-06-23

## Modificari

- `accounting.journalTemplates` este initializat in modelul JSON al contabilitatii.
- Endpointul `GET /api/accounting/journal-templates` combina sabloanele de sistem cu cele custom active.
- Endpointuri noi:
  - `POST /api/accounting/journal-templates`
  - `PATCH /api/accounting/journal-templates/:key`
- Pagina noua `Contabilitate > Administrare > Sabloane note`.
- Sablon custom nou/editabil/dezactivabil, cu selectie conturi din planul contabil.
- Sablonul de sistem este vizibil, dar protejat la editare.

## Verificare

- `npm run build`
- `npm run check`
- `node --check server/modules/accounting/accounting-routes.js`
- `node --check server/modules/accounting/accounting-engine.js`
