# UPDATE 493 — Acțiuni rapide în dosarul documentului

Versiune: `2.12.473`  
Data: 2026-08-04

## Ce s-a schimbat

- Dosarul documentului afișează panoul „Următorul pas”.
- Dacă utilizatorul curent are pas de aprobare, vede direct acțiunile **Aprobă** și **Respinge**.
- Dacă documentul așteaptă alt responsabil, se poate crea un task precompletat pentru acel pas.
- Task-ul de deblocare preia pasul, responsabilul, prioritatea și termenul estimat din circuit.
- Documentele draft pot fi lansate în circuit direct din dosar.
- Dublura de butoane Aprobă/Respinge de la baza dosarului a fost eliminată.

## Fișiere principale

- `client/src/pages/modules/DocumentePage.jsx`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `version.json`

## Verificare

- `npm run build`
- `npm run release:check -- --no-zip`

## Pachet

- `installer/output/InfraFlow-update-v2.12.473.zip`
