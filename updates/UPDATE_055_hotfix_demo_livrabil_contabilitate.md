# UPDATE 055 - Hotfix demo/livrabil si contabilitate

Versiune: 2.12.34 -> 2.12.35
Data: 2026-06-13

## Context

Dupa lucrul pe demo, baza MSSQL locala `INFRAFLOW` putea ramane populata cu `app_state` demo, iar aplicatia livrabila de pe portul 4180 afisa utilizatori/date demo.
Separat, instanta demo pornea uneori pe `data/app-db.json` in loc de `data/app-db.demo.json`, ceea ce ducea la wizard de instalare pe domeniul demo.

## Modificari

- `.env.demo` seteaza explicit `INFRAFLOW_DB_FILE=app-db.demo.json` si `INFRAFLOW_DEMO_DB_FILE=app-db.demo.json`.
- Adaugat `scripts/windows/reset-clean-app-state.ps1` pentru reset administrativ MSSQL la instalare curata, cu backup inainte si restart optional.
- Motorul contabil completeaza automat conturile lipsa din planul Saga daca `accounting.chart` exista, dar este partial.
- UI contabilitate:
  - furnizorii/clientii pot fi editati din lista;
  - erorile de salvare si validare facturi sunt afisate in pagina/modal.

## Verificari

- Demo local `http://localhost:4190` foloseste `app-db.demo.json`.
- `https://demo.appnode.ro/api/setup/status` raspunde `required=false` cu `PUBLISERV DEMO SA`.
- Seed-ul contabil partial este completat cu conturile necesare validarii facturilor: `401`, `4111`, `4426`, `4427`, `628`, `704`.

## Nota operationala

Pentru o instalare locala deja contaminata cu demo in MSSQL, ruleaza ca Administrator:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Program Files (x86)\InfraFlow\scripts\windows\reset-clean-app-state.ps1"
```

Acest script pastreaza backup-ul starii anterioare in `backups\clean-reset`.
