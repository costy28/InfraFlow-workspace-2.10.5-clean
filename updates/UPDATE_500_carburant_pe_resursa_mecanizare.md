# UPDATE 500 — Carburant pe resursă Mecanizare

Versiune: `2.12.480`  
Data: `2026-08-04`

## Scop

Extinde controlul de carburant estimat din Mecanizare de la o alertă globală pe lună la o vedere practică pe fiecare utilaj sau vehicul.

## Implementat

- Backend-ul agregă alimentările lunii și consumul din bonurile de lucru pe `asset_id`.
- Dashboard-ul expune `fuelStockByAsset` cu intrări, consum, sold estimat, număr alimentări, număr bonuri, status și mesaj explicativ.
- Resursele sunt ordonate după criticitate, astfel încât problemele apar primele.
- Frontend-ul afișează tabelul „Carburant pe utilaj / vehicul”.
- Pentru fiecare resursă există acțiuni rapide:
  - `+ Alimentare`
  - `+ Bon`

## Statusuri

- `critic`: consum fără alimentări sau sold negativ.
- `atenție`: alimentări fără consum/bonuri sau sold aproape de prag.
- `ok`: alimentările acoperă consumul raportat.
- `fără mișcare`: resursa nu are alimentări sau consum în luna curentă.

## Observații

Calculul rămâne estimativ. Nu înlocuiește inventarul fizic al rezervorului/stocului, dar ajută operatorul să vadă rapid unde lipsesc alimentări, bonuri sau corecții.
