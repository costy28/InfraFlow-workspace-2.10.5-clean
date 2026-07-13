# UPDATE 299 — Split flux onboarding/offboarding fișă angajat HR

Versiune: `2.12.279`
Data: `2026-07-13`

## Ce s-a schimbat

- Tabul `Onboarding / Offboarding` din fișa angajatului a fost extras din `HRPage.jsx` în `client/src/pages/modules/hr/HREmployeeWorkflowTab.jsx`.
- Componenta nouă randează:
  - antetul fluxului și acțiunile de reîncărcare/pornire;
  - cardurile de status, progres total și pași obligatorii;
  - bara de progres;
  - lista de pași cu bifare, badge-uri și acțiuni ghidate;
  - acțiunile de finalizare/anulare flux.
- `HRPage.jsx` păstrează state-ul, încărcarea fluxului și handler-ele de pornire, bifare, finalizare și anulare.

## Compatibilitate

- Nu s-au modificat endpointuri HTTP.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- UX-ul rămâne identic; modificarea este strict de mentenanță frontend.

## Verificări

- `npm --prefix client run build` — OK.
