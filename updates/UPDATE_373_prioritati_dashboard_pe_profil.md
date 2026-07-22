# UPDATE 373 — Priorități dashboard pe profil utilizator

Versiune: `2.12.353`  
Data: `2026-07-22`

## Scop

Panoul `Ce ai de făcut azi` trebuie să fie util pentru fiecare tip de utilizator, nu doar o listă universală.

## Modificări

- `client/src/pages/DashboardPage.jsx`
  - profil de dashboard derivat din rol, departament și username;
  - profiluri: executiv, HR, financiar, achiziții, operațional și general;
  - prioritățile sunt reordonate după domeniile relevante profilului;
  - recomandările necritice din afara profilului sunt ascunse pentru utilizatorii specializați;
  - recomandările critice rămân vizibile indiferent de profil;
  - panoul afișează eticheta profilului curent și un text explicativ adaptat;
  - se includ cererile HR în așteptare;
  - se poate evidenția sumarul contabil când transmite o stare de verificat.

## Compatibilitate

- Nu necesită migrări MSSQL.
- Compatibil cu `DB_MODE=json`.
- Nu adaugă dependențe noi.

## Verificare

- Build frontend.
- Release check.
- Smoke test read-only module.
- Pachet update ZIP.
