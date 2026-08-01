# UPDATE 464 — Flux simplu Solduri inițiale

Versiune: `2.12.444`
Data: `2026-08-01`

## Scop

Simplificarea paginii `Contabilitate → Administrare → Solduri inițiale`, astfel încât operatorul să vadă clar următorul pas înainte de a lucra în tabelul tehnic.

## Modificări

- Adăugat panou ghidat pentru fluxul:
  1. alegere an fiscal;
  2. completare conturi;
  3. echilibrare debit-credit;
  4. salvare și verificare în Balanță.
- Panoul recomandă automat acțiunea utilă:
  - `Adaugă linie` când nu există solduri;
  - completarea liniilor incomplete;
  - adăugarea unei linii de corecție când debitul și creditul nu bat;
  - `Salvează soldurile` când totul este echilibrat.
- Adăugați indicatori rapizi:
  - linii completate;
  - conturi selectate;
  - linii cu sume;
  - diferență debit-credit.

## Fișiere modificate

- `client/src/pages/accounting/SolduriInitiale.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`

## Verificări

- `npm run build` ✅

## Observații

Nu s-au schimbat API-uri, tabele MSSQL sau calculul soldurilor. Update-ul este strict de UX/ghidaj, ca parte din seria de simplificare contabilă.
