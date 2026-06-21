# UPDATE 092 - Stabilizare generator update

Versiune: 2.12.72
Data: 2026-06-20

## Problema
- Era posibil sa fie creat un ZIP de update care modifica versiunea, dar nu includea build-ul real `client/dist`.
- In acest caz aplicatia afisa versiunea noua, dar interfata ramanea pe bundle-ul vechi.

## Rezolvare
- `scripts/windows/build-all.ps1` valideaza acum obligatoriu `client/dist/index.html`, `client/dist/assets/*.js` si `client/dist/assets/*.css`.
- `scripts/windows/build-installer.ps1` are aceeasi protectie pentru fluxurile vechi de build.
- ZIP-ul este blocat daca pachetul nu contine `version.json`, `server/package.json`, `server/app.js` si `client/dist/index.html`.
- ZIP-urile suspect de mici sunt respinse, pentru ca un update real de UI trebuie sa contina build-ul frontend.

## Verificare
- Build frontend rulat cu succes.
- Verificare sintaxa server rulata cu succes.
- Arhiva ZIP 2.12.72 include `client/dist`.
