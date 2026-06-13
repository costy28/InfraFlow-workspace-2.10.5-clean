# UPDATE 047 - Hotfix pornire dupa update

Versiune sursa: 2.12.25 -> 2.12.26
Data: 2026-06-11

## Problema

Dupa aplicarea update-ului, serverul putea sa nu porneasca atunci cand era lansat direct cu `node server/src/server.js` fara configurare explicita de baza de date.

In acest caz, `server/core/db.js` folosea implicit `mssql`, construia o conexiune SQL Server cu userul fallback `infraflow` si parola placeholder, apoi cadea la startup cu:

`Login failed for user 'infraflow'.`

## Fix

- `server/core/db.js` foloseste implicit `DB_MODE=json` daca nu exista configurare explicita.
- `server/src/config.js` raporteaza acelasi provider implicit: `json`.
- Daca serviciul sau runtime-ul seteaza explicit `DB_MODE=mssql` ori `INFRAFLOW_DB_PROVIDER=mssql`, comportamentul MSSQL ramane neschimbat.
- Aplicatia nu mai moare la pornire directa fara `runtime/mssql.env`.
- `installer/setup-task.ps1` genereaza `start-server.bat` cu fallback `DB_TRUSTED_CONNECTION=true`.
- `scripts/windows/build-all.ps1` a fost rescris ASCII si stabilizat, astfel incat build-ul complet sa nu se mai opreasca in pasul ZIP si sa returneze exit code real.
- Installerul server include acum sursa completa, inclusiv rutele adaugate recent: FAZ, fisa vehicul si demo routes.

## Fisiere modificate

- `server/core/db.js`
- `server/src/config.js`
- `installer/setup-task.ps1`
- `scripts/windows/build-all.ps1`
- `package.json`
- `package-lock.json`
- `client/package.json`
- `client/package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `electron/package.json`
- `electron/package-lock.json`
- `version.json`

## Verificari

- `node --check server/core/db.js` OK.
- `node --check server/src/config.js` OK.
- `node --check server/src/server.js` OK.
- Pornire temporara pe port `4194`, fara `DB_MODE` si fara `INFRAFLOW_DB_PROVIDER`: OK.
- Build complet installer server/client v2.12.26: OK.
- `server/app.js` incarcat prin `require('./server/app')` in `DB_MODE=json`: OK.
- React build: OK.
- Inno Setup Server installer: OK.
- Electron client build + Inno Client installer: OK.
- `/api/system/health` a returnat:

```json
{"ok":true,"mode":"json","server":null,"database":"app-db.json","pool":null}
```

## Nota

Pentru instalarea reala cu SQL Server Express, serviciul trebuie sa porneasca in continuare cu `DB_MODE=mssql` si credentiale valide. Acest hotfix doar previne crash-ul cand configurarea MSSQL lipseste sau nu este injectata in proces.
