# UPDATE 062 - Fisa cont detaliata

Versiune: 2.12.41 -> 2.12.42
Data: 2026-06-14

## Backend

- `ledger()` calculeaza soldul initial din miscarile active anterioare intervalului selectat.
- Raspunsul pentru fisa contului include:
  - denumirea contului;
  - sold initial;
  - total debit;
  - total credit;
  - sold final;
  - uuid/id nota contabila pentru fiecare miscare.
- Adaugat export Excel:
  - `GET /api/accounting/ledger/:simbol/export`

## Frontend

- Pagina Fisa cont are filtre `De la` / `Pana la`.
- Afiseaza carduri cu sold initial, rulaj debit, rulaj credit si sold final.
- Tabelul miscarilor include document, tip document, explicatie, debit, credit si sold progresiv.
- Footer cu totaluri.
- Buton Export Excel.

## Verificari

- Sintaxa backend contabilitate verificata cu `node --check`.
- Build frontend verificat cu `npm run build`.
- Arhiva ZIP de update generata pentru test rapid.
