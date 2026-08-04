# UPDATE 496 — Acțiuni în masă pentru Documente

Versiune: `2.12.476`  
Data: `2026-08-04`

## Scop

După filtrele rapide, pagina Documente trebuie să permită lucru pe mai multe documente fără operații repetitive.

## Implementare

- Am adăugat selecție multiplă pentru documentele afișate.
- Toolbar-ul poate selecta sau deselecta rapid lista filtrată.
- Utilizatorul poate crea task-uri în masă pentru documentele selectate.
- Se creează câte un task pentru fiecare document, cu:
  - responsabil;
  - prioritate;
  - termen;
  - sursă `document`;
  - deep-link direct către dosarul documentului.
- Lista curentă sau selecția poate fi exportată CSV.
- Exportul include număr document, titlu, tip, status, prioritate, termen, data actualizării și sursa email.

## Fișiere principale

- `client/src/pages/modules/DocumentePage.jsx`
- `CHANGELOG.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
- `AGENTS.md`
- `version.json`

## Verificare

- `npm run build`
- `npm run release:check`
- ZIP update generat cu versiunea `2.12.476`
