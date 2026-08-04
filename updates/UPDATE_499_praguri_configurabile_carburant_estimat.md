# UPDATE 499 — Praguri configurabile carburant estimat

Versiune: `v2.12.479`
Data: `2026-08-04`

## Obiectiv

Transformarea alertei de carburant estimat dintr-un calcul cu prag fix într-un control configurabil pe organizație.

## Implementat

- Adăugat helper server-side pentru setările de carburant estimat.
- Dashboard-ul Mecanizare folosește:
  - prag minim în litri;
  - procent din consumul real al lunii;
  - maximul dintre cele două ca prag efectiv de atenție.
- Adăugat endpoint `PATCH /api/mechanization/fuel-stock-settings`.
- Salvarea pragurilor cere permisiune `mechanization:manage`.
- Modificarea pragurilor este auditată.
- Cardul de carburant estimat din UI permite editarea și salvarea pragurilor.
- Panoul afișează pragul efectiv calculat pentru luna curentă.

## Fișiere modificate

- `server/modules/mechanization/routes.js`
- `client/src/pages/modules/MecanizarePage.jsx`
- `AGENTS.md`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`

## Verificări

- `npm run build`
- `npm run release:check -- --no-zip`
- `git diff --check`
