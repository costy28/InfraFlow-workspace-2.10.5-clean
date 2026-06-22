# UPDATE 108 - Contabilitate trezorerie verificabila

Versiune: 2.12.87 -> 2.12.88
Data: 2026-06-22

## Schimbari

- Trezoreria are filtre dupa luna, status, registru, operatie si tert.
- Adaugata cautare rapida in operatiile de trezorerie dupa document, tert, CUI, cont sau explicatie.
- Adaugate carduri de sumar: operatii, incasari, plati, diferenta si drafturi.
- Conturile din lista de trezorerie duc direct catre fisa contului pentru luna curenta.
- Operatiile create automat din facturi sunt marcate in lista ca provenind din factura intrare/iesire.
- Adaugat endpoint `GET /api/accounting/treasury/export`.
- Exportul Excel pentru trezorerie respecta filtrele active si include total incasari, total plati si diferenta.
- Backend-ul accepta filtre suplimentare pentru trezorerie: `tert_id` si `operatie`.

## Fisiere modificate

- `server/modules/accounting/accounting-routes.js`
- `client/src/pages/accounting/Trezorerie.jsx`

## Verificare

- `npm run build` in `client`
- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
