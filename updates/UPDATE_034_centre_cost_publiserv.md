# UPDATE 034 — Centre cost/profit Publiserv
Data: 04 Iunie 2026
Versiune: 2.12.14

## Descriere
Import si configurare centre cost/profit reale Publiserv, legatura utilaje/vehicule
catre centre de cost si document lunar automat pentru Controlling.

## Functionalitati
- Seed idempotent `db/seeds/cost_centers_publiserv.sql` pentru centrele Publiserv.
- Migrare `021_cost_centers_publiserv.sql` care extinde tipurile acceptate si aplica seed-ul la update.
- `fleet.assets.cost_center_id` indexat si legat de `controlling.cost_centers`.
- Mapare initiala utilaje: salubrizare, deszapezire, asfalt si canalizare.
- `GET /api/controlling/document-centre-cost?luna=YYYY-MM` pentru HTML/PDF print.
- `GET /api/controlling/document-centre-cost?luna=YYYY-MM&format=xlsx` pentru Excel.
- `GET /api/controlling/raport-centre-cost?luna=YYYY-MM&centru=COD` pentru executie cheltuieli.
- Butoane noi in Controlling -> Rapoarte: Document Centre Cost, Export Excel, Raport executie.

## Fisiere modificate
- `db/migrations/021_cost_centers_publiserv.sql`
- `db/seeds/cost_centers_publiserv.sql`
- `server/modules/controlling/routes.js`
- `server/modules/fleet/routes.js`
- `client/src/pages/modules/ControllingPage.jsx`
- `package.json`
