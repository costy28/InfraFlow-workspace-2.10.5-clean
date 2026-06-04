# UPDATE 032 — Hotfix pornire modul Mediu
Data: 04 Iunie 2026
Versiune: 2.12.12

## Descriere
Repară crash-ul de pornire al serverului produs de modulul Mediu după instalarea curată `2.12.11`.

## Cauză
Rutele modulului Mediu apelau `requirePermission('environment:view')` direct la definirea routei Express. Helperul intern `requirePermission` primește `auth, res, permission`, nu este middleware Express, deci serverul cădea la încărcarea modulului înainte să pornească pe portul `4180`.

## Modificări
- Adăugat middleware local `requireEnvironmentAuth`.
- Adăugat wrapper `can(permission)` pentru rutele Mediu.
- Rutele `GET` folosesc `environment:view`.
- Rutele `POST/PUT` folosesc `environment:manage`.
- Păstrat installerul server cu SQL Server Express inclus și detectare automată SQL Engine.

## Fișiere modificate
- `server/modules/environment/routes.js`
- `package.json`
- `version.json`
- `client/package.json`
- `server/package.json`
- `electron/package.json`
- `installer/infraflow-server-setup.iss`
- `installer/infraflow-client-setup.iss`
