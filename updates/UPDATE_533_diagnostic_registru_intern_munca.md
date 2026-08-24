# UPDATE 533 — Diagnostic pregătire registru intern muncă

Versiune: `2.12.513`  
Data: `2026-08-24`

## Obiectiv

Înainte de descărcarea registrului intern de lucru, HR trebuie să vadă dacă datele de bază sunt complete sau dacă exportul ar ieși cu lipsuri.

## Implementare

- Am adăugat analizor reutilizabil `analyzeRegesWorkRegister()`.
- Am adăugat endpoint read-only `GET /hr/reges/work-register/diagnostic`, protejat cu `hr:reges_export`.
- Dashboard HR afișează în cardul `Raportări oficiale muncă`:
  - total angajați verificați;
  - angajați pregătiți;
  - atenționări;
  - blocaje;
  - primele lipsuri concrete per angajat.
- Exportul intern folosește acum `contract.data_start` ca fallback pentru data de începere, înainte de `employee.data_angajare`.

## Date verificate

Blocaje:

- CUI angajator;
- CNP;
- nume salariat;
- contract activ;
- număr contract;
- dată contract;
- dată începere.

Atenționări:

- funcție;
- normă ore;
- salariu bază.

## Teste

- Test HR pentru fallback-ul `Data_incepere`.
- Test HR pentru diagnosticul lipsurilor obligatorii.

## Migrare SQL

Nu necesită migrare SQL nouă.

## Fișiere modificate

- `server/modules/hr/reges-work-register.js`
- `server/modules/hr/routes.js`
- `server/tests/hr-regression.test.js`
- `client/src/pages/modules/HRPage.jsx`
- `client/src/pages/modules/hr/HRDashboardPanel.jsx`
- `package.json`
- `client/package.json`
- `server/package.json`
- `version.json`
- `CHANGELOG.md`
- `AGENTS.md`
