# UPDATE 467 — Flux simplu Terți contabili

Versiune: `2.12.447`
Data: `2026-08-01`

## Scop

Simplificarea paginilor `Contabilitate → Furnizori` și `Contabilitate → Clienți`, astfel încât operatorul să vadă din primul card dacă lista este goală, filtrată, cu scadențe, cu confirmări netrimise sau pregătită pentru facturi.

## Modificări

- Adăugat panou ghidat pentru fluxul:
  1. catalog terți;
  2. analitice contabile;
  3. scadențar;
  4. confirmări sold.
- Panoul recomandă automat acțiunea utilă:
  - adăugarea primului terț;
  - curățarea filtrelor fără rezultate;
  - export scadențar când există sold depășit;
  - filtrarea confirmărilor netrimise;
  - deschiderea facturilor când catalogul este pregătit.
- Adăugați indicatori rapizi:
  - terți afișați din total;
  - sold deschis;
  - valoare depășită;
  - confirmări netrimise.

## Fișiere modificate

- `client/src/pages/accounting/TertiContab.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`

## Verificări

- `npm run build` ✅

## Observații

Nu s-au schimbat API-uri, tabele MSSQL, analitice sau calcule de scadențar. Update-ul este strict de UX/ghidaj pentru clienți și furnizori.
