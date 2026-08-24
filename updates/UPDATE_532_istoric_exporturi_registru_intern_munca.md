# UPDATE 532 — Istoric exporturi registru intern muncă în Dashboard HR

Versiune: `2.12.512`  
Data: `2026-08-23`

## Obiectiv

După ce Dashboard HR poate descărca registrul intern de lucru, operatorul trebuie să vadă imediat trasabilitatea exporturilor.

## Implementare

- Exportul `GET /hr/reges/work-register.xlsx` creează acum și o înregistrare în istoricul `hr.reges_exports`.
- Înregistrarea este marcată cu tipul `work_register` și mesaj explicit că fișierul este registru intern XLSX.
- Cardul `Raportări oficiale muncă` afișează ultimele exporturi interne pentru utilizatorii cu permisiunea `hr:reges_export`.
- După descărcarea registrului intern, Dashboard HR reîncarcă automat istoricul.

## Limite explicite

- Istoricul afișat este pentru lucru intern și trasabilitate operațională.
- Nu reprezintă transmitere oficială REGES-Online.
- Nu necesită migrare SQL nouă, fiind folosit tabelul existent `hr.reges_exports`.

## Fișiere modificate

- `server/modules/hr/routes.js`
- `client/src/pages/modules/HRPage.jsx`
- `client/src/pages/modules/hr/HRDashboardPanel.jsx`
- `package.json`
- `client/package.json`
- `server/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
