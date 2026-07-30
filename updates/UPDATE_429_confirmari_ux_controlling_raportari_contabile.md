# UPDATE 429 — Confirmări UX Controlling și raportări contabile

Versiune: `2.12.409`
Data: `2026-07-29`

## Scop

Continuă eliminarea dialogurilor native de browser din zonele financiar-contabile, cu dialoguri ERP clare și motive auditate unde acțiunea modifică registre sau configurări.

## Modificări

- `client/src/pages/modules/ControllingPage.jsx`
  - dezactivarea centrului de cost folosește `ConfirmDialog`;
  - dialogul explică faptul că istoricul rămâne păstrat.

- `client/src/pages/accounting/DeclaratiiDiverse.jsx`
  - anularea pozițiilor D205/Intrastat se face prin `ConfirmDialog`;
  - motivul este editabil și transmis către ruta existentă.

- `client/src/pages/accounting/SituatiiFinanciare.jsx`
  - anularea mapărilor financiare cere motiv auditat;
  - utilizatorul vede impactul asupra indicatorului calculat.

- `client/src/pages/accounting/TertiContab.jsx`
  - devalidarea notelor de credit cere motiv în dialog ERP;
  - stornarea notelor de credit folosește confirmare explicită;
  - anularea confirmărilor de sold cere motiv auditat.

## Compatibilitate

- Nu schimbă schema MSSQL.
- Nu schimbă contractele API.
- Nu modifică regulile contabile sau fiscale existente.
- Compatibil cu `DB_MODE=json`, schimbările fiind frontend.

## Verificări

- `npm run build`
- `rg -n "window\\.(prompt|confirm|alert)" client\\src\\pages\\modules\\ControllingPage.jsx client\\src\\pages\\accounting\\DeclaratiiDiverse.jsx client\\src\\pages\\accounting\\SituatiiFinanciare.jsx client\\src\\pages\\accounting\\TertiContab.jsx`
- `scripts/windows/build-update-zip.ps1`
