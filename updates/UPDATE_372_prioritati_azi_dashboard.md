# UPDATE 372 — Priorități azi în dashboard

Versiune: `2.12.352`  
Data: `2026-07-22`

## Scop

Dashboard-ul principal trebuie să arate utilizatorului următorul pas logic, nu doar indicatori separați pe module.

## Modificări

- `client/src/pages/DashboardPage.jsx`
  - adăugat panou `Ce ai de făcut azi`;
  - agregare recomandări din documente de aprobat, sesizări, contracte, stocuri critice și proiecte;
  - prioritizare după severitate: urgent, atenție, informativ;
  - scurtături directe către modulul relevant;
  - stare explicită când nu există blocaje evidente;
  - integrare tolerantă cu modulul Contracte: dacă endpoint-urile nu sunt disponibile, restul dashboard-ului rămâne funcțional.

## Compatibilitate

- Nu necesită migrări MSSQL.
- Compatibil cu `DB_MODE=json`.
- Nu adaugă dependențe noi.

## Verificare

- Build frontend.
- Release check fără ZIP.
- Smoke test read-only module.
- Pachet update ZIP.
