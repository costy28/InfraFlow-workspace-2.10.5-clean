# UPDATE 051 - Protectie app_state MSSQL si restore demo

Versiune: 2.12.29 -> 2.12.30
Data: 2026-06-13

## Context

Pe instalarea locala demo, procesul server rula elevat prin Task Scheduler si pastra in memorie starea demo valida, dar `dbo.app_state` din MSSQL putea ajunge gol/minimal dupa reparatii sau update-uri partiale. Dupa restart, serverul ar fi pornit din starea goala si autentificarea nu mai functiona.

## Modificari

- `server/core/db.js`
  - Detecteaza la startup cazul clar in care MSSQL are `app_state` gol/minimal, fara utilizatori si fara setup complet.
  - Daca exista `data/app-db.json` local cu `settings.setupCompleted=true` si utilizatori, restaureaza automat acel snapshot in `dbo.app_state`.
  - Salveaza backup inainte de recuperare in `data/recovery/mssql-app-state-before-auto-recovery-*.json`.
  - Nu suprascrie baze valide: daca MSSQL are utilizatori sau setup complet, recuperarea este sarita.
  - Poate fi dezactivat cu `INFRAFLOW_DISABLE_APP_STATE_RECOVERY=1`.

- `scripts/windows/restore-demo-app-state.ps1`
  - Script administrativ pentru restaurarea explicita a demo-ului din `data/app-db.json` in MSSQL.
  - Face backup in `backups/manual-demo-restore/`.
  - Reporneste controlat task-ul `InfraFlow ERP`, daca nu se ruleaza cu `-NoRestart`.

- `scripts/windows/apply-hotfix-051-installed.ps1`
  - Copiaza hotfix-ul 051 peste instalarea locala, cu backup al fisierelor inainte de suprascriere.
  - Verifica sintaxa serverului si reporneste controlat aplicatia.

- `installer/infraflow-server-setup.iss`
  - Include scriptul de restore demo in instalarea server.

## Verificare recomandata

```powershell
node --check server/core/db.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/restore-demo-app-state.ps1 -NoRestart
Invoke-RestMethod http://127.0.0.1:4180/api/system/health
```
