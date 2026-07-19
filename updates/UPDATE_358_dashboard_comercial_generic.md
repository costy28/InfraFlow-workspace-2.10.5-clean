# UPDATE 358 — Dashboard comercial generic

Versiune: `2.12.338`  
Data: `2026-07-19`

## Context

InfraFlow devine produs comercial general, configurabil pe module și industrii. Prima pagină încă păstra texte vizibile care poziționau aplicația prioritar ca soluție pentru stație de asfalt.

## Implementare

- `client/src/pages/DashboardPage.jsx`
  - subtitlul dashboardului a fost generalizat pentru operațiuni, stocuri, echipe, flotă și documente;
  - KPI-ul `Tone asfalt azi` a devenit `Output operațional azi`;
  - `Status șantiere` a devenit `Proiecte / lucrări active`;
  - mesajul empty-state pentru proiecte este generic;
  - `Grafic producție ultimele 7 zile` a devenit `Grafic output operațional ultimele 7 zile`.

- `client/src/components/layout/Sidebar.jsx`
  - subtitlul produsului din sidebar a devenit `ERP modular`.

## Compatibilitate

- Nu modifică API-uri.
- Nu necesită migrare DB.
- Metricul intern existent rămâne folosit pentru compatibilitate, dar eticheta vizibilă este generică.

## Verificare

- `rg` pe dashboard/sidebar pentru etichetele vechi vizibile;
- `npm run build`;
- `npm run release:check`;
- `npm run test:smoke`;
- `npm run audit:local`.
