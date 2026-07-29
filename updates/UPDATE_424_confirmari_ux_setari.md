# UPDATE 424 — Confirmări UX în Setări

Versiune: `2.12.404`  
Data: `2026-07-29`

## Scop

Continuăm eliminarea dialogurilor native de browser din fluxurile administrative. Setările sunt o zonă sensibilă pentru administratori, iar acțiunile trebuie să explice clar ce se întâmplă.

## Modificări

- Ștergerea unui departament folosește `ConfirmDialog`, cu numele departamentului și avertizare despre dependențe.
- Resetarea unui rol la permisiunile implicite folosește `ConfirmDialog`, cu rolul vizat și impactul resetării.
- `SetariPage.jsx` nu mai conține `window.confirm`, `window.prompt` sau `window.alert`.

## Verificări

- `rg "window\.confirm|window\.prompt|window\.alert" client/src/pages/SetariPage.jsx client/src/components/ui/ConfirmDialog.jsx`
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `scripts\windows\build-update-zip.ps1 -SkipClientBuild`

## Impact

Nu schimbă endpointuri sau schema DB. Acțiunile administrative trimit aceleași requesturi, dar confirmarea este mai clară și mai potrivită pentru un ERP comercial.
