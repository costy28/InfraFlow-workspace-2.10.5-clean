# UPDATE 523 — Export CSV escaladări Documente

Versiune: `2.12.503`
Data: 2026-08-08

## Scop

Exportul din Documente trebuie să păstreze aceeași explicație operațională
pe care o vede utilizatorul în aplicație. Dacă lista este filtrată pe
escaladări sau documente urmărite, raportarea externă trebuie să arate
responsabilul, vechimea în pas și pragul aplicat.

## Modificări

- Exportul CSV din Documente include coloane noi:
  - `responsabil_curent`;
  - `zile_in_pas`;
  - `prag_escaladare_zile`;
  - `status_escaladare`.
- Statusul exportat explică dacă documentul este:
  - peste prag;
  - în termen;
  - fără dată clară pe pasul curent.
- Calculul folosește aceleași praguri workflow ca filtrul `Escaladări`,
  Dashboard-ul și task-urile către responsabili.

## Impact tehnic

- Nu necesită migrare SQL.
- Nu schimbă datele sau fluxurile existente.
- Extinde doar exportul CSV existent din Documente.

## Fișiere principale

- `client/src/pages/modules/DocumentePage.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
