# UPDATE 019 — Restart după update ZIP

Data: 2026-06-01
Versiune: 2.11.9

## Descriere

Corectează restartul automat al serverului după aplicarea unui pachet ZIP din
Setări → Actualizări. Helper-ul Windows detectează serviciul `InfraFlow` sau
task-ul programat `InfraFlow ERP`, oprește procesul vechi și pornește aplicația
din nou după aplicarea fișierelor.

## Fișiere modificate

- `server/modules/system/service.js`
- `package.json`
- `server/package.json`
- `client/package.json`
- `electron/package.json`
- `version.json`
- `CHANGELOG.md`
