# UPDATE 283 — Split lista angajati HR frontend

Versiune: `2.12.263`
Data: `2026-07-12`

## Scop

Continuă reducerea fișierului `client/src/pages/modules/HRPage.jsx` prin extragerea tabului `Angajați` într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HREmployeesPanel.jsx`.
- Mutate în componenta dedicată:
  - lista/tabelul de angajați;
  - exportul Excel;
  - exportul PDF;
  - badge-ul de sursă import/manual/Autominder;
  - afișarea alertelor vizuale pentru documente/scadențe;
  - statusul activ/inactiv.
- `HRPage.jsx` păstrează filtrarea angajaților, încărcarea datelor și handlerul de deschidere fișă.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`

