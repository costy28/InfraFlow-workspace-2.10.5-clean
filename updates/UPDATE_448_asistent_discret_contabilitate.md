# UPDATE 448 — Asistent discret Contabilitate

Versiune: `2.12.428`  
Data: `2026-08-01`

## Obiectiv

Dashboard-ul contabil trebuia să indice mai limpede următorul pas al lunii: configurări lipsă, documente de curățat, alerte legislative sau închiderea perioadei.

## Modificări

- Am adăugat pe dashboard un asistent contabil compact, calculat din `summary`, `health` și `reconciliation`.
- Asistentul recomandă prima acțiune utilă și oferă link direct către zona relevantă.
- Am adăugat indicatori rapizi pentru verificări de bază, probleme lunare, status reconciliere și alerte legislative.
- Am adăugat un mini-flux în 3 pași: curățare bază → documente → închidere lună.

## Fișiere modificate

- `client/src/pages/accounting/ContabilitateDashboard.jsx`
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
