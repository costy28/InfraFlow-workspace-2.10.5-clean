# UPDATE 287 — Split modal tura HR frontend

Versiune: `2.12.267`
Data: `2026-07-12`

## Scop

Închide refactorizarea zonei `Ture & Program` prin extragerea modalului de creare/editare tură într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRShiftModal.jsx`.
- Mutate în componenta dedicată:
  - titlul modalului în funcție de creare/editare;
  - câmpurile nume tură, oră start, oră sfârșit, ore normale și culoare;
  - butoanele `Renunță` și `Salvează`.
- `HRPage.jsx` păstrează state-ul, resetarea formularului și handler-ul `createShift`.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
