# UPDATE 418 — Descărcare atașament sursă din document

Versiune: `2.12.398`  
Data: `2026-07-28`

## Scop

Închiderea fluxului operațional email → atașament → document: utilizatorul poate descărca atașamentul email original direct din dosarul documentului creat din acel atașament.

## Implementare

- `client/src/pages/modules/DocumentePage.jsx`
  - metadata sursei email include acum și URL-ul de descărcare al atașamentului;
  - dosarul documentului afișează buton `Descarcă atașamentul` când atașamentul este disponibil local;
  - descărcarea folosește clientul API autentificat și endpointul protejat al Inbox ERP;
  - atașamentele fără conținut local rămân marcate explicit ca `doar metadata`.

## Impact

- Documentele ERP create din atașamente email devin autosuficiente operațional.
- Utilizatorul nu mai trebuie să se întoarcă în Inbox doar ca să recupereze fișierul original.
- Nu se schimbă schema bazei de date și nu se modifică răspunsurile existente ale API-ului.

## Verificări

- `npm run release:check -- --no-zip`
- `node --check client/src/pages/modules/DocumentePage.jsx`
- `npm run build`
- `npm run test:smoke`
- `scripts/windows/build-update-zip.ps1 -SkipClientBuild`
- `npm run release:check`
