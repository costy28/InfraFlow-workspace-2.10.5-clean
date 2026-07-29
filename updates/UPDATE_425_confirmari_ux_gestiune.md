# UPDATE 425 — Confirmări UX în Gestiune

Versiune: `2.12.405`  
Data: `2026-07-29`

## Scop

Continuăm eliminarea dialogurilor native de browser din fluxurile critice. În Gestiune, confirmările sunt importante pentru că acțiunile afectează stocul, documentele și inventarul.

## Modificări

- Ștergerea materialelor și furnizorilor folosește `ConfirmDialog`, cu avertizare despre dependențe.
- Confirmarea și anularea NIR-urilor folosesc dialoguri ERP care explică actualizarea/revertirea stocului.
- Aprobarea și ștergerea bonurilor de consum folosesc dialoguri ERP cu impact explicit.
- Crearea și finalizarea inventarului folosesc dialoguri ERP care explică preluarea stocului scriptic și aplicarea diferențelor.
- `GestiunePage.jsx` nu mai conține `window.confirm`, `window.prompt` sau `window.alert`.

## Verificări

- `rg "window\.confirm|window\.prompt|window\.alert" client/src/pages/modules/GestiunePage.jsx client/src/components/ui/ConfirmDialog.jsx`
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `scripts\windows\build-update-zip.ps1 -SkipClientBuild`

## Impact

Nu schimbă endpointuri sau schema DB. Acțiunile trimit aceleași requesturi serverului, dar confirmarea este mai clară, mai comercială și mai sigură pentru operator.
