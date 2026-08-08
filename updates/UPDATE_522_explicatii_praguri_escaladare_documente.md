# UPDATE 522 — Explicații praguri escaladare Documente

Versiune: `2.12.502`
Data: 2026-08-08

## Scop

Facem escaladările documentelor urmărite mai ușor de înțeles pentru utilizator.
După ce pragurile configurate în workflow au început să fie folosite de filtre,
Dashboard și task-uri, aplicația trebuie să explice vizibil de ce un document
intră în zona de atenție.

## Modificări

- Panoul de escaladare asistată din Documente afișează pragul configurat pe lista curentă.
- Dacă lista conține documente cu praguri diferite, se afișează intervalul de praguri.
- Lista arată câte documente urmărite sunt deja peste prag.
- Radarul Dashboard afișează pentru fiecare document urmărit:
  - câte zile este în pasul curent;
  - câte zile mai sunt până la prag;
  - sau faptul că pragul a fost depășit.
- Logica folosește aceleași praguri workflow ca filtrul `Escaladări`.

## Impact tehnic

- Nu necesită migrare SQL.
- Nu schimbă regulile workflow.
- Îmbunătățește doar explicația vizuală și consistența informațiilor din UI.

## Fișiere principale

- `client/src/pages/modules/DocumentePage.jsx`
- `client/src/pages/DashboardPage.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
