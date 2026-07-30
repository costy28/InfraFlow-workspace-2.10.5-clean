# UPDATE 431 — Confirmări UX Mecanizare, FAZ și operațiuni contabile

Versiune: `2.12.411`
Data: `2026-07-30`

## Scop

Închide lotul principal de dialoguri native de browser din frontend, astfel încât acțiunile critice să folosească dialoguri ERP consistente, explicite și controlabile.

## Modificări

- `client/src/pages/FcUtilajePage.jsx`
  - generarea FAZ utilaje folosește `ConfirmDialog`;
  - utilizatorul vede că FC-urile completate vor fi marcate ca introduse în FAZ.

- `client/src/pages/FoaieParcursPage.jsx`
  - generarea FAZ lunar din foi de parcurs folosește `ConfirmDialog`;
  - dialogul explică centralizarea foilor închise.

- `client/src/pages/modules/MecanizarePage.jsx`
  - ștergerea planificărilor, bonurilor de lucru și alimentărilor folosește `ConfirmDialog`;
  - importul alimentărilor PIUSI în FAZ folosește confirmare ERP;
  - generarea FAZ mecanizare folosește confirmare ERP.

- `client/src/pages/accounting/OperatiuniContabile.jsx`
  - stornarea facturii/notei contabile legate de retur folosește `ConfirmDialog`;
  - transferul, reevaluarea și casarea imobilizărilor folosesc dialog ERP cu câmp de valoare/motiv;
  - s-au eliminat `window.confirm` și `window.prompt` din pagina de operațiuni contabile.

## Compatibilitate

- Nu schimbă schema MSSQL.
- Nu schimbă contractele API.
- Nu modifică regulile contabile, FAZ sau PIUSI existente.
- Compatibil cu `DB_MODE=json`, schimbările fiind frontend.

## Verificări

- `npm run build`
- `rg -n "window\\.(prompt|confirm|alert)" client\\src\\pages client\\src\\components`
- `scripts/windows/build-update-zip.ps1`
