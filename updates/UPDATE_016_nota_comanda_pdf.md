# UPDATE 016 — Notă Comandă PDF

Data: 2026-06-01
Versiune: 2.11.6

## Descriere

Generare PDF Notă Comandă identic cu formatul Publiserv, date automate din
suppliers + app_settings, semnături din roluri utilizatori și print direct din
browser.

## Funcționalități

- Rută `GET /api/procurement-orders/:id/pdf` cu permisiune de vizualizare achiziții.
- HTML A4 portrait cu header firmă și furnizor, tabel operațional, livrare, plată,
  recepție, minimum 10 rânduri produse și semnături.
- Watermark `DRAFT` pentru comenzile în stadiu draft.
- Buton `Tipărește` în lista comenzilor.
- Câmp `Preț unitar estimat` în modalul de creare comandă pentru calculul valorii.

## Fișiere modificate

- `server/modules/procurement/routes.js`
- `client/src/pages/modules/AchizitiiPage.jsx`
- `package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
