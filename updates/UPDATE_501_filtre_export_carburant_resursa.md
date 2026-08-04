# UPDATE 501 — Filtre și export pentru carburant pe resursă

Versiune: `2.12.481`  
Data: `2026-08-04`

## Scop

Face panoul de carburant pe utilaj/vehicul mai ușor de folosit zilnic. După calculul pe resursă, operatorul are nevoie să vadă imediat problemele și să poată scoate lista în Excel.

## Implementat

- Filtrul implicit este `Probleme`, adică resurse cu status `critic` sau `atenție`.
- Filtre rapide disponibile:
  - `Probleme`
  - `Critice`
  - `Toate`
  - `Fără mișcare`
- Export Excel direct din panou pentru lista filtrată.
- Mesaj prietenos când filtrul selectat nu are rezultate.
- Etichetele și tonurile pentru status carburant sunt centralizate în frontend.

## Beneficiu operațional

Responsabilul de parc nu mai trebuie să parcurgă toate resursele ca să găsească lipsuri. Intră în Dashboard, vede direct problemele și poate exporta lista pentru verificare sau corecții.
