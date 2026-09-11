# UPDATE 566 — Rafinare Setări integrări și curățare comercială

Versiune: 2.12.546
Data: 2026-09-11

## Scop

Clarifică zona Setări → Conectări astfel încât integrarea cântarului să nu apară ca funcție duplicată și curăță câteva urme comerciale prea specifice din interfață.

## Modificări

- Setări grupează zona de conectări ca „Conectări”, cu taburi clare pentru „Surse externe” și „Mapări cântar”.
- Taburile vechi Cântar/Integrări rămân compatibile prin alias-uri, ca linkurile existente să nu se rupă.
- Cântarul nu mai apare ca dublură: sursa/adaptorul se setează în Surse externe, iar maparea produselor se face separat.
- Dashboard-ul trimite configurarea emailului către Surse externe și stabilizează graficul operațional pe containere compacte.
- Importul de date vechi folosește limbaj generic comercial, fără referință la Asfalt Pro.

## Verificări

- npm run build
- npm run release:check -- --no-zip
- npm run audit:file-exposure
- git diff --check
- build update ZIP
