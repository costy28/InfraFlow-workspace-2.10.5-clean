# UPDATE 316 — Split funcții print documente HR

Versiune: `2.12.296`  
Data: `2026-07-14`

## Scop

Continuarea reducerii fișierului mare `HRPage.jsx` prin extragerea funcțiilor de print/generare HTML pentru documente HR într-un helper dedicat.

## Modificări

- Adăugat `client/src/pages/modules/hr/hrDocumentPrint.js`.
- Mutate în helper funcțiile pentru:
  - print fișă angajat;
  - CIM și acte adiționale;
  - adeverințe;
  - fișă post;
  - notă GDPR;
  - notă lichidare;
  - cereri și declarații HR;
  - descărcare/arhivare documente Word generate.
- `HRPage.jsx` importă `createHrDocumentPrintActions()` și păstrează doar state-ul, API-ul principal, randarea și coordonarea panourilor.
- Dimensiunea `HRPage.jsx` a scăzut de la aproximativ 2655 linii la aproximativ 1942 linii.

## Compatibilitate

- Nu au fost schimbate endpointuri.
- Nu au fost schimbate tabele sau migrări DB.
- Nu au fost adăugate dependențe.
- Payload-urile, ferestrele de print, arhivarea documentelor și acțiunile UI rămân identice.

## Verificare

- `npm --prefix client run build` — OK.
- `npm run audit:local` — OK.
