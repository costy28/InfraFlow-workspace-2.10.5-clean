# UPDATE 326 — Restart robust după update

Versiune: `2.12.306`  
Data: `2026-07-15`

## Context

Pe instalările unde InfraFlow rulează prin `start-server.bat`, fără serviciu Windows `InfraFlow` și fără task programat `InfraFlow ERP`, fallback-ul de restart post-update putea porni serverul prin scriptul generic `start-infraflow.ps1`. Acest fallback nu păstra mereu configurația runtime MSSQL din launcherul instalat.

## Modificări

- `server/modules/system/service.js`
  - helperul de restart preferă `start-server.bat` în fallback-ul direct;
  - păstrează configurația runtime folosită de instalare;
  - scrie jurnal în `runtime/restart-last.log`;
  - verifică `/api/health` după comanda de pornire.
- `server/modules/system/update-routes.js`
  - răspunsul de aplicare update anunță `restart_in: 12`, o fereastră mai realistă pentru Windows + SQL Server.

## Verificări

- `node --check server/modules/system/service.js`
- `node --check server/modules/system/update-routes.js`
- generare helper restart în mod dry-run;
- validare sintaxă PowerShell pentru scriptul generat.
