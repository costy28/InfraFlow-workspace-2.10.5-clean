# UPDATE 107 - Contabilitate plati si incasari din factura

Versiune: 2.12.86 -> 2.12.87
Data: 2026-06-22

## Schimbari

- Facturile intrare validate sau partial achitate au buton `Plateste`.
- Facturile iesire validate sau partial incasate au buton `Incaseaza`.
- Modalul de plata/incasare permite completarea datei, numarului de document, sumei si contului de trezorerie.
- Operatia creeaza automat documentul de trezorerie, il valideaza si genereaza nota contabila.
- Sunt blocate platile/incasarile pe facturi draft, anulate, stornate sau deja inchise.
- Sunt blocate sumele mai mari decat restul ramas de plata/incasare.
- Operatiile de trezorerie generate din facturi pastreaza referinta la factura sursa.
- Devalidarea unei operatii de trezorerie generate din factura reduce suma achitata/incasata si redeschide soldul facturii.
- Lista de facturi afiseaza coloane pentru achitat/incasat si rest deschis.

## Fisiere modificate

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/FacturiContab.jsx`

## Verificare

- `npm run build` in `client`
- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
