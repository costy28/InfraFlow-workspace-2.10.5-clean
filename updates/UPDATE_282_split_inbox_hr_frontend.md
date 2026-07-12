# UPDATE 282 — Split inbox HR frontend

Versiune: `2.12.262`
Data: `2026-07-12`

## Scop

Continuă reducerea fișierului `client/src/pages/modules/HRPage.jsx` prin extragerea panoului `Inbox HR` și a jurnalului operațional HR într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRInboxPanel.jsx`.
- Mutate în componenta dedicată:
  - sumarul Inbox HR;
  - filtrele de sarcini HR;
  - lista sarcinilor operative și acțiunile ghidate;
  - jurnalul operațional HR;
  - filtrele jurnalului și acțiunea de export.
- `HRPage.jsx` păstrează încărcarea datelor, starea și handler-ele existente.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`

