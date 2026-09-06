# UPDATE 552 — Scheduler oprit în audit și teste temporare

Versiune: **2.12.532**
Data: **2026-09-06**

## Ce s-a schimbat

- Adaugă flag-ul `INFRAFLOW_SCHEDULER_DISABLED=1` pentru medii de audit/test.
- `server/scheduler.js` nu mai pornește verificările inițiale, intervalele orare, autosync email și joburile zilnice când flag-ul este activ.
- Schedulerul PIUSI respectă același flag și nu pornește timerul automat în test.
- `audit:commercial-smoke`, `test:release` și `test:smoke` pornesc serverul temporar cu schedulerul oprit.
- Scripturile de smoke verifică explicit output-ul serverului și eșuează dacă apar joburi `scheduler check... start`.

## Impact

- Auditurile temporare devin curate: nu mai rulează alerte, scadențe, autosync email sau joburi operaționale peste baze temporare.
- Producția rămâne neschimbată: schedulerul pornește normal dacă flag-ul nu este setat.
- Nu schimbă schema bazei de date și nu necesită migrare SQL nouă.

## Verificări

- `node --check server/scheduler.js` ✅
- `node --check server/modules/integration/piusi.js` ✅
- `node --check scripts/audit-commercial-smoke.js` ✅
- `node --check scripts/release-accounting-acceptance.js` ✅
- `node --check scripts/smoke-modules-readonly.js` ✅
- `npm run audit:commercial-smoke` ✅ 11/11 verificări trecute, scheduler oprit.
- `npm run test:release` ✅ scheduler oprit.
- 
pm run test:smoke ✅ 69/69 verificări trecute, scheduler oprit.
- 
pm run audit:local ✅