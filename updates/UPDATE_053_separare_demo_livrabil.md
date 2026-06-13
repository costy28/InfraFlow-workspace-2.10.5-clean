# UPDATE 053 - Separare demo/livrabil

Versiune: 2.12.31 -> 2.12.32
Data: 2026-06-13

## Context

Demo-ul si aplicatia livrabila foloseau acelasi fisier JSON runtime (`data/app-db.json`) in modul local.
Acest lucru putea face ca datele demo sa apara in aplicatia curata sau sa fie folosite accidental in testele pentru client.

## Modificari

- `data/app-db.json` a fost readus la starea curata de instalare (`setupCompleted=false`, fara utilizatori).
- Snapshot-ul demo local este separat in `data/app-db.demo.json`.
- `scripts/seed-demo.js` si `scripts/reset-demo-data.js` scriu implicit in `data/app-db.demo.json`.
- `scripts/windows/start-demo.ps1` porneste serverul demo cu `INFRAFLOW_DB_FILE=app-db.demo.json`.
- `server/core/db.js` permite alegerea explicita a fisierului JSON prin `INFRAFLOW_DB_FILE`.
- Recuperarea automata MSSQL din fisier local refuza app_state demo, exceptand cazul explicit `INFRAFLOW_ALLOW_DEMO_RECOVERY=1`.
- Installerul server nu mai include `restore-demo-app-state.ps1`.
- Build-ul release blocheaza installerul daca incearca sa includa `data/app-db.json` sau scriptul de restore demo.
- ZIP-ul de update elimina si verifica fisierele demo-only inainte de arhivare.

## Regula noua

Aplicatia livrabila trebuie sa ramana curata in orice moment. Demo-ul este profil separat si nu se livreaza catre clienti.
