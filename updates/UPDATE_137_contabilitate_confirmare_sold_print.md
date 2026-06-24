# UPDATE 137 - Contabilitate: confirmare sold tiparibila

Versiune: 2.12.116 -> 2.12.117
Data: 2026-06-24

## Schimbari

- Am adaugat pagina HTML tiparibila pentru confirmarea de sold a unui client sau furnizor.
- In detaliul tertului exista acum butonul `Tipareste confirmare`, separat de exportul Excel.
- Confirmarea tiparibila include datele tertului, soldul total, soldul depasit, facturile deschise si zone de semnatura.

## Backend

- `GET /api/accounting/clients-status/:id/confirmation/print`
- `GET /api/accounting/suppliers-status/:id/confirmation/print`

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `npm run check` in `server`
- `npm run build` in `client`
