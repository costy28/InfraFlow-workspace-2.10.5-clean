# UPDATE 438 — Checklist primii pași după instalare

Versiune: `2.12.418`  
Data: `2026-07-31`

## Context

InfraFlow devine produs comercial modular, nu implementare dedicată unui client sau unei industrii. După instalare, utilizatorul trebuie să vadă rapid ce are de configurat ca să poată începe lucrul real.

## Ce s-a schimbat

- Dashboardul afișează o secțiune nouă: `Primii pași după instalare`.
- Checklistul propune ordinea minimă de onboarding:
  1. configurare profil organizație;
  2. alegere module utile;
  3. utilizatori și roluri;
  4. email organizațional / integrări;
  5. import date de pornire;
  6. backup și update.
- Fiecare pas are explicație scurtă și buton către zona relevantă.
- Pagina Setări acceptă deep-link pe tab prin `?tab=...`, astfel încât Dashboardul poate deschide direct `General`, `Module`, `Utilizatori`, `Integrări` sau `Actualizări`.

## Fișiere modificate

- `client/src/pages/DashboardPage.jsx`
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

- Build frontend: de rulat înainte de pachetul ZIP.
- Pachet update ZIP: de generat cu scriptul standard.

## Impact

Schimbare frontend și documentație. Nu modifică schema DB, API-urile existente sau datele operaționale. Compatibilitatea este păstrată.
