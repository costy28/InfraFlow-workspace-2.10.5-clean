# UPDATE 350 — Startup robust după Windows Update

Versiune: 2.12.330  
Data: 2026-07-19

## Context

După un update Windows, serverul InfraFlow poate porni greu sau poate intra în bucla de restart din cauza helperului PowerShell folosit pentru MSSQL. În log apare tipic `spawnSync powershell.exe ETIMEDOUT`, deși SQL Server devine disponibil câteva secunde mai târziu.

## Implementat

- Timeout minim mai mare pentru helperul MSSQL PowerShell: 180 secunde.
- Retry/backoff pentru erori tranzitorii:
  - `ETIMEDOUT`;
  - timeout PowerShell;
  - SQL Server/instanță indisponibilă temporar;
  - erori de localizare instanță SQL după restart.
- Variabile explicite în task-ul generat:
  - `INFRAFLOW_MSSQL_HELPER_TIMEOUT_MS`;
  - `INFRAFLOW_MSSQL_HELPER_RETRIES`;
  - `INFRAFLOW_MSSQL_HELPER_RETRY_DELAY_MS`.
- `scripts/setup-task.ps1` inclus în update ZIP, pentru refacerea autostart fără installer complet.
- `repair-autostart.ps1` caută `setup-task.ps1` atât în `scripts`, cât și în `installer`.
- Verificarea de startup așteaptă implicit 150 secunde.

## Efect

InfraFlow are răbdare cu Windows/SQL Server după update-uri și poate repara mai ușor autostart-ul prin scripturile incluse în pachetul de update.

## Verificări

- `node --check server/core/db.js`
- parse PowerShell pentru:
  - `scripts/setup-task.ps1`;
  - `scripts/windows/repair-autostart.ps1`;
  - `scripts/windows/verify-infraflow-startup.ps1`.
