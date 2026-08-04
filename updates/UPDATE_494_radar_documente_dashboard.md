# UPDATE 494 — Radar compact documente pe Dashboard

Versiune: `2.12.474`  
Data: `2026-08-04`

## Scop

Dashboard-ul trebuie să arate rapid documentele care cer acțiune, fără ca utilizatorul să intre în mai multe zone pentru inbox, blocaje sau termene.

## Implementare

- Am înlocuit cardul simplu „Documente în așteptare” cu panoul „Documente care cer acțiune”.
- Panoul combină documentele din inbox cu documentele blocate raportate de Centrul de Comandă.
- Documentele blocate sunt afișate primele și includ vechimea blocajului.
- Documentele cu termen afișează starea scurtă: azi, mâine, număr de zile, întârziat sau data scurtă.
- Fiecare document deschide direct dosarul prin query `?document=...`.
- Centrul de Comandă folosește același deep-link direct către documentul blocat.

## Fișiere principale

- `client/src/pages/DashboardPage.jsx`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `version.json`

## Verificare

- `npm run build`
- `npm run release:check`
- ZIP update generat cu versiunea `2.12.474`
