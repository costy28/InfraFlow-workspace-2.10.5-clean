# UPDATE 525 — Explicație export CSV Documente

Versiune: `2.12.505`
Data: 2026-08-08

## Scop

Exportul CSV din Documente este deja compatibil cu Excel și include datele de
escaladare. Acest update face funcția mai explicită în interfață, astfel încât
utilizatorul să știe ce primește înainte să descarce fișierul.

## Modificări

- Zona de acțiuni din Documente afișează o explicație scurtă:
  - CSV-ul se deschide direct în Excel;
  - include responsabilul curent;
  - include zilele în pas;
  - include pragul și statusul escaladării.
- Butonul `Export CSV` a fost redenumit în `Export CSV Excel`.
- Exportul respectă în continuare selecția curentă sau lista filtrată dacă nu există selecție.

## Impact tehnic

- Nu necesită migrare SQL.
- Nu schimbă structura exportului introdusă în update-urile anterioare.
- Îmbunătățește claritatea interfeței pentru utilizatorii non-tehnici.

## Fișiere principale

- `client/src/pages/modules/DocumentePage.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
