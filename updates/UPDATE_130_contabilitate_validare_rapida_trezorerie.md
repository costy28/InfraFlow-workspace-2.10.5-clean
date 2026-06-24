# UPDATE 130 - Contabilitate: validare rapida trezorerie

Versiune: 2.12.110  
Data: 2026-06-24

## Modificari

- Formularul de trezorerie are buton `Salveaza si valideaza`.
- Fluxul pornit din scadentar poate crea plata/incasarea si nota contabila intr-un singur pas.
- Dupa validare se pastreaza mesajul cu link rapid spre registru jurnal si balanta.
- Daca validarea esueaza, formularul ramane deschis pentru corectie.

## Fisiere principale

- `client/src/pages/accounting/Trezorerie.jsx`

## Verificare

- `npm run build` in `client`
- `npm run check` in `server`
