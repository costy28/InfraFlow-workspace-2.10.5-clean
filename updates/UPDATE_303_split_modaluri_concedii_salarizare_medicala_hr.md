# UPDATE 303 — Split modaluri concedii și salarizare medicală HR

Versiune: `2.12.283`  
Data: `2026-07-13`

## Ce s-a schimbat

- Modalul `Cerere de concediu` a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HRLeaveRequestModal.jsx`.
- Modalul `Trimite concediul medical in salarizare` a fost extras în `client/src/pages/modules/hr/HRMedicalPayrollModal.jsx`.
- `HRPage.jsx` păstrează state-ul și handler-ele principale: `leaveForm`, `leaveModal`, `createLeave`, `medicalPayrollItem`, `medicalDailyBase`, `confirmMedicalPayroll`.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este pentru mentenanță frontend și reducerea blocului de modaluri din `HRPage.jsx`.

## Verificări

- `npm --prefix client run build` — OK.
