# UPDATE 306 — Split modal import angajați HR

Versiune: `2.12.286`  
Data: `2026-07-14`

## Ce s-a schimbat

- Modalul `Import angajați` a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HRImportEmployeesModal.jsx`.
- Componenta dedicată randează descărcarea template-ului, selectorul CSV/Excel, mesajul fișierului pregătit și sumarul rezultatului de import.
- `HRPage.jsx` păstrează state-ul și handler-ele principale: `importModal`, `importFile`, `importResult`, `downloadTemplate`, `importEmployees`, `setImportFile`.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este pentru mentenanță frontend și reducerea blocului de modaluri din `HRPage.jsx`.

## Verificări

- `npm --prefix client run build` — OK.
