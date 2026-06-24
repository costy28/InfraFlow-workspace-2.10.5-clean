# UPDATE 133 - Contabilitate: istoric trezorerie pe tert

Versiune: 2.12.113  
Data: 2026-06-24

## Schimbari

- Endpoint-urile de detaliu client/furnizor returneaza si miscarile de trezorerie ale tertului.
- Modalul de scadentar afiseaza total incasari/plati si numarul operatiilor de trezorerie.
- A fost adaugat tabel cu ultimele miscari de trezorerie: data, document, operatie, conturi, suma, status si factura legata.
- Fiecare operatie are link spre Trezorerie cu filtrul de tert/document.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
