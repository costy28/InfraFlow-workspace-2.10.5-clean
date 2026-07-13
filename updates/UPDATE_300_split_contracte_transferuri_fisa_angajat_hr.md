# UPDATE 300 — Split contracte și transferuri fișă angajat HR

Versiune: `2.12.280`
Data: `2026-07-13`

## Ce s-a schimbat

- Tabul `Contracte & acte` din fișa angajatului a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HREmployeeContractsTab.jsx`.
- Componenta nouă randează:
  - panoul contractelor operaționale pentru salarizare;
  - actele adiționale și acțiunile de print/Word/arhivare;
  - formularele locale pentru contract și act adițional;
  - istoricul transferurilor între departamente.
- `HRPage.jsx` păstrează state-ul, încărcarea datelor, handler-ele de contracte/acte și funcțiile de generare/arhivare documente Word.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este strict de mentenanță frontend.

## Verificări

- `npm --prefix client run build` — OK.
