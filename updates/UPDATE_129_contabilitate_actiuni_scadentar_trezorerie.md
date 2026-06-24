# UPDATE 129 - Contabilitate: actiuni rapide din scadentar

Versiune: 2.12.109  
Data: 2026-06-24

## Modificari

- Din detaliul clientului se poate porni direct o incasare in Trezorerie.
- Din detaliul furnizorului se poate porni direct o plata in Trezorerie.
- Trezoreria citeste factura din URL si deschide automat formularul precompletat.
- Formularul completeaza tertul, factura, suma ramasa, contul corespondent si explicatia.
- Butoanele din scadentar sunt mai clare: `Incaseaza` pentru clienti si `Plateste` pentru furnizori.

## Fisiere principale

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/TertiContab.jsx`
- `client/src/pages/accounting/Trezorerie.jsx`

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
