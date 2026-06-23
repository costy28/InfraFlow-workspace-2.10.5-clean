# UPDATE 119 - Contabilitate: linkuri reconciliere si export Trezorerie

Versiune: 2.12.98 -> 2.12.99  
Data: 2026-06-23

## Modificari

- Reconcilierea lunara genereaza linkuri directe catre documentul problematic:
  - facturi intrare/iesire cu luna, status si cautare precompletate;
  - trezorerie cu luna, status si cautare precompletate;
  - registru jurnal cu nota contabila selectata.
- Paginile Contabilitate > Facturi, Trezorerie si Registru jurnal citesc parametrii din URL la navigare interna.
- Exportul Excel din Trezorerie foloseste clientul API autentificat si descarca fisierul ca blob.

## Verificare

- `npm run build`
- `npm run check`
- `node --check server/modules/accounting/accounting-routes.js`
