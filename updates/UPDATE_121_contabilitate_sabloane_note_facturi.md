# UPDATE 121 - Contabilitate: sabloane note contabile pe facturi

Versiune: 2.12.100 -> 2.12.101  
Data: 2026-06-23

## Modificari

- Adaugat endpoint `GET /api/accounting/journal-templates` cu sabloane implicite pentru facturi:
  - servicii terti;
  - marfuri / materiale;
  - combustibil;
  - reparatii / intretinere;
  - servicii prestate;
  - vanzare marfuri;
  - productie / asfalt.
- Modalul Facturi intrare/iesire are selector de sablon de nota contabila.
- Aplicarea sablonului seteaza contul principal si conturile liniilor implicite, fara sa suprascrie conturile schimbate manual.
- Facturile salveaza `template_key` pentru audit si configurare viitoare.

## Verificare

- `npm run build`
- `npm run check`
- `node --check server/modules/accounting/accounting-routes.js`
