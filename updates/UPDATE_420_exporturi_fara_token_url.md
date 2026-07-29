# UPDATE 420 — Exporturi și printări fără token în URL

Versiune: `2.12.400`  
Data: `2026-07-28`

## Obiectiv

Închiderea primului punct P0 din auditul complet: exporturile și printările protejate nu trebuie să expună tokenul de autentificare în query string, history browser, loguri sau capturi de ecran.

## Implementare

- Adăugat `client/src/utils/download.js`, utilitar comun pentru:
  - descărcare fișier prin `api.get(..., { responseType: 'blob' })`;
  - deschidere document printabil într-o fereastră nouă;
  - extragere nume fișier din `Content-Disposition`;
  - fallback la download când fereastra nouă nu poate fi folosită;
  - normalizare erori JSON întoarse ca blob.
- Înlocuite URL-urile cu `?token=...` în:
  - Achiziții: tipărire comandă și export PAAP;
  - Referate: tipărire referat;
  - Contracte: fișă contract, raport portofoliu și export portofoliu Excel;
  - Contabilitate/Terți: confirmare sold și fișă furnizor;
  - Kiosk: adeverință de salariat prin sesiunea ERP.
- Pentru login-ul kiosk pur, butonul de adeverință afișează mesaj explicit în loc să pară inactiv.

## Notă de securitate

Stream-ul live de notificări (`EventSource`) încă folosește token în URL. Nu a fost modificat mecanic în acest update deoarece browserul nu permite trimiterea headerului `Authorization` prin `EventSource` nativ. Va necesita un pas separat: sesiune cookie, handshake temporar sau endpoint SSE dedicat.

## Verificări

- `rg -n "token=" client/src server` — token în URL rămas doar pe SSE notificări.
- `npm run release:check -- --no-zip`
- `npm run build`
- `npm run test:smoke`
- `npm run test:hr`
- `npm run test:accounting`
- `git diff --check`
- `scripts/windows/build-update-zip.ps1 -SkipClientBuild`

## Fișiere modificate

- `client/src/utils/download.js`
- `client/src/pages/modules/AchizitiiPage.jsx`
- `client/src/pages/modules/ReferatePage.jsx`
- `client/src/pages/modules/ContractePage.jsx`
- `client/src/pages/accounting/TertiContab.jsx`
- `client/src/pages/KioskPage.jsx`
- `package.json`
- `server/package.json`
- `client/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
