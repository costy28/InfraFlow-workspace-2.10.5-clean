# UPDATE 020 — Restart robust după update ZIP

Data: 01 Iunie 2026
Versiune: 2.11.11

## Descriere

Hotfix pentru relansarea serverului după aplicarea unei arhive ZIP. Restartul
este executat printr-un task Windows temporar, independent de procesul Node
care este oprit în timpul actualizării.

## Funcționalități

- Restart sigur pentru serviciul Windows `InfraFlow`.
- Restart sigur pentru task-ul programat `InfraFlow ERP`.
- Fallback cu pornire directă ascunsă dacă instalarea nu folosește serviciu sau task.
- Jurnal diagnostic în `runtime/restart-last.log`.

## Fișiere principale

- `server/modules/system/service.js`
- `updates/UPDATE_020_restart_robust.md`
