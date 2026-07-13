# UPDATE 302 — Split modal angajat HR

Versiune: `2.12.282`  
Data: `2026-07-13`

## Ce s-a schimbat

- Modalul `Angajat nou` a fost extras din `HRPage.jsx` în componenta dedicată `client/src/pages/modules/hr/HREmployeeModal.jsx`.
- Componenta nouă randează secțiunile de CNP/identitate, date personale, angajare, financiar, documente/scadențe și GDPR.
- `HRPage.jsx` păstrează state-ul și acțiunile principale: `employeeForm`, `employeeModal`, `createEmployee`, `setEmployeeForm`.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este pentru mentenanță frontend și reducerea dimensiunii `HRPage.jsx`.

## Verificări

- `npm --prefix client run build` — OK.
