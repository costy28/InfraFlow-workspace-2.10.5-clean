# UPDATE 286 — Split ture si program HR frontend

Versiune: `2.12.266`
Data: `2026-07-12`

## Scop

Continuă reducerea fișierului `client/src/pages/modules/HRPage.jsx` prin extragerea tabului `Ture & Program` într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRShiftsSchedulePanel.jsx`.
- Mutate în componenta dedicată:
  - lista de ture definite;
  - acțiunile de tură nouă, editare și dezactivare;
  - filtrele lună/departament;
  - butonul de actualizare program;
  - matricea zilnică de programare pe angajați;
  - selecția turei pe fiecare zi.
- `HRPage.jsx` păstrează încărcarea datelor, state-ul principal, modalul de editare tură și handler-ele existente.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
