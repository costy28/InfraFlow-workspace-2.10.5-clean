# UPDATE 440 — Asistent configurare în Setări

Versiune: `2.12.420`  
Data: `2026-07-31`

## Context

Dashboardul are deja checklist inteligent pentru primii pași, dar zona naturală de configurare este pagina Setări. Utilizatorul trebuie să vadă acolo, imediat, ce mai lipsește și unde trebuie să apese.

## Ce s-a schimbat

- Pagina Setări afișează un panou nou: `Asistent configurare`.
- Panoul este vizibil permanent deasupra taburilor.
- Asistentul arată:
  - progresul configurării;
  - numărul de pași finalizați;
  - următorul pas recomandat;
  - lista scurtă de pași cu status `gata` / `de făcut`.
- Fiecare pas deschide direct tabul relevant din Setări.

## Fișiere modificate

- `client/src/pages/SetariPage.jsx`
- `CHANGELOG.md`
- `version.json`
- `AGENTS.md`
- `docs/AUDIT_COMPLET_2026-07-28.md`
- `docs/AUDIT_MENTENANTA_2026-07-11.md`
- `package.json`
- `package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `server/package.json`
- `server/package-lock.json`

## Verificări

- Build frontend: de rulat înainte de ZIP.
- Release check: de rulat după generarea ZIP.

## Impact

Schimbare frontend și documentație. Nu modifică schema DB, nu adaugă endpointuri noi și refolosește logica de onboarding existentă în Setări.
