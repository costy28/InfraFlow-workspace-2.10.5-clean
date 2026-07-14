# UPDATE 312 — Split router taburi fișă angajat HR

Versiune: `2.12.292`  
Data: `2026-07-14`

## Scop

Continuă reducerea controlată a fișierului `HRPage.jsx` prin extragerea randării condiționale a taburilor din fișa angajatului într-o componentă React dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HREmployeeProfileTabsRouter.jsx`.
- Mutată rutarea taburilor din modalul `Fișa — [angajat]`:
  - `date`;
  - `contracte`;
  - `pontaj`;
  - `dosar`;
  - `kiosk`;
  - `flux`;
  - `echipamente`.
- `HRPage.jsx` păstrează:
  - state-ul profilului și al fiecărui tab;
  - handler-ele de editare, print, Word, dosar, flux și echipamente;
  - apelurile API deja existente;
  - controlul tabului activ.

## Compatibilitate

- Nu s-au modificat endpointuri API.
- Nu s-au modificat tabele sau migrări DB.
- Nu s-au adăugat dependențe noi.
- Comportamentul HTTP, DB și UX rămâne neschimbat.

## Verificare

- Build frontend rulat cu succes: `npm --prefix client run build`.
