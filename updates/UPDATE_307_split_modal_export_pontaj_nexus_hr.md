# UPDATE 307 — Split modal export pontaj Nexus HR

Versiune: `2.12.287`  
Data: `2026-07-14`

## Ce s-a schimbat

- Modalul `Export Pontaj Nexus` a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HRNexusExportModal.jsx`.
- Componenta dedicată randează selecția lunii, selecția departamentului și acțiunea de export Nexus.
- `HRPage.jsx` păstrează state-ul și handler-ele principale: `nexusExportModal`, `nexusExportForm`, `setNexusExportForm`, `exportNexusTimesheet`.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este pentru mentenanță frontend și reducerea blocului de modaluri din `HRPage.jsx`.

## Verificări

- `npm --prefix client run build` — OK.
