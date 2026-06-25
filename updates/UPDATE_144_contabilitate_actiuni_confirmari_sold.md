# UPDATE 144 - Contabilitate: actiuni rapide confirmari sold

Versiune: 2.12.123 -> 2.12.124
Data: 2026-06-25

## Schimbari

- Am grupat actiunile din lista de clienti/furnizori intr-un meniu dropdown per rand.
- Confirmarea de sold poate fi tiparita sau exportata direct din lista, fara deschiderea detaliilor.
- Confirmarea poate fi marcata ca trimisa sau primita direct din lista.
- O confirmare de sold gresita poate fi anulata, pastrand istoricul si auditul.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run build` in `client`
