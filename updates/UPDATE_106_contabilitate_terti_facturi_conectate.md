# UPDATE 106 - Contabilitate terti si facturi conectate

Versiune: 2.12.85 -> 2.12.86
Data: 2026-06-21

## Schimbari

- Furnizorii si clientii afiseaza sold deschis, total facturi si scadente depasite.
- Listele de terti au cautare rapida si filtru activ/inactiv/toate.
- Contul analitic al tertului trimite direct catre Fisa contului.
- Numarul de facturi al tertului trimite catre lista de facturi filtrata pe acel furnizor/client.
- Facturile intrare/iesire au filtru dupa tert, cautare rapida si carduri cu totaluri pentru filtrul curent.
- Endpoint-urile de status terti sunt disponibile pentru vizualizare contabilitate si ignora documentele anulate.

## Fisiere modificate

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/TertiContab.jsx`
- `client/src/pages/accounting/FacturiContab.jsx`

## Verificare

- `npm run build` in `client`
- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
