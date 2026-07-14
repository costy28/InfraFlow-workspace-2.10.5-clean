# UPDATE 305 — Split modal evaluări HR

Versiune: `2.12.285`  
Data: `2026-07-13`

## Ce s-a schimbat

- Modalul `Evaluare nouă / Editează evaluare` a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HREvaluationModal.jsx`.
- Componenta dedicată randează angajatul, data evaluării, tipul evaluării, calificativul, punctajul, observațiile, obiectivele și recomandările.
- `HRPage.jsx` păstrează state-ul și handler-ele principale: `evalForm`, `evalModal`, `evalEditing`, `saveEvaluation`, `setEvalForm`.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este pentru mentenanță frontend și reducerea blocului de modaluri din `HRPage.jsx`.

## Verificări

- `npm --prefix client run build` — OK.
