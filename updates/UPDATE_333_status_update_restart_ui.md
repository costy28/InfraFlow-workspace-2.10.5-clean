# UPDATE 333 — Status update și restart în UI

Versiune: `2.12.313`  
Data: `2026-07-18`

## Ce s-a schimbat

- Backend:
  - endpoint nou `GET /system/update/status`;
  - citește versiunea runtime;
  - citește ultimul update aplicat din `settings.update_history`;
  - citește ultimele linii din `runtime/restart-last.log`;
  - clasifică restartul ca `ok`, `warning`, `running` sau `never_run`.

- Frontend:
  - panou nou în Setări → Actualizări: `Status update / restart`;
  - afișează versiunea runtime, ultimul update aplicat și starea restartului;
  - afișează ultimele linii din logul de restart;
  - buton nou `Verifică server după update`.

- Roadmap:
  - adăugat modulul `Contract Management` ca direcție comercială activă:
    - valoare contract;
    - consum din facturi;
    - alerte prag;
    - CPV România;
    - manageri contract;
    - raportare către Achiziții/Contabilitate.

## Motiv

După consolidarea pachetării ZIP, utilizatorul trebuie să poată vedea clar dacă serverul a revenit după aplicarea update-ului. În plus, ideea de Contract Management devine o direcție importantă pentru produsul comercial.

## Validare

- `node --check server/modules/system/update-routes.js`
- `npm run build`
- `npm run audit:local`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/build-update-zip.ps1 -SkipClientBuild`
