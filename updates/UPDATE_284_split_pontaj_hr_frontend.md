# UPDATE 284 — Split pontaj HR frontend

Versiune: `2.12.264`
Data: `2026-07-12`

## Scop

Continuă reducerea fișierului `client/src/pages/modules/HRPage.jsx` prin extragerea tabului `Pontaj` într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRTimesheetPanel.jsx`.
- Mutate în componenta dedicată:
  - sumarul lunii/departamentului și termenul limită;
  - acțiunile de completare zile lucrătoare, finalizare, validare și devalidare;
  - exportul Excel al pontajului;
  - butonul de export Nexus;
  - tabelul zilnic de pontaj și celulele editabile.
- `HRPage.jsx` păstrează încărcarea datelor, filtrarea, lock-ul lunii și handler-ele existente.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
