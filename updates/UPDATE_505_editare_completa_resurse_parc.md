# UPDATE 505 — Editare completă resurse parc

Versiune: `2.12.485`
Data: 2026-08-05

## Context

Catalogul manual pentru autovehicule și utilaje permitea adăugarea de resurse, dar corectarea unei resurse existente nu era suficient de directă din lista de lucru.

## Implementare

- Am adăugat endpoint `PATCH /api/fleet-assets/:id`.
- Endpoint-ul actualizează câmpurile principale din fișa resursei: categorie, denumire, identificare, tip, marcă, model, an, departament, centru cost, contor, combustibil, rezervor, consum normat, scadențe și observații.
- Editarea este auditată prin `utilaj_actualizat`.
- Dacă se modifică valoarea contorului, se adaugă o corecție în istoricul de rulaj.
- În „Parc Utilaje”, fiecare card are buton `Editează`.
- Formularul existent de adăugare este reutilizat și pentru editare, ca să păstrăm experiența simplă și coerentă.

## Verificări

- `npm run build`
- `npm run release:check -- --no-zip`
- `git diff --check`

## Fișiere atinse

- `server/modules/fleet/routes.js`
- `client/src/pages/modules/MecanizarePage.jsx`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `version.json`
