# UPDATE 524 — Export CSV Excel-friendly Documente

Versiune: `2.12.504`
Data: 2026-08-08

## Scop

Exportul CSV din Documente trebuie să fie deschis ușor în Excel pe Windows,
inclusiv pe setări regionale RO/EU, fără import manual și fără pierderea
diacriticelor.

## Modificări

- CSV-ul folosește separator `;`, mai potrivit pentru Excel în setări regionale europene.
- Fișierul include BOM UTF-8 pentru afișarea corectă a diacriticelor.
- Prima linie `sep=;` ajută Excel să împartă automat coloanele la deschidere.
- Numele fișierului exportat include contextul:
  - `Documente_Selectate_YYYY-MM-DD.csv`;
  - `Documente_Escaladari_YYYY-MM-DD.csv`;
  - `Documente_Urmarite_YYYY-MM-DD.csv`;
  - `Documente_Lista_YYYY-MM-DD.csv`.

## Impact tehnic

- Nu necesită migrare SQL.
- Nu schimbă datele exportate.
- Îmbunătățește compatibilitatea cu Excel și lizibilitatea fișierelor exportate.

## Fișiere principale

- `client/src/pages/modules/DocumentePage.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/PRODUCTIZARE_COMERCIALA.md`
