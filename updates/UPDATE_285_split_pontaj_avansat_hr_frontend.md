# UPDATE 285 — Split pontaj avansat HR frontend

Versiune: `2.12.265`
Data: `2026-07-12`

## Scop

Continuă reducerea fișierului `client/src/pages/modules/HRPage.jsx` prin extragerea tabului `Pontaj Avansat` într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRAdvancedTimesheetPanel.jsx`.
- Mutate în componenta dedicată:
  - statusul de închidere/deblocare lună;
  - lista de ore suplimentare în așteptare și acțiunile de aprobare/respingere;
  - controlul săptămânal al timpului de muncă;
  - selectorul de angajat/lună pentru raportul lunar;
  - sumarul de sporuri și tabelul zilnic din raportul lunar;
  - banca de ore și istoricul lunar.
- `HRPage.jsx` păstrează încărcarea datelor, state-ul principal, permisiunile și handler-ele existente.
- Eliminat din `HRPage.jsx` helper-ul de randare pontaj rămas nefolosit după extragere.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`
