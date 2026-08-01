# UPDATE 465 — Flux simplu Șabloane note contabile

Versiune: `2.12.445`
Data: `2026-08-01`

## Scop

Simplificarea paginii `Contabilitate → Administrare → Șabloane note contabile`, astfel încât operatorul să înțeleagă rapid ce șabloane există, ce filtre sunt active și cum se folosesc la facturi.

## Modificări

- Adăugat panou ghidat pentru fluxul:
  1. alegere tip document;
  2. verificare șabloane active;
  3. control conturi disponibile;
  4. folosire pe facturi.
- Panoul recomandă automat acțiunea utilă:
  - `Șablon nou` când nu există configurare;
  - `Curăță filtrul` când filtrul curent nu găsește șabloane;
  - `Creează șablon custom` când există doar reguli de sistem;
  - deschiderea facturilor de intrare/ieșire când șabloanele sunt pregătite.
- Adăugați indicatori rapizi:
  - șabloane afișate din total;
  - șabloane custom active;
  - șabloane de sistem;
  - conturi disponibile.

## Fișiere modificate

- `client/src/pages/accounting/SabloaneNote.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`

## Verificări

- `npm run build` ✅

## Observații

Nu s-au schimbat API-uri, tabele MSSQL sau regulile de generare note. Update-ul este strict de UX/ghidaj pentru o pagină de configurare contabilă.
