# UPDATE 289 — Split training si evaluari HR frontend

Versiune: `2.12.269`
Data: `2026-07-13`

## Scop

Continuă reducerea fișierului `client/src/pages/modules/HRPage.jsx` prin extragerea tabului `Training & Evaluări` într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRTrainingPanel.jsx`.
- Mutate în componenta dedicată:
  - scadențarul cursurilor obligatorii SSM / PSI / ISCIR;
  - butonul de reîmprospătare pentru datele de training;
  - lista de evaluări ale angajaților;
  - acțiunile de creare, editare și ștergere evaluare.
- `HRPage.jsx` păstrează încărcarea datelor, state-ul principal, modalul de evaluare și handler-ele existente.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
