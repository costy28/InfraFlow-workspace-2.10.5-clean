# UPDATE 466 — Flux simplu Jurnale contabile

Versiune: `2.12.446`
Data: `2026-08-01`

## Scop

Simplificarea paginii `Contabilitate → Rapoarte → Jurnale contabile`, astfel încât operatorul să vadă din primul card dacă luna are date, avertizări, filtre active și dacă poate exporta dosarul lunar.

## Modificări

- Adăugat panou ghidat pentru fluxul:
  1. alegere lună;
  2. verificare facturi;
  3. verificare casă și bancă;
  4. export dosar lunar.
- Panoul recomandă automat acțiunea utilă:
  - reîncărcare când există avertizări;
  - deschiderea facturilor când jurnalele sunt goale;
  - verificarea trezoreriei pentru casă/bancă;
  - export Excel când datele sunt pregătite.
- Adăugați indicatori rapizi:
  - documente în jurnale;
  - operațiuni casă/bancă;
  - total documente;
  - avertizări.

## Fișiere modificate

- `client/src/pages/accounting/JurnaleClasice.jsx`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`

## Verificări

- `npm run build` ✅

## Observații

Nu s-au schimbat API-uri, tabele MSSQL sau calculul jurnalelor. Update-ul este strict de UX/ghidaj pentru controlul lunar contabil.
