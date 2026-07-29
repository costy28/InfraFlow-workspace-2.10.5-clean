# UPDATE 422 — Confirmări UX PAAP fără dialoguri native

Versiune: `2.12.402`  
Data: `2026-07-29`

## Scop

Începem curățarea UX identificată în audit: acțiunile critice nu trebuie să folosească dialoguri native de browser, ci confirmări clare, consecvente și ușor de înțeles în aplicație.

## Modificări

- Adăugat `client/src/components/ui/ConfirmDialog.jsx`, dialog reutilizabil pentru confirmări.
- În Achiziții / PAAP, generarea planului din istoric cere confirmare cu explicația impactului.
- În Achiziții / PAAP, anularea poziției cere confirmare cu ton de risc și menționează păstrarea istoricului pentru audit.
- Dialogul afișează stare de încărcare până când operațiunea server se finalizează.

## Verificări

- `rg "window\.confirm|window\.prompt|window\.alert" client/src/pages/modules/AchizitiiPage.jsx client/src/components/ui/ConfirmDialog.jsx`
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `scripts\windows\build-update-zip.ps1 -SkipClientBuild`

## Impact

Nu schimbă endpointuri sau schema DB. Este primul pas din înlocuirea confirmărilor native pe modulele active, fără risc asupra datelor existente.
