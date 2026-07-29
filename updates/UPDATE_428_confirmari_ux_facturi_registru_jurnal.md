# UPDATE 428 — Confirmări UX Facturi și Registru jurnal

Versiune: `2.12.408`
Data: `2026-07-29`

## Scop

Continuă curățarea acțiunilor critice din Contabilitate prin eliminarea dialogurilor native de browser din facturi și registru jurnal.

## Modificări

- `client/src/pages/accounting/FacturiContab.jsx`
  - stornarea facturii folosește `ConfirmDialog`;
  - anularea facturii draft folosește `ConfirmDialog`;
  - motivul anulării draftului este introdus în dialog și transmis către ruta existentă.

- `client/src/pages/accounting/RegistruJurnal.jsx`
  - devalidarea notei contabile folosește `ConfirmDialog` cu motiv obligatoriu;
  - anularea notei draft folosește `ConfirmDialog` cu motiv obligatoriu;
  - crearea notei storno folosește confirmare ERP cu impact explicit.

## Compatibilitate

- Nu schimbă schema MSSQL.
- Nu schimbă rutele API.
- Nu modifică regulile contabile existente.
- Funcționează identic în `DB_MODE=json` și MSSQL, deoarece schimbarea este exclusiv frontend.

## Verificări

- `npm run build`
- `rg -n "window\.(prompt|confirm|alert)" client\src\pages\accounting\FacturiContab.jsx client\src\pages\accounting\RegistruJurnal.jsx`
- `scripts/windows/build-update-zip.ps1`
