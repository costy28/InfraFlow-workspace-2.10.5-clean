# UPDATE 125 - Contabilitate: solduri initiale

Versiune: 2.12.105  
Data: 2026-06-23

## Modificari

- Adaugata pagina `Contabilitate > Nomenclatoare > Solduri initiale`.
- Soldurile initiale se salveaza pe an fiscal, per cont contabil.
- Validari pentru cont inexistent, cont duplicat, valori negative si debit/credit completate simultan.
- Balanta include soldurile initiale in coloane separate: `Init D` si `Init C`.
- Verificarea de echilibrare a balantei foloseste sumele totale, nu doar rulajele lunii.
- Tabelele contabile late au scroll orizontal intern, fara sa extinda latimea intregii aplicatii.

## Verificare

- `node --check server/modules/accounting/accounting-routes.js`
- `node --check server/modules/accounting/accounting-engine.js`
- `npm run check` in `server`
- `npm run build` in `client`
