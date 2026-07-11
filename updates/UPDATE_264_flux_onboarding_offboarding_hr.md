# UPDATE 264 — Flux onboarding si offboarding HR

Versiune: 2.12.244  
Data: 2026-07-11

## Scop

HR-ul are nevoie de un flux ghidat, nu doar de documente si checklisturi separate. Update-ul adauga onboarding/offboarding direct in fisa angajatului, cu pasi bifabili si progres.

## Functionalitati backend

- `GET /api/hr/employees/:id/workflow`
- `POST /api/hr/employees/:id/workflow/start`
- `PATCH /api/hr/employees/:id/workflow/steps/:stepKey`
- `POST /api/hr/employees/:id/workflow/close`

Fluxurile sunt stocate in `hr.employeeWorkflows`, auditate si compatibile cu modul JSON/app-state.

## Functionalitati frontend

- Tab nou in fisa angajatului: `Onboarding / Offboarding`.
- Butoane:
  - `Porneste onboarding`;
  - `Porneste offboarding`;
  - `Reincarca`;
  - `Inchide ca finalizat`;
  - `Anuleaza flux`.
- Progres vizual total si progres pe pasi obligatorii.
- Pasi bifabili manual.
- Pasi detectati automat din datele existente.

## Pasi onboarding

- Date personale.
- Cont ERP/Kiosk asociat.
- CIM generat/arhivat.
- Act identitate.
- Fisa postului.
- SSM / PSI.
- Apt medical.
- GDPR.
- Echipamente initiale.
- Confirmari Kiosk.

## Pasi offboarding

- Decizie incetare/document final.
- Nota de lichidare.
- Predare echipamente/inventar.
- Verificare CO ramas.
- Dezactivare cont Kiosk.
- Documente finale.
- Dosar HR inchis.

## Verificari

- `node --check server\modules\hr\employee-file-routes.js`
- `npm run build`
