# UPDATE 451 — Flux simplu Trezorerie

Versiune: `2.12.431`  
Data: `2026-08-01`

## Obiectiv

Trezoreria trebuie să indice clar următoarea operație utilă: legare factură, validare, stingere avans, alocare pe facturi sau pregătire plată/încasare din scadențar.

## Modificări

- Am adăugat un panou „Flux simplu trezorerie”.
- Panoul calculează următoarea acțiune din datele deja încărcate:
  - draft cu factură sugerată;
  - draft cu date lipsă;
  - draft gata de validare;
  - avans care poate fi stins cu factura sugerată;
  - operație disponibilă pentru alocare pe mai multe facturi;
  - factură furnizor/client cu rest deschis.
- Am adăugat indicatori rapizi pentru Drafturi, Sugestii, Facturi furnizor, Facturi client, Avansuri și Neclasificate.

## Fișiere modificate

- `client/src/pages/accounting/Trezorerie.jsx`
- `CHANGELOG.md`
- `version.json`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`
- `package.json`, `package-lock.json`, `client/package.json`, `client/package-lock.json`, `server/package.json`

## Verificare

- `npm run build`
- `npm run release:check`
- `scripts/windows/build-update-zip.ps1`
