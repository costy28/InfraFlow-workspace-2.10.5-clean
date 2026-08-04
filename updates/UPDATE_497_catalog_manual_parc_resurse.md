# UPDATE 497 — Catalog manual Parc & Resurse

Versiune: `v2.12.477`
Data: `2026-08-04`

## Obiectiv

Decuplarea modulului Mecanizare / Parc & Resurse de importuri implicite dintr-un singur furnizor și clarificarea fluxului comercial generic: catalog manual primul, importuri opționale după nevoie.

## Implementat

- Adăugat card vizibil în `Parc Utilaje` pentru catalog propriu.
- Adăugate acțiuni rapide `+ Autovehicul` și `+ Utilaj`.
- Adăugat formular manual pentru creare autovehicul/utilaj folosind endpointul existent `POST /fleet-assets`.
- Redenumit tab-ul vizibil `Alimentări PIUSI` în `Import carburant`.
- Actualizate mesajele din asistentul Mecanizare ca să vorbească despre alimentări importate, nu despre PIUSI ca flux implicit.
- Adăugată opțiune rapidă de `+ Alimentare manuală` în zona de import carburant.
- Documentată direcția: Autominder și PIUSI sunt adaptoare opționale; CSV/Excel și alți furnizori rămân următorii pași.
- Notată direcția pentru alertă stoc carburant estimat pe baza alimentărilor și consumurilor.

## Fișiere modificate

- `client/src/pages/modules/MecanizarePage.jsx`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `CHANGELOG.md`

## Verificări

- `npm run build`
- `npm run release:check -- --no-zip`
- `git diff --check`
