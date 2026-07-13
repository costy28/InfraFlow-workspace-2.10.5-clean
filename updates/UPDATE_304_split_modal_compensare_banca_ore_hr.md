# UPDATE 304 — Split modal compensare bancă de ore HR

Versiune: `2.12.284`  
Data: `2026-07-13`

## Ce s-a schimbat

- Modalul `Compensare bancă de ore` a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HROvertimeCompensationModal.jsx`.
- Componenta dedicată randează tipul de compensare, orele, sporul pentru plată și data compensării.
- `HRPage.jsx` păstrează state-ul și handler-ele principale: `compensateForm`, `compensateModal`, `compensateOvertime`, `setCompensateForm`.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este pentru mentenanță frontend și reducerea blocului de modaluri din `HRPage.jsx`.

## Verificări

- `npm --prefix client run build` — OK.
