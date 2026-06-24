# UPDATE 128 - Contabilitate: detaliu scadentar terti

Versiune: 2.12.108  
Data: 2026-06-24

## Modificari

- Adaugat endpoint pentru detaliul unui furnizor din scadentar.
- Adaugat endpoint pentru detaliul unui client din scadentar.
- In listele Clienti/Furnizori apare actiunea `Detalii`.
- Modalul de detaliu afiseaza facturile deschise, restul, scadenta si zilele de intarziere.
- Din detaliu se poate sari rapid catre lista de facturi sau catre trezorerie pentru incasare/plata.

## Fisiere principale

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/TertiContab.jsx`

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
