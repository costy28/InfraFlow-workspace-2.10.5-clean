# UPDATE 111 - UI dropdown actiuni contabilitate

Versiune: 2.12.91
Data: 2026-06-22

## Modificari

- A fost adaugat componentul reutilizabil `DropdownMenu` pentru meniuri de actiuni si navigare.
- Navigatia din modulul Contabilitate a fost grupata in:
  - Nomenclatoare
  - Operatiuni
  - Rapoarte
  - Administrare
- Dashboard-ul ramane link direct.
- Actiunile secundare au fost mutate in dropdown-uri pe:
  - Furnizori / Clienti
  - Trezorerie
  - Registru jurnal
  - Balanta
  - Fisa cont
  - TVA / D300
- Actiunile principale raman vizibile: adaugare tert, factura, operatie, nota manuala si TVA verificat.

## Verificare

- `npm run build` in `client` a trecut cu succes.
- `npm run check` in `server` a trecut cu succes.
