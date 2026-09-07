# UPDATE 562 — Audit stații autorizate

Versiune: `2.12.542`  
Data: `2026-09-07`

## Scop

După auditul de autentificări și roluri, administratorul trebuie să poată vedea rapid dacă există stații vechi, inactive, nefolosite sau cereri noi de autorizare.

## Implementat

- Diagnostic server-side pentru registrul de risc al stațiilor autorizate.
- Clasificare dispozitive:
  - sesiune activă;
  - OK;
  - fără activitate;
  - nefolosită 30+ zile;
  - nefolosită 90+ zile;
  - inactivă.
- Contoare pentru:
  - stații totale;
  - stații active;
  - stații inactive;
  - stații cu sesiune activă;
  - stații vechi de peste 30 zile;
  - cereri de stații în așteptare.
- IP-uri mascate pentru stații și cereri.
- Card `Audit stații autorizate` în Setări → Securitate, cu recomandare scurtă pe fiecare dispozitiv.

## Fișiere modificate

- `server/modules/system/service.js`
- `client/src/pages/SetariPage.jsx`
- `version.json`
- `package.json`
- `client/package.json`
- `server/package.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/IMBUNATATIRI_PRIORITARE_COMERCIAL.md`
- `docs/AUDIT_COMPLET_2026-09-05.md`

## Verificări

- `node --check server/modules/system/service.js`
- test local pentru calcul risc stații în `buildSecurityAccessDiagnostic()`
- `npm run build`

## Pas următor recomandat

Începem simplificarea UX pe modulele mari: Documente și Contracte, cu accent pe “următorul pas”, buton principal unic și acțiuni rare grupate sub Avansat.
