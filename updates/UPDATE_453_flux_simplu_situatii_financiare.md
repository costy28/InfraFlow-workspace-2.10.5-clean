# UPDATE 453 — Flux simplu Situații financiare

Versiune: `2.12.433`  
Data: `2026-08-01`

## Scop

Pagina Situații financiare trebuie să arate clar ce lipsește înainte ca raportul managerial să poată fi exportat: profil, mapări, control/balanță sau recalculare.

## Modificări

- `client/src/pages/accounting/SituatiiFinanciare.jsx`
  - adăugat panou „Flux simplu situații financiare”;
  - afișat firul profil → mapări → balanță/control → raport → export;
  - calculată automat prima acțiune utilă;
  - adăugați indicatori rapizi pentru rânduri, mapări active, indicatori fără valori și tip raport.

## Verificări

- `npm run build`
- `scripts/windows/build-update-zip.ps1`
- `node scripts/release-check.js`

## Observații

Raportul este tratat în continuare ca raport managerial configurabil. Nu au fost adăugate reguli legislative noi și nu se prezintă exportul ca formular oficial automat.
