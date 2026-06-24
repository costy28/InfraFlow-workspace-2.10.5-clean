# UPDATE 131 - Contabilitate: nota contabila in trezorerie

Versiune: 2.12.111  
Data: 2026-06-24

## Modificari

- In lista Trezorerie, coloana `Nota` deschide nota contabila intr-un modal.
- Modalul afiseaza documentul, data, total debit, total credit si explicatia.
- Liniile notei sunt vizibile direct: cont, denumire, debit, credit si explicatie.
- Fiecare cont din nota are link spre fisa contului.
- Exista link rapid catre nota in Registru jurnal.

## Fisiere principale

- `client/src/pages/accounting/Trezorerie.jsx`

## Verificare

- `npm run build` in `client`
- `npm run check` in `server`
