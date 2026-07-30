# UPDATE 430 — Confirmări UX Producție, Așternere, Documente și Dashboard

Versiune: `2.12.410`
Data: `2026-07-30`

## Scop

Continuă curățarea aplicației de dialoguri native de browser, astfel încât acțiunile operaționale să aibă confirmări ERP clare, cu impact explicat înainte de execuție.

## Modificări

- `client/src/pages/modules/ProductiePage.jsx`
  - legarea consumului de Gestiune folosește `ConfirmDialog`;
  - dialogul explică faptul că se generează mișcări de stoc pentru consumul selectat.

- `client/src/pages/modules/AsternerePage.jsx`
  - anularea lucrărilor folosește `ConfirmDialog`;
  - ștergerea rapoartelor zilnice folosește `ConfirmDialog`;
  - mesajele includ identificatorul lucrării/raportului și impactul asupra totalurilor.

- `client/src/pages/modules/DocumentePage.jsx`
  - dezactivarea template-urilor folosește `ConfirmDialog`;
  - utilizatorul vede că documentele generate anterior rămân păstrate.

- `client/src/pages/DashboardPage.jsx`
  - resetarea demo folosește `ConfirmDialog`;
  - confirmarea explică reîncărcarea paginii după reset.

## Compatibilitate

- Nu schimbă schema MSSQL.
- Nu schimbă contractele API.
- Nu modifică regulile de producție, așternere, documente sau demo.
- Compatibil cu `DB_MODE=json`, schimbările fiind frontend.

## Verificări

- `npm run build`
- `rg -n "window\\.(prompt|confirm|alert)" client\\src\\pages\\modules\\ProductiePage.jsx client\\src\\pages\\modules\\AsternerePage.jsx client\\src\\pages\\modules\\DocumentePage.jsx client\\src\\pages\\DashboardPage.jsx`
- `scripts/windows/build-update-zip.ps1`
