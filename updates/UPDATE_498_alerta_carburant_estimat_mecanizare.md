# UPDATE 498 — Alertă carburant estimat Mecanizare

Versiune: `v2.12.478`
Data: `2026-08-04`

## Obiectiv

Adăugarea unei prime verificări operaționale de carburant care funcționează indiferent dacă firma folosește alimentări manuale, PIUSI sau alt adaptor viitor.

## Implementat

- Dashboard-ul Mecanizare calculează lunar:
  - intrări carburant din alimentări înregistrate/importate;
  - consum real din bonuri de lucru;
  - sold estimat = intrări minus consum.
- Adăugat status `ok`, `atentie` sau `critic` pentru soldul estimat.
- Dashboard-ul `Parc & Resurse` afișează un card dedicat cu intrări, consum, sold și mesaj explicativ.
- UI-ul precizează că soldul este estimat și nu înlocuiește inventarul fizic.

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
