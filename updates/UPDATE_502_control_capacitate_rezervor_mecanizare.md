# UPDATE 502 — Control capacitate rezervor în Mecanizare

Versiune: `2.12.482`  
Data: `2026-08-04`

## Scop

Adaugă o verificare practică peste soldul estimat de carburant: dacă soldul calculat pe utilaj/vehicul depășește capacitatea rezervorului, probabil există alimentări duplicate sau bonuri de consum lipsă.

## Implementat

- Backend-ul citește capacitatea rezervorului din fișa resursei (`tankCapacity`).
- Rândurile `fuelStockByAsset` includ:
  - `tank_capacity_litri`
  - `ocupare_rezervor_procent`
- Dacă soldul estimat depășește capacitatea rezervorului, statusul devine `atenție`.
- Frontend-ul afișează în tabel:
  - capacitatea rezervorului;
  - procentul estimat de ocupare;
  - bară vizuală pentru nivel estimat.
- Exportul Excel include capacitatea și procentul estimat.

## Observații

Controlul rămâne estimativ. Scopul lui este să scoată în față datele imposibile sau improbabile, ca operatorul să corecteze alimentări, bonuri sau capacități nesetate.
