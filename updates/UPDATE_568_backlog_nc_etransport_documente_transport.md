# UPDATE 568 — Backlog NC, e-Transport și documente transport

Versiune: 2.12.548
Data: 2026-09-11

## Scop

Notează controlat direcția pentru coduri NC, e-Transport și documente de transport, fără implementare funcțională în acest pas și fără amestecarea cu fluxurile curente.

## Modificări

- Adaugă în backlog codurile NC ca nomenclator viitor pentru contabilitate, logistică și documente comerciale.
- Notează e-Transport ca adaptor specific României, activ pe profil de țară și fără hardcodare pentru alte jurisdicții.
- Planifică emiterea de CMR, bonuri de transport și avize de însoțire din modulele relevante.
- Leagă direcția viitoare de fluxul comandă/livrare, contract, factură, stoc și traseu.
- Înregistrează `LISTA-CODURI-NC-2024.ods` ca referință de lucru, cu obligația verificării unei surse oficiale mai actuale înainte de import.

## Verificări

- npm run build
- npm run release:check -- --no-zip
- npm run audit:file-exposure
- git diff --check
- build update ZIP
