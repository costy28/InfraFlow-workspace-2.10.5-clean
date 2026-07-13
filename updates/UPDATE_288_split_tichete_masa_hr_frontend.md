# UPDATE 288 — Split tichete masa HR frontend

Versiune: `2.12.268`
Data: `2026-07-13`

## Scop

Continuă reducerea fișierului `client/src/pages/modules/HRPage.jsx` prin extragerea tabului `Tichete masă` într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRMealTicketsPanel.jsx`.
- Mutate în componenta dedicată:
  - configurarea valorii tichetului;
  - filtrele lună/departament;
  - butonul de export CSV furnizor;
  - tabelul cu zile lucrate, zile CO, zile CM, tichete și valoare;
  - totalurile de tichete și valoare.
- `HRPage.jsx` păstrează încărcarea datelor, state-ul principal și handler-ele existente.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
