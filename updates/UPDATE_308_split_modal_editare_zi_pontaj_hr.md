# UPDATE 308 — Split modal editare zi pontaj HR

Versiune: `2.12.288`  
Data: `2026-07-14`

## Scop

Continuă reducerea controlată a fișierului `HRPage.jsx` prin extragerea modalului de editare pontaj zilnic într-o componentă React dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRTimesheetEditModal.jsx`.
- Mutat formularul modalului `Pontaj - [angajat]` în componenta nouă:
  - data pontajului;
  - tip zi;
  - ore lucrate;
  - observații;
  - acțiunile `Renunta` și `Salveaza pontaj`.
- `HRPage.jsx` păstrează:
  - state-ul `timesheetEdit`;
  - handler-ul `saveTimesheetCell`;
  - apelul API `/hr/timesheets`;
  - logica de deschidere/închidere a modalului.

## Compatibilitate

- Nu s-au modificat endpointuri API.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- Comportamentul HTTP, DB și UX rămâne neschimbat.

## Verificare

- Build frontend rulat cu succes: `npm --prefix client run build`.
