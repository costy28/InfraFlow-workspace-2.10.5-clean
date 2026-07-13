# UPDATE 297 — Split pontaj și concedii fișă angajat HR

Versiune: `2.12.277`  
Data: `2026-07-13`

## Scop

Continuarea reducerii monolitului `HRPage.jsx` prin extragerea tabului `Pontaj & concedii` din fișa angajatului.

## Modificări

- Adăugat `client/src/pages/modules/hr/HREmployeeAttendanceTab.jsx`.
- Mutate în componentă dedicată:
  - KPI zile pontate;
  - KPI ore total;
  - sold CO rămas;
  - număr cereri concediu;
  - istoric concedii cu status.
- `HRPage.jsx` rămâne responsabil de selecția angajatului, datele calculate și state-ul existent.

## Compatibilitate

- Endpointurile existente rămân neschimbate.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul și datele afișate rămân aceleași.

## Verificări

- `npm --prefix client run build` — OK.
