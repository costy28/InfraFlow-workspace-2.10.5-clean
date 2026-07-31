# UPDATE 441 — Asistent configurare pliabil

Versiune: `2.12.421`  
Data: `2026-07-31`

## Context

UPDATE 440 a adăugat asistentul de configurare în Setări. După ce configurarea este completă, panoul nu trebuie să ocupe spațiu inutil, dar trebuie să rămână disponibil pentru verificări rapide.

## Ce s-a schimbat

- Asistentul de configurare din Setări se poate strânge și redeschide manual.
- Panoul se deschide automat când există pași de onboarding lipsă.
- După configurarea completă, panoul devine compact automat.
- Bara compactă păstrează:
  - progresul configurării;
  - statusul general;
  - accesul rapid către următorul pas, dacă există.

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

Schimbare frontend și documentație. Nu modifică schema DB, nu adaugă endpointuri noi și păstrează logica existentă de onboarding.
