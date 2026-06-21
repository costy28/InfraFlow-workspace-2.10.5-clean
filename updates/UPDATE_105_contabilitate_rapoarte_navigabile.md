# UPDATE 105 - Contabilitate rapoarte navigabile

Versiune: 2.12.84 -> 2.12.85
Data: 2026-06-21

## Schimbari

- Adaugat export Excel pentru Registru jurnal, cu filtrele active si totaluri debit/credit.
- Adaugate carduri sintetice in Registru jurnal pentru note filtrate, note active, drafturi si diferenta debit-credit.
- Balanta are cautare rapida pe cont sau denumire si navigare directa catre Registru jurnal pentru luna selectata.
- Linkurile din Balanta deschid Fisa contului cu perioada lunii selectate.
- Fisa contului citeste intervalul `de_la` / `pana_la` din URL si permite intoarcerea rapida catre Balanta si Registru jurnal.
- Liniile din Fisa contului duc inapoi catre Registru jurnal pentru luna documentului.

## Fisiere modificate

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/RegistruJurnal.jsx`
- `client/src/pages/accounting/Balanta.jsx`
- `client/src/pages/accounting/FisaCont.jsx`

## Verificare

- `npm run build` in `client`
- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
