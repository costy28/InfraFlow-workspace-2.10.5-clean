# UPDATE 162 - Contabilitate: avansuri, inchidere si declaratii

Versiune: `2.12.142`
Data: `2026-06-27`

## Modificari

- Filtru `Avansuri nestinse` si indicatori distincti pentru avansurile incasate/platite.
- Reconcilierea lunara separa avansurile nestinse de operatiile de trezorerie necorelate.
- Checklistul de inchidere verifica si existenta liniilor pentru notele contabile active.
- Avansurile nestinse sunt vizibile la inchidere, dar nu blocheaza inchiderea perioadei.
- Redeschiderea perioadei poate retine motivul in audit.
- Marcarea declaratiilor depuse poate retine numarul recipisei sau referinta depunerii.
- Panou unificat de pregatire pentru D300, D394 si D406/SAF-T.
- Raport intern D394 grupat pe CUI, tert si tip de operatiune.
- Export Excel D394 cu totaluri si foaie separata pentru verificarile necesare.

## Compatibilitate

- Functioneaza in `DB_MODE=json` si `DB_MODE=mssql` prin acelasi strat contabil existent.
- Nu adauga dependente noi si nu modifica schema bazei de date.
- SAF-T este marcat explicit `neconfigurat`; nu se genereaza un fisier fiscal incomplet.

## Verificari

- `node --check server/modules/accounting/accounting-routes.js`
- `node --check server/modules/accounting/declaration-routes.js`
- `npm run build`
