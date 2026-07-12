# UPDATE 281 — Split dashboard HR frontend

Versiune: `2.12.261`
Data: `2026-07-12`

## Scop

Continuă reducerea fișierului mare `client/src/pages/modules/HRPage.jsx` prin extragerea panoului `Dashboard HR` într-o componentă dedicată.

## Modificări

- Adăugat `client/src/pages/modules/hr/HRDashboardPanel.jsx`.
- Mutate în componenta dedicată:
  - KPI-urile principale HR;
  - raportul de management HR;
  - cererile de concediu în așteptare;
  - scadențele HR avansate;
  - istoricul notificărilor de scadențe.
- `HRPage.jsx` păstrează încărcarea datelor, starea și handler-ele existente, dar randează dashboard-ul prin componenta nouă.

## Compatibilitate

- Endpointurile HTTP rămân neschimbate.
- UX-ul existent rămâne neschimbat.
- Nu s-au adăugat dependențe noi.
- Nu s-au modificat tabele sau migrări DB.

## Verificări

- `npm --prefix client run build`
- `npm run audit:local`

